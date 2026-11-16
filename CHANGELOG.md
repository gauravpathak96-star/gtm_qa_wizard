# Changelog

Every change adds an entry here, newest first.

## 2026-11-16 · Live-only report, guest checkout email, pop-ups

- **Live-only report:** a brand with only a live check (e.g. after publishing) gets a section in the same table format, with Live columns only. With no comparison, a row fails on consent (calls before the choice or after Reject all; strictly necessary vendors excepted, Google only when gcs says granted), a tag Tag Assistant shows as failed, or a broken value in a call. `gtm-qa report <release> --live-only` forces it. Tag Assistant can run in a live check with only a live link. Comparison results are unchanged: the saved thg-consent-template-fix report rebuilds to the same counts on all 6 brands.
- **`guest_checkout_email`** in the release file (a brand can override it): at Checkout the email goes into the guest form, marketing is declined if asked, and Continue as guest is clicked. All 6 recipes have a `guest_checkout` block (`#guestEmail`). Tested by filling the form on LF (no marketing question) and Mankind (marketing declined); Continue as guest wasn't clicked in testing.
- **Sign-up pop-ups:** a click covered by a pop-up (Listrak's newsletter offer on MyProtein) closes it and clicks again. This made the cheapest product fail on MyProtein and Cult Beauty, whose cheaper tiles sit further down the page. All 6 sites now reach Checkout with the cheapest product.

## 2026-11-16 · Storefront and checkout Share links, one field each

- **Release files name each link:** `storefront_preview_link`, `storefront_live_link`, `checkout_preview_link`, `checkout_live_link`, one link each (no list). Every brand gets all four; the checkout ones stay empty when the site uses one container. Older files with `preview_links` / `live_links` still work, but a brand can't mix both layouts.
- **Each field has its own `# =====` header** saying what goes in it (`gtm-qa new` and `releases/example.toml`).
- **Tag Assistant pairs links by container:** the storefront's preview and live links, or the checkout's when only the checkout has both, so both checks follow the same container. `checkout_live_link` isn't used otherwise yet.
- **A live link with no site URL now connects:** the tool adds the homepage (`url=`) to the Tag Assistant link, so the Connect button isn't left disabled.
- `gtm-qa check` also flags the same container in both storefront and checkout preview links, and a missing live link (no tag data).
- Tested: all layouts load to the right links and Tag Assistant pair, and a real LF preview journey from `storefront_preview_link` loaded the workspace (GTM-NHWTTFSL, PREVIEW env-2044) on every step.

## 2026-11-16 · Purchase on request, cheapest product by default

- **`purchase = "yes" / "no"`** in the release file (default "no"; a brand can override it). With "yes", the browser window opens and the run stops after Checkout. The tester places the order, then presses Enter in the terminal once the confirmation page shows (`s` + Enter skips it). Everything sent until then is recorded as a **Purchase** step. The browser keeps working while it waits, so the preview container still loads on the payment and confirmation pages.
- **Cheapest product by default** (`product = "cheapest"`): the Product step opens the lowest-priced product on the category page, reading the tile's price element, not the product name ("Worth £665"). A product whose Add to basket button is missing or disabled is skipped for the next cheapest. `product = "first"` keeps the old `product_index` tile. Recipes can add `price_selector` if prices aren't found.
- **`gtm-qa check` catches a workspace link in `live_links`**: the same `gtm_preview` in `live_links` and `preview_links` is an error, because the live check would load the workspace.
- Tested: the cheapest pick on all 6 recipes' category pages, and a full LF live journey (Laneige Midnight Minis, £20, every step completed). The purchase pause was tested with Enter and with `s` on a test page. No real order was placed.

## 2026-11-16 · Key values show the dataLayer push that set them

- `runner.py`: alongside each key value read from GTM's data model, the run records which `window.dataLayer` push last set that key: its event name (or none), its position, and how many pushes set it. Saved per step as `variable_sources`.
- Report: in "Key values that broke", each Live and Preview value has a line under it, for example "Set by event view_cart (dataLayer push 3)". Results captured before this have no sources and show the value alone, so re-run a release to see them.
- Tested: the capture script on a page with a sample dataLayer, and a report built from the thg-consent-template-fix Christophe Robin data with sample sources. The page drew without errors. The MYP_NC test skipped (fixture not on this computer).

## 2026-11-16 · One entry per account, key values compared across every call

- `capture/qa-capture.js`: calls are grouped per account too (`tid`, `id`). Cult Beauty sends a Google Ads `page_view` to two accounts (AW-350752883 and AW-701660261) at every step. Before, both were merged into one entry that kept whichever call came first, so the report showed accounts "changing" between checks. Results captured before this need a re-run to benefit.
- Report rule 4 (key value broken) compares every call of an event, not only the first. A value fails only when it's in none of Preview's calls of that event.
- Re-run of the thg-consent-template-fix release on all 6 brands, both checks, every step completed. The false Google Ads account failures are gone. MYP_NC still gives 3 failed of 123, and the LookFantastic noise test 0 of 142.

## 2026-11-16 · Recipes for MyProtein, Christophe Robin, Myvitamins, Cult Beauty and Mankind

- **New recipes:** `sites/myprotein.json`, `christophe-robin.json`, `myvitamins.json`, `cult-beauty.json` and `mankind.json`. All are THG sites:
  - OneTrust banner (Reject all via Cookie settings);
  - product tiles `a.product-item`, Add to basket `#add-to-basket`, basket `/basket/`.
  - Checkout is `#summary-checkout-btn` on Christophe Robin, Cult Beauty and Mankind, and `#desktop-checkout-start` on MyProtein and Myvitamins.
  - The category pages are chosen so the first product can be added without choosing a variant.
- **Optional journey entries:** a recipe entry with `"optional": true` is skipped when it can't be done. MyProtein and Myvitamins use one for the free-gift pop-up that can appear after Checkout ("Continue to checkout").
- **Tested:** a live check on all 5 brands completed both journeys, every step.

## 2026-11-16 · Tag Assistant in the run

- **Tag Assistant runs in the tool's own browser.** Each journey opens the brand's Share link in Tag Assistant, clicks Connect and runs the journey in the tab it opens, in debug mode. Tag Assistant needs no sign-in, and there's no remote debugging of your Chrome.
  - Page steps record the newest page's fired and failed tags, read from its Tags tab.
  - In-page steps (consent click, Add to basket, Checkout click) record only the tags they added.
- **Tag Assistant's "Connected" badge covered the cookie banner's buttons.** It's now hidden on the site tab, and Tag Assistant keeps working.
- **Release files get `live_links`:** a Share link of the published live version, per brand.
- **Tag Assistant runs only when a brand has both `live_links` and `preview_links`, and then in both checks.** On LookFantastic, Tag Assistant in the preview check only gave 14 failures, against 1 with neither check using it, because debug mode changes how some tags behave. Without both links it's skipped in both checks and the run explains why. `--no-tag-assistant` turns it off.
- **The report skips brands that have no recipe yet,** instead of stopping.

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
