# gtm-qa-wizard

Regression tests for GTM releases. The same scripted shopping journey runs twice: on the **Live** container and with your **unpublished workspace** loaded (**Preview**). The two runs are then compared step by step, vendor by vendor. A row fails only when tracking actually breaks; renamed tags and timing noise never fail.

A script (Playwright) runs every check, so every check does exactly the same steps. Claude is optional: it can help build a site recipe or explain a report, but it never runs a check.

## How it works

```
gtm-qa new <release>            create releases/<release>.toml and fill it in
gtm-qa run <release> live       Live container, before your change
gtm-qa run <release> preview    your workspace loaded through the GTM Share preview link
gtm-qa report <release>         compare the two and open report.html
```

Each check runs two journeys, each in a brand-new browser (a fresh visitor with no cookies):

- **Opt-in:** Accept all on the cookie banner.
- **Opt-out:** Reject all.

Both journeys go Before consent → Home → Category → Product → Add to basket → Basket → Checkout. There's a fixed 8 s wait after each step, and no order is placed.

At every step the run records:

- vendor calls (GA4, Meta, TikTok, Pinterest…), including events sent inside request bodies;
- dataLayer events, consent state, cookies, the GTM containers loaded, and a screenshot.

Results go to `runs/<release>/<live|preview>/results.json`. The first check's product is reused by the second, so both test the same item.

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

1. Create the release file:
   ```
   uv run gtm-qa new myp-consent-fix --site myprotein --url https://www.myprotein.com
   ```
2. Open `releases/myp-consent-fix.toml`. Paste the GTM Share preview link (GTM › Preview › Tag Assistant › ⋮ › Share) and your name.
3. Check it:
   ```
   uv run gtm-qa check myp-consent-fix
   ```
4. Run both checks, then the report:
   ```
   uv run gtm-qa run myp-consent-fix live
   uv run gtm-qa run myp-consent-fix preview
   uv run gtm-qa report myp-consent-fix
   ```

`uv run gtm-qa list` shows every release and how far it has got.

Release files and results stay on your computer. They're git-ignored because preview links give access to your workspace, and results contain client data.

## Site recipes

`sites/<site>.json` describes how to click through a site: the category page, the product tile, the Add to basket and Checkout buttons, and the cookie banner's Accept and Reject buttons. Every check follows the recipe exactly. When a site changes and a step fails, the recipe is fixed, and both checks are run again with the fixed recipe.

## Build status

| Step | What | Status |
|---|---|---|
| 1 | Project, install, `gtm-qa` command, release files | Done |
| 2 | Runner: both journeys, fresh visitor, preview loading, progress output | Next |
| 3 | Report: comparison and export matching, checked against real release data | To do |
| 4 | A teammate installs and runs it from this README alone | To do |

Later: a MyProtein recipe, reading Tag Assistant from your own Chrome (needs IT's approval for remote debugging), and Claude-assisted recipe repair.

## Change notes

Every change adds an entry to `CHANGELOG.md`.
