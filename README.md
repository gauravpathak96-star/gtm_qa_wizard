# gtm-qa-wizard

Regression tests for GTM releases. The same scripted shopping journey runs twice on each brand: once on the **Live** container and once with your **unpublished workspace** loaded (**Preview**). The two runs are then compared step by step, vendor by vendor. A row fails only when tracking actually breaks; renamed tags and timing noise never fail.

A script (Playwright) runs every check in its own browser, so every check does exactly the same steps. You start it from a terminal. Claude is optional: it can help build a site recipe or explain a report, but it never runs a check.

## How it works

```
gtm-qa new <release> --sites a,b   create releases/<release>.toml (one block per brand) and fill it in
gtm-qa run <release> live          every brand on its Live container, before your change
gtm-qa run <release> preview       every brand with your workspace loaded through its Share preview link
gtm-qa report <release>            compare the two and open report.html
```

**Every check runs two journeys per brand,** each in a brand-new browser (a fresh visitor with no cookies):

- **Opt-in:** Accept all on the cookie banner.
- **Opt-out:** Reject all. If the banner has no Reject button, the check uses Cookie settings › Reject All.

**The steps:**

1. **Before consent:** the homepage, with the banner left alone.
2. **Home:** the consent click.
3. **Category, Product, Add to basket, Basket, Checkout.** The product tile is clicked on the category page, not opened by URL.

There's a fixed 8-second wait after each step. No order is ever placed.

**What it records at every step:**

- every request the page sends to a vendor, including events inside request bodies (batched GA4, Meta form data, TikTok JSON);
- dataLayer events, the Google consent state, cookies, the GTM containers that loaded, and a screenshot.

The terminal prints each step as it runs.

**How Preview works:** your GTM Share preview link contains two codes, `gtm_auth` and `gtm_preview`. In the preview check, whenever the site asks Google for that container's `gtm.js`, the tool adds those codes to the request. Google then serves your unpublished workspace instead of the live version, with no Google sign-in and no Tag Assistant. The report shows which version loaded, for example `GTM-TLLKQLXB (PREVIEW env-5824)`.

**Results:**

- `runs/<release>/<brand>/<live|preview>/results.json` and `screenshots/`, one set per check.
- `runs/<release>/report.html`, a single file you open in any browser. It contains:
  - a summary per brand;
  - the failed rows, with the evidence on each side and the reason;
  - a "Passed" list you can expand;
  - lists of tags removed or added and settings changes, when container exports are given.

  The first check's product is reused by the second, so both test the same item.

## Setup (once per computer)

Company Macs inspect downloads with Aikido, and the built-in macOS Python can't read its certificates. So setup uses `uv`, which installs its own Python and uses the Mac's certificate store. If `uv` isn't installed, ask IT.

```
git clone git@github.com:gauravpathak96-star/gtm_qa_wizard.git
cd gtm_qa_wizard
uv sync --native-tls
uv run playwright install chromium
uv run gtm-qa check-setup
```

`check-setup` should end with "Ready to run tests". Never get around a certificate error by switching off certificate checks. If Aikido blocks a package, use **Request Access** in the Aikido app.

## Testing a release

1. Create the release file, one brand per site recipe:
   ```
   uv run gtm-qa new thg-consent-fix --sites myprotein,lookfantastic
   ```
2. Open `releases/thg-consent-fix.toml` and fill it in:
   - your name;
   - for each brand, the GTM Share preview link (GTM › Preview › Tag Assistant › ⋮ › Share). Every brand has its own container, so each needs its own link.
3. Check it, then run both checks and the report:
   ```
   uv run gtm-qa check thg-consent-fix
   uv run gtm-qa run thg-consent-fix live
   uv run gtm-qa run thg-consent-fix preview
   uv run gtm-qa report thg-consent-fix
   ```

Useful options:

- `--only myprotein` re-runs one brand.
- `--headed` shows the browser window while it runs.
- `uv run gtm-qa list` shows every release and how far it has got.

Each brand takes about 2 minutes per check, so 6 brands take about 25 minutes for both checks.

### Noise test: how far to trust a report

```
uv run gtm-qa run <release> preview --without-workspace
```

This runs the preview check on the live container, so the report compares Live with Live. Anything that fails there is noise, not a break. On LookFantastic it gave 0 failed of 142 checked.

### Optional: container exports

To pair renamed and re-created tags and to list settings changes, add each brand's exports to the release file:

- `exports_before`: the live version export (GTM › Versions › the live version › Export).
- `exports_after`: the workspace export (Admin › Export Container).

Release files and results stay on your computer. They're git-ignored because preview links give access to your workspace, and results contain client data.

## Site recipes

`sites/<site>.json` describes how to click through a site. Every check follows it exactly. It holds:

- `url`: the homepage;
- the cookie banner's Accept and Reject buttons;
- `journey`: the category page, the product tile selector, and the Add to basket and Checkout buttons;
- optionally, `product_index`, to use a different tile than the first.

When a site changes and a step fails, the screenshots show where it stopped. Fix the recipe, then run both checks again with the fixed recipe. `sites/_template.json` shows every field.

Recipes so far: lookfantastic.

## What the report can and can't see

Findings come from what reached each vendor: calls, events and key values such as value, currency, items and IDs.

The "Tag fired" columns stay empty for now, because tag status comes from Tag Assistant, which these runs don't use. Reading Tag Assistant from your own Chrome is planned, and needs IT's approval for Chrome remote debugging.

## Tests

```
uv run python tests/test_report.py
```

This checks that the report reproduces the MYP_NC release: 3 failed of 123 checked. The data is client data, so it's kept outside git, in `tests/fixtures/`, and the test skips without it.

## Build status

| Step | What | Status |
|---|---|---|
| 1 | Project, install, `gtm-qa` command, release files | Done |
| 2 | Runner: both journeys, fresh visitor, preview loading, progress output, several brands per release | Done |
| 3 | Report: comparison and export matching, checked against MYP_NC and a LookFantastic noise test | Done |
| 4 | Recipes for MyProtein, Christophe Robin, Myvitamins, Cult Beauty and Mankind | Next |
| 5 | A teammate installs and runs it from this README alone | To do |

Later: reading Tag Assistant from your own Chrome, and Claude-assisted recipe repair.

## Change notes

Every change adds an entry to `CHANGELOG.md`.
