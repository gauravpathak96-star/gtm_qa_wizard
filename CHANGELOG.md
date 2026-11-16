# Changelog

Every change adds an entry here, newest first.

## 2026-11-16 · Likely cause, key values and noise events

- **Likely cause:** with container exports loaded, every failed row names the tag of that vendor whose job matches the event that broke. It shows the old and new names, the trigger before and after, and the settings that changed. On MYP_NC it names "Pinterest - Search → Pinterest - Pixel - Search", "Tiktok - Search → TikTok - cHTML - Search" (trigger moved from view_item_list to elysiumEvent on /search/) and the new "GA4 - Event - Organic Search Visit".
- **Key values:**
  - At the end of every step the runner records the value GTM holds for each top-level dataLayer key, i.e. what a Data Layer Variable reads.
  - The report compares them with the tester page's Key variables rules: value, price, currency, items, IDs and consent must match, and session values are only checked for being lost. These rules are copied unchanged into `engine.js`.
  - Values that broke are listed as failures with Live and Preview side by side.
- **Noise events:**
  - Recipes can list `noise_events`, which are left out of the comparison and shown under "Not compared".
  - After a noise test, `gtm-qa report` names the events that differed between two identical runs and suggests adding them.
  - LookFantastic's chat icon impression (`GA4:ring_icon_viewed`) is the first entry.
  - Tests: MYP_NC 3 failed of 123 (unchanged); LookFantastic noise test 0 failed of 142.
- **Tag Assistant:** it opens in the tool's own Playwright browser without a sign-in, so no remote debugging of your Chrome is needed. Without a Share preview link it doesn't give access to the container. Reading tags and variables from it comes next, once a real Share link is available to build against.

## 2026-11-16 · Steps 2 and 3: the runner and the report

- **`gtm-qa run <release> live|preview`** runs every brand of the release in a Playwright browser:
  - two journeys per brand, opt-in (Accept all) and opt-out (Reject all), each in a fresh browser context, so each starts as a new visitor;
  - the steps are Before consent → Home → the site recipe (Category, Product, Add to basket, Basket, Checkout), with a fixed 8 s wait after each, and never an order;
  - progress prints per step;
  - options: `--only` re-runs some brands, `--headed` shows the browser, and `--without-workspace` runs a noise test (Live compared with Live).
- **What a run records:**
  - Every request is captured per step, including events inside request bodies, and grouped by the same capture script as before (`gtm_qa_wizard/capture/qa-capture.js`, capture standard v4).
  - Results go to `runs/<release>/<brand>/<check>/results.json`, with a screenshot for each step.
- **Preview:** the brand's Share preview link (`gtm_auth`, `gtm_preview`) is added to that container's `gtm.js` request. The run warns when a preview container never loaded.
- **Same product in every check:** the first check's product is saved in `runs/<release>/state.json` and clicked on the category page in every later check.
- **Consent:** if a banner has no Reject button, opt-out uses OneTrust's Cookie settings › Reject All (LookFantastic needs this).
- **Release files hold several brands** (`[[brands]]`), each with its own preview links and optional container exports. `gtm-qa new --sites a,b` creates them. Recipes now carry the site's homepage (`url`) and optionally `product_index`.
- **`gtm-qa report <release>`** writes `runs/<release>/report.html`: one summary across brands and a section per brand. It prints the result per brand in the terminal and opens the file.
  - The comparison runs inside the report, using the rules proven on the GTM Journey Tester page, copied unchanged into `gtm_qa_wizard/report/engine.js`. Only small stand-ins for the old page were added.
  - With container exports, renamed and re-created tags are paired, and removed/added tags and settings changes are listed.
- **Tested:**
  - `tests/test_report.py` reproduces MYP_NC: 3 failed of 123 checked. The data is kept outside git.
  - A LookFantastic noise test (Live vs Live, both journeys, all 14 steps completed) gave 0 failed of 142 checked.
- Added `sites/_template.json`; the README covers the run, Preview, results and noise test.

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
