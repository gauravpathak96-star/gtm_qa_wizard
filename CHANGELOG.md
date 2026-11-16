# Changelog

Every change adds an entry here, newest first.

## 2026-11-16 · Step 1: project, install and the gtm-qa command

- New project, replacing the GTM Journey Tester's Claude-run checks: a Playwright script runs every check, so every check does the same steps. Claude is optional (site recipes, explaining reports) and never runs a check.
- `gtm-qa` command:
  - `new` creates a release file;
  - `list` shows releases and progress;
  - `check` validates a release file;
  - `check-setup` checks Python, Playwright and Chromium.
  - `run` and `report` arrive in steps 2 and 3.
- Release files (`releases/<release>.toml`) replace the tester page's form. They have about 8 fields, and only the site, homepage and preview link are needed. They're git-ignored because preview links give workspace access; `releases/example.toml` shows the format.
- Values a run works out itself, such as the product the first check tested, go in `runs/<release>/state.json`, so release files are never rewritten.
- Setup uses `uv` and its own Python 3.12 with `--native-tls`, the method that works with Aikido on company Macs.
- `sites/lookfantastic.json` was copied from the GTM Journey Tester for development, and now has a Reject all selector for the opt-out journey (not yet verified on the site).
- `runs/`, real release files and `tests/fixtures/` are git-ignored, because they hold client data and preview links.
