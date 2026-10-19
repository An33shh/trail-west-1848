# Publishing runbook

Goal: public GitHub repo, GitHub Pages site, and a Netlify production deploy.

## One-time setup on your machine

```
gh auth login                    # GitHub CLI, choose HTTPS, allow repo + workflow scopes
npm install -g netlify-cli
netlify login                    # opens the browser once
```

## Publish

```
bash tools/publish.sh
```

Optional overrides:

```
REPO_NAME=trail-west-1848 SITE_NAME=trail-west-1848 NETLIFY_TEAM=<team-slug> bash tools/publish.sh
```

What it does, in order:

1. `node tools/build.js`, then `node test/sim.js 100 steady`. Commits a rebuilt `dist/` if it changed.
2. Creates `<you>/trail-west-1848` as a public repo with `origin` set and pushes `main`. If the repo already exists, it just pushes.
3. Turns on GitHub Pages with the Actions build (`.github/workflows/pages.yml`) and starts a run.
4. Creates a Netlify site named `trail-west-1848` (links this folder through `.netlify/`, which is gitignored), then deploys `dist/` to production.
5. Sets the GitHub repo's homepage to the Netlify URL and prints all three links.

Rerunning is safe. It reuses the repo, the Pages setup and the linked Netlify site.

## If something fails

| Symptom | Fix |
|---|---|
| `Run: gh auth login` | Log in, then rerun. |
| `sites:create` fails or says the name is taken | `SITE_NAME=trail-west-1848-<suffix> bash tools/publish.sh` |
| Netlify asks which team | Rerun with `NETLIFY_TEAM=<slug>` (find it with `netlify teams:list` or in the Netlify URL). |
| Pages API returns 403/404 | The token lacks `repo`/`workflow` scope: `gh auth refresh -s repo,workflow`, rerun. |
| Pages run fails on `deploy-pages` | Repo Settings, Pages, Source must be "GitHub Actions". Then `gh workflow run pages.yml`. |

## Optional: Netlify deploys on every push

Instead of CLI deploys, in the Netlify UI: Site configuration, Build & deploy, Link repository, pick the GitHub repo. `netlify.toml` already sets the publish folder to `dist` with no build command.

## Before you push

- Commit author email is the GitHub noreply address. Keep it that way: `git config user.email` in this repo is already set.
- No original MECC or HMH files are in the repo. Keep it that way (see README, clean-room rules).
