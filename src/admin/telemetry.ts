import { prisma } from '../db/client.js';

export interface ScannerFreshness {
  lastScanAt: Date | null;
  ageSeconds: number | null;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

export interface SystemTelemetry {
  scanner: ScannerFreshness;
  queueBacklog: number;
  activeIncidents: number;
  recentIncidents24h: number;
  totalUsers: number;
  totalChecks: number;
  totalChannels: number;
  recentPings24h: number;
}

/**
 * Aggregates operational telemetry for the admin console (ADM-03).
 */
export async function getSystemTelemetry(now = new Date()): Promise<SystemTelemetry> {
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  const [
    lastScanState,
    queueBacklog,
    activeIncidents,
    recentIncidents24h,
    totalUsers,
    totalChecks,
    totalChannels,
    recentPings24h,
  ] = await Promise.all([
    prisma.systemState.findUnique({ where: { key: 'last_scan_at' } }),
    prisma.alert.count({ where: { status: 'PENDING' } }),
    prisma.incident.count({ where: { resolvedAt: null } }),
    prisma.incident.count({ where: { startedAt: { gte: twentyFourHoursAgo } } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.check.count(),
    prisma.channel.count(),
    prisma.ping.count({ where: { ts: { gte: twentyFourHoursAgo } } }),
  ]);

  let scannerFreshness: ScannerFreshness;
  if (!lastScanState) {
    scannerFreshness = {
      lastScanAt: null,
      ageSeconds: null,
      status: 'CRITICAL',
    };
  } else {
    const scanDate = new Date(lastScanState.value);
    const ageSeconds = Math.max(0, Math.floor((now.getTime() - scanDate.getTime()) / 1000));
    let status: ScannerFreshness['status'] = 'HEALTHY';
    if (ageSeconds > 180) {
      status = 'CRITICAL';
    } else if (ageSeconds > 90) {
      status = 'DEGRADED';
    }

    scannerFreshness = {
      lastScanAt: scanDate,
      ageSeconds,
      status,
    };
  }

  return {
    scanner: scannerFreshness,
    queueBacklog,
    activeIncidents,
    recentIncidents24h,
    totalUsers,
    totalChecks,
    totalChannels,
    recentPings24h,
  };
}
