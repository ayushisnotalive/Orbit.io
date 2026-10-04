#!/bin/sh
# orbitping: run a command and report start/finish/exit code to OrbitPing.
# Usage: orbitping run [--rid] <uuid> -- <command...>
#        orbitping install <uuid>
HOST="${ORBITPING_HOST:-http://localhost:3000}"
CURL="curl -fsS -m 10 --retry 3 -o /dev/null"

gen_rid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N; }

cmd="$1"; shift
case "$cmd" in
  run)
    RID=""
    if [ "$1" = "--rid" ]; then RID="$(gen_rid)"; shift; fi
    UUID="$1"; shift
    [ "$1" = "--" ] && shift
    [ -z "$UUID" ] || [ $# -eq 0 ] && { echo "usage: orbitping run [--rid] <uuid> -- <cmd...>" >&2; exit 64; }
    Q=""; [ -n "$RID" ] && Q="?rid=$RID"
    $CURL "$HOST/$UUID/start$Q" || true
    TMP="$(mktemp)"
    "$@" >"$TMP" 2>&1          # capture output; keeps the real exit status
    STATUS=$?
    cat "$TMP"                 # still show output to cron/mail/log
    TAIL="$(tail -c 256 "$TMP")"
    rm -f "$TMP"
    $CURL --data-binary "$TAIL" "$HOST/$UUID/$STATUS$Q" || true
    exit "$STATUS"
    ;;
  install)
    echo "Add this line to your crontab (crontab -e):"
    echo "0 2 * * * orbitping run $1 -- /path/to/your/job.sh"
    ;;
  *) echo "usage: orbitping run|install ..." >&2; exit 64 ;;
esac
