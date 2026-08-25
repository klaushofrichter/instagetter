#!/usr/bin/env bash
#
# Did last night's extraction run, and did it come from cron?
# Read-only: prints evidence, changes nothing.
set -uo pipefail

PROJECT="$HOME/Development/instagetter"
cd "$PROJECT" || exit 1
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v26.3.1/bin:/usr/local/bin:/usr/bin:/bin"
export AWS_SHARED_CREDENTIALS_FILE="$HOME/Development/kubesetup/credentials-insta"
set -a; . "$PROJECT/.env"; set +a

echo "=== 1. cron entry ==="
crontab -l 2>/dev/null | grep nightly-extract || echo "  NOT INSTALLED"

echo
echo "=== 2. log from last night ==="
LATEST=$(ls -t logs/nightly-*.log 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "  no log at all — the job never started (machine asleep? cron not running?)"
else
  echo "  $LATEST"
  grep -E '^=== .* (starting|finished)' "$LATEST" | sed 's/^/  /'
  echo "  --- last 12 lines ---"
  tail -12 "$LATEST" | sed 's/^/  /'
fi

echo
echo "=== 3. recorded state (attribution) ==="
node scripts/state.js 2>&1 | sed 's/^/  /'

echo
echo "=== 4. newest objects in S3, by upload time ==="
aws s3 ls "s3://$S3_BUCKET/images/" --recursive 2>/dev/null \
  | sort -k1,2 | tail -5 | sed 's/^/  /'
echo "  total image objects: $(aws s3 ls "s3://$S3_BUCKET/images/" --recursive 2>/dev/null | wc -l)"

echo
echo "=== 5. what the live site is serving ==="
curl -s https://insta.skylar.technology/api/images 2>/dev/null | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print('  images:', len(d['images']), '| last refresh:', d.get('lastRefresh'))
except Exception as e:
    print('  could not read:', e)"

echo
echo "Verdict: a cron run shows lastRunSource=cron with a lastRun timestamp"
echo "just after 02:48, and S3 upload times in the same window."
