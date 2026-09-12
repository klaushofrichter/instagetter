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
# Stamped into state.json by --record so the run can be attributed to cron.
export INSTAGETTER_RUN_SOURCE=cron
set -a; . "$PROJECT/.env"; set +a

echo "=== $(date -Is) starting nightly extraction ===" >> "$LOG"

# Remember where the state stood, so a run that changed nothing can be told
# apart from one that worked. Exit 0 with an empty result is worse than a
# failure: it looks fine in every log and metric.
#
# Read the COUNTS, not just lastRun. Comparing lastRun alone was defeated on
# 2026-09-12: the browser was logged out of Instagram, the run correctly
# extracted nothing and said so -- then called `state.js --record 0 0`, which
# updates lastRun. The timestamp moved, the guard saw a change, and a run that
# its own summary called a failure exited 0.
state_counts() {
  node scripts/state.js 2>/dev/null | python3 -c 'import json,sys
d = json.load(sys.stdin)
print(d.get("lastNewCount", 0) + d.get("lastBackfillCount", 0))' 2>/dev/null || echo ""
}
BEFORE=$(node scripts/state.js 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin).get("lastRun",""))' 2>/dev/null || true)

# --chrome is what makes the Claude-in-Chrome tools exist in a headless run.
# Without it the browser tools are simply absent and the run does nothing.
# stream-json plus the formatter means the log narrates the run live. Buffered
# output made a twelve-minute extraction indistinguishable from a hang.
# Opus, measured rather than assumed. Sonnet 5 was tried on 2026-08-27 and cost
# MORE ($3.81 vs $3.32) despite lower rates: it needed 150 turns against 67, and
# each extra turn re-reads the cached context. See CLAUDE.md — the token mix is
# model-dependent, so cheaper rates do not mean cheaper runs for an agentic loop.
# Default effort, deliberately: --effort low was measured on 2026-08-28 and made
# it worse, 88 turns against 67. Turn count is what drives consumption here, so
# the number to watch in the log is turns.
timeout 3600 claude -p --chrome --model opus --output-format stream-json --verbose "/extract-instagram

Nightly run. Phase 1: check the top of the klaushofrichter profile for posts newer than what is already in S3, and extract any found. Phase 2: backfill 12 older posts starting from the backfillCursor in state.json, completing any carousel in full even if that exceeds 12. Skip videos and reels, recording each with scripts/state.js --skip. Verify every download on disk before staging. Upload to S3, move the cursor with scripts/state.js --set-cursor, record counts with scripts/state.js --record, then refresh the live service exactly as step 8 of the skill specifies (curl -fsSL -X POST, all flags required) and report the total/added counts it returns -- a non-zero curl exit means the run failed, not succeeded. Finish with a one-paragraph summary of what was added, or why nothing was." \
  --allowed-tools \
    "Bash" \
    "Read" \
    "Write" \
    "ToolSearch" \
    "mcp__claude-in-chrome__navigate" \
    "mcp__claude-in-chrome__javascript_tool" \
    "mcp__claude-in-chrome__computer" \
    "mcp__claude-in-chrome__tabs_context_mcp" \
    "mcp__claude-in-chrome__tabs_create_mcp" \
    "mcp__claude-in-chrome__tabs_close_mcp" \
    "mcp__claude-in-chrome__read_console_messages" \
    "mcp__claude-in-chrome__select_browser" \
    "mcp__claude-in-chrome__list_connected_browsers" \
  2>&1 | python3 "$PROJECT/scripts/format-stream.py" >> "$LOG"

# The claude exit code, not the formatter's.
STATUS=${PIPESTATUS[0]}

AFTER=$(node scripts/state.js 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin).get("lastRun",""))' 2>/dev/null || true)
ADDED=$(state_counts)
if [ "$STATUS" -eq 0 ] && [ "$BEFORE" = "$AFTER" ]; then
  echo "NO-OP: the run reported success but recorded nothing — state.json is unchanged." >> "$LOG"
  echo "       Nothing was extracted. See the transcript above for why." >> "$LOG"
  STATUS=2
elif [ "$STATUS" -eq 0 ] && [ "${ADDED:-0}" = "0" ]; then
  # A recorded run of 0 new + 0 backfilled. Phase 2 takes 12 a night and the
  # archive is nowhere near exhausted, so this is a failure wearing a
  # timestamp -- most likely the browser is logged out of Instagram, which
  # still renders the public profile and so passes Phase 1.
  echo "NO-OP: the run recorded 0 new and 0 backfilled posts." >> "$LOG"
  echo "       Check whether the local Chrome is still logged in to Instagram." >> "$LOG"
  STATUS=2
fi

echo "=== $(date -Is) finished, exit $STATUS ===" >> "$LOG"

# Keep a fortnight of logs.
find "$LOG_DIR" -name 'nightly-*.log' -mtime +14 -delete 2>/dev/null

exit "$STATUS"
