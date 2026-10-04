import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../lib/errors.js';
import { CONSTANTS } from '../config/constants.js';

/**
 * Converts a dotted-quad IPv4 string to a 32-bit unsigned integer.
 */
function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

/**
 * IPv4 CIDR blocks reserved for private, loopback, link-local, and special purposes.
 */
const BLOCKED_IPV4_CIDRS: [number, number][] = [
  [ipv4ToUint32('0.0.0.0'), 8], // 0.0.0.0/8 (Broadcast/Current network)
  [ipv4ToUint32('10.0.0.0'), 8], // 10.0.0.0/8 (RFC 1918 Private)
  [ipv4ToUint32('100.64.0.0'), 10], // 100.64.0.0/10 (RFC 6598 Shared Carrier NAT)
  [ipv4ToUint32('127.0.0.0'), 8], // 127.0.0.0/8 (RFC 1122 Loopback)
  [ipv4ToUint32('169.254.0.0'), 16], // 169.254.0.0/16 (RFC 3927 Link Local & Cloud Metadata)
  [ipv4ToUint32('172.16.0.0'), 12], // 172.16.0.0/12 (RFC 1918 Private)
  [ipv4ToUint32('192.0.0.0'), 24], // 192.0.0.0/24 (IETF Protocol Assignments)
  [ipv4ToUint32('192.0.2.0'), 24], // 192.0.2.0/24 (TEST-NET-1)
  [ipv4ToUint32('192.88.99.0'), 24], // 192.88.99.0/24 (6to4 Relay Anycast)
  [ipv4ToUint32('192.168.0.0'), 16], // 192.168.0.0/16 (RFC 1918 Private)
  [ipv4ToUint32('198.18.0.0'), 15], // 198.18.0.0/15 (Benchmarking)
  [ipv4ToUint32('198.51.100.0'), 24], // 198.51.100.0/24 (TEST-NET-2)
  [ipv4ToUint32('203.0.113.0'), 24], // 203.0.113.0/24 (TEST-NET-3)
  [ipv4ToUint32('224.0.0.0'), 4], // 224.0.0.0/4 (Multicast)
  [ipv4ToUint32('240.0.0.0'), 4], // 240.0.0.0/4 (Reserved)
  [ipv4ToUint32('255.255.255.255'), 32], // 255.255.255.255/32 (Broadcast)
];

/**
 * Known internal service and dangerous ports blocked for outbound webhooks to prevent port scanning.
 */
const BLOCKED_PORTS = new Set([
  20, 21,    // FTP
  22,        // SSH
  23,        // Telnet
  25,        // SMTP
  53,        // DNS
  69,        // TFTP
  110, 995,  // POP3
  111,       // RPC
  135, 137, 138, 139, 445, // NetBIOS / SMB
  143, 993,  // IMAP
  161, 162,  // SNMP
  389, 636,  // LDAP
  1433, 1434, // MS SQL
  1521,      // Oracle DB
  2049,      // NFS
  2375, 2376, // Docker daemon
  3306,      // MySQL
  3389,      // RDP
  5432, 5433, // PostgreSQL
  5900, 5901, // VNC
  6379,      // Redis
  9200, 9300, // Elasticsearch
  11211,     // Memcached
  27017, 27018, // MongoDB
]);

/**
 * Checks whether an IPv4 address falls within any blocked private or special CIDR range.
 */
function isPrivateIpv4(ip: string): boolean {
  const num = ipv4ToUint32(ip);
  for (const [base, bits] of BLOCKED_IPV4_CIDRS) {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((num & mask) === (base & mask)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether an IPv6 address is in a private, loopback, or reserved range.
 */
function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback and unspecified
  if (normalized === '::1' || normalized === '::') {
    return true;
  }

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateIpv4(v4Part);
    }
    return true; // Malformed or hex IPv4-mapped
  }

  // Unique local addresses (fc00::/7 -> starts with fc or fd)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // Link-local unicast (fe80::/10 -> starts with fe8, fe9, fea, feb)
  if (/^fe[89ab]/i.test(normalized)) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith('ff')) {
    return true;
  }

  // Discard prefix (100::/64)
  if (normalized.startsWith('100:')) {
    return true;
  }

  // Documentation (2001:db8::/32)
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether an IP address (IPv4 or IPv6) is private or reserved (D-10).
 */
export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    return isPrivateIpv4(ip);
  }
  if (family === 6) {
    return isPrivateIpv6(ip);
  }
  return true; // Treat invalid/unrecognized formats as private/unsafe
}

/**
 * Validates a destination URL against SSRF vulnerabilities (D-09, D-10, D-12).
 * Inspects protocol, hostnames, and all resolved DNS A and AAAA records.
 */
export async function validateSafeUrl(
  urlString: string,
): Promise<{ valid: boolean; reason?: string; ips?: string[] }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, reason: `Disallowed protocol: '${url.protocol}'. Only http: and https: are allowed.` };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (!hostname || hostname === 'localhost') {
    return { valid: false, reason: 'Blocked target: localhost' };
  }

  // Validate port if explicitly specified
  if (url.port) {
    const portNum = parseInt(url.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, reason: `Invalid port number: '${url.port}'` };
    }
    if (BLOCKED_PORTS.has(portNum)) {
      return { valid: false, reason: `Blocked destination port: ${portNum}` };
    }
  }

  // Check if hostname is already a direct IP
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { valid: false, reason: `Blocked destination IP address: ${hostname}`, ips: [hostname] };
    }
    return { valid: true, ips: [hostname] };
  }

  // Resolve hostname across both IPv4 and IPv6 records (D-09)
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, reason: `DNS lookup failed for hostname '${hostname}'` };
    }

    const resolvedIps = addresses.map((entry) => entry.address);

    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        return { valid: false, reason: `Hostname '${hostname}' resolved to blocked IP address: ${ip}`, ips: resolvedIps };
      }
    }

    return { valid: true, ips: resolvedIps };
  } catch (err) {
    return { valid: false, reason: `DNS lookup error: ${(err as Error).message}` };
  }
}

/**
 * Safe fetch wrapper that guards against SSRF, redirects, and hanging requests (D-11, D-12).
 * Enforces 5000ms timeout and redirect: 'error'.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const check = await validateSafeUrl(url);
  if (!check.valid) {
    throw new AppError('invalid_input', `SSRF Defense blocked destination URL: ${check.reason}`, undefined, {
      field: 'url',
      details: { reason: check.reason, ips: check.ips },
    });
  }

  const timeoutMs = CONSTANTS.ALERT_SEND_TIMEOUT_MS || 5000;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  let combinedSignal = timeoutSignal;
  if (init?.signal) {
    combinedSignal = AbortSignal.any([init.signal, timeoutSignal]);
  }

  const fetchOptions: RequestInit = {
    ...init,
    redirect: 'error', // D-11: Strictly disallow 3xx redirects to prevent SSRF bypass
    signal: combinedSignal,
  };

  return fetch(url, fetchOptions);
}
