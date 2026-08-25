#!/usr/bin/env bash
#
# Nightly Instagram extraction, run from cron at 02:48 CT.
#
# Cron provides almost no environment, so everything is explicit: node lives
# under nvm and claude under ~/.local/bin, neither on cron's default PATH.
#
# Tool authority is a named allowlist rather than a blanket bypass, so the
# user's own settings and hooks still apply and nothing outside this list can
# run unprompted.
set -uo pipefail

export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v26.3.1/bin:/usr/local/bin:/usr/bin:/bin"
PROJECT="$HOME/Development/instagetter"
LOG_DIR="$PROJECT/logs"
LOCK="$LOG_DIR/nightly.lock"

cd "$PROJECT" || exit 1
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/nightly-$(date +%F).log"

# One run at a time: a slow night must not overlap the next.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Is) another run still in progress - skipping" >> "$LOG"
  exit 0
fi

# Keys from the shared credentials file, bucket/region from .env.
export AWS_SHARED_CREDENTIALS_FILE="$HOME/Development/kubesetup/credentials-insta"
set -a; . "$PROJECT/.env"; set +a

echo "=== $(date -Is) starting nightly extraction ===" >> "$LOG"

timeout 3600 claude -p "/extract-instagram

Nightly run. Phase 1: check the top of the klaushofrichter profile for posts newer than what is already in S3, and extract any found. Phase 2: backfill 12 older posts starting from the backfillCursor in state.json, completing any carousel in full even if that exceeds 12. Skip videos and reels, recording each with scripts/state.js --skip. Verify every download on disk before staging. Upload to S3, move the cursor with scripts/state.js --set-cursor, record counts with scripts/state.js --record, then POST to https://insta.skylar.technology/api/refresh. Finish with a one-paragraph summary of what was added, or why nothing was." \
  --allowed-tools \
    "Bash" \
    "Read" \
    "Write" \
    "mcp__claude-in-chrome__navigate" \
    "mcp__claude-in-chrome__javascript_tool" \
    "mcp__claude-in-chrome__computer" \
    "mcp__claude-in-chrome__tabs_context_mcp" \
    "mcp__claude-in-chrome__tabs_create_mcp" \
    "mcp__claude-in-chrome__tabs_close_mcp" \
    "mcp__claude-in-chrome__read_console_messages" \
  >> "$LOG" 2>&1

STATUS=$?
echo "=== $(date -Is) finished, exit $STATUS ===" >> "$LOG"

# Keep a fortnight of logs.
find "$LOG_DIR" -name 'nightly-*.log' -mtime +14 -delete 2>/dev/null

exit "$STATUS"
