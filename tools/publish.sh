#!/usr/bin/env bash
# Publishes Trail West 1848:
#   1. builds dist/ and runs the balance sim
#   2. creates the public GitHub repo (or reuses it) and pushes main
#   3. turns on GitHub Pages (workflow build) and starts a run
#   4. creates or reuses a Netlify site and deploys dist/ to production
#   5. sets the GitHub repo homepage to the Netlify URL
#
# Needs: git, node, gh (logged in: gh auth login), netlify-cli (logged in: netlify login)
# Optional env: REPO_NAME (default trail-west-1848), SITE_NAME (default trail-west-1848),
#               NETLIFY_TEAM (team slug, needed only if your Netlify account has several teams)
set -euo pipefail

REPO_NAME="${REPO_NAME:-trail-west-1848}"
SITE_NAME="${SITE_NAME:-trail-west-1848}"
DESCRIPTION="Green-screen browser remake of the 1985 Oregon Trail. Clean-room, unofficial fan project."

cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1. $2" >&2; exit 1; }; }
need git "Install git."
need node "Install Node 18 or newer."
need gh "Install the GitHub CLI: https://cli.github.com"
need netlify "Install the Netlify CLI: npm install -g netlify-cli"

gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login" >&2; exit 1; }

echo "== Build and test"
node tools/build.js
node test/sim.js 100 steady >/dev/null
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "Rebuild dist before publishing"
fi

OWNER="$(gh api user --jq .login)"
FULL="$OWNER/$REPO_NAME"

echo "== GitHub: $FULL"
if gh repo view "$FULL" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$FULL.git"
  git push -u origin main
else
  gh repo create "$REPO_NAME" --public --description "$DESCRIPTION" --source=. --remote=origin --push
fi
gh repo edit "$FULL" --visibility public --accept-visibility-change-consequences >/dev/null 2>&1 || true

echo "== GitHub Pages"
if ! gh api -X POST "repos/$FULL/pages" -f build_type=workflow >/dev/null 2>&1; then
  gh api -X PUT "repos/$FULL/pages" -f build_type=workflow >/dev/null
fi
# The push above may have run before Pages existed, so start a fresh run.
gh workflow run pages.yml -R "$FULL" >/dev/null 2>&1 || true

echo "== Netlify: $SITE_NAME"
if [ ! -f .netlify/state.json ]; then
  TEAM_ARGS=()
  [ -n "${NETLIFY_TEAM:-}" ] && TEAM_ARGS=(--account-slug "$NETLIFY_TEAM")
  if ! netlify sites:create --name "$SITE_NAME" "${TEAM_ARGS[@]}"; then
    echo "Site name '$SITE_NAME' may be taken. Rerun with SITE_NAME=<another-name>." >&2
    exit 1
  fi
fi
DEPLOY_JSON="$(netlify deploy --prod --dir dist --message "Publish $(git rev-parse --short HEAD)" --json)"
SITE_URL="$(printf '%s' "$DEPLOY_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.url||j.deploy_url||"")})')"

if [ -n "$SITE_URL" ]; then
  gh repo edit "$FULL" --homepage "$SITE_URL" >/dev/null
fi

echo
echo "GitHub repo:   https://github.com/$FULL"
echo "GitHub Pages:  https://$(echo "$OWNER" | tr '[:upper:]' '[:lower:]').github.io/$REPO_NAME/  (live after the Actions run finishes)"
echo "Netlify:       ${SITE_URL:-see netlify output above}"
