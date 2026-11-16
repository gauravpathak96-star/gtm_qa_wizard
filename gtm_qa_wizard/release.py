"""Release files: releases/<name>.toml describes one GTM release to test, on one or more brands.

A release file is the only thing a tester fills in. Each brand has its own site recipe and its
own GTM Share links (storefront, and checkout when it's a separate container), since every
brand has its own containers. Values a run works out
itself (the product the first check tested, which later checks reuse) are kept in
runs/<name>/state.json, so the release file is never rewritten."""
import json
import re
import tomllib
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
RELEASES = ROOT / "releases"
SITES = ROOT / "sites"
RUNS = ROOT / "runs"

CHECKS = ("live", "preview")
JOURNEYS = ("opt-in", "opt-out")
PRODUCT_CHOICES = ("cheapest", "first")
YES_NO = {"yes": True, "y": True, "true": True, "no": False, "n": False, "false": False}


def yes_no(v):
    """True / False from "yes" / "no" (or a TOML true / false); None when it's neither."""
    if isinstance(v, bool):
        return v
    return YES_NO.get(str(v).strip().lower())

HEAD = """# Release: {name}
# Fill in your name and each brand's Share links, then run:
#   uv run gtm-qa check {name}
#   uv run gtm-qa run {name} live
#   uv run gtm-qa run {name} preview
#   uv run gtm-qa report {name}

# ======================================================================
# Release name (the file name, don't change it)
# ======================================================================
name = "{name}"

# ======================================================================
# Your name, for the report
# ======================================================================
tester = ""

# ======================================================================
# What this release changes, in a sentence (shown in the report)
# ======================================================================
note = ""

# ======================================================================
# Journeys to run on every brand: opt-in (Accept all) and opt-out (Reject all)
# ======================================================================
journeys = ["opt-in", "opt-out"]

# ======================================================================
# Place an order at the end of each journey: "yes" or "no".
# With "yes" the browser window opens and the run stops after Checkout so you can pay
# yourself; press Enter in the terminal once the order confirmation page shows.
# That's one order per journey per check (4 with both journeys).
# A brand can override this with its own purchase = "yes" / "no".
# ======================================================================
purchase = "no"

# ======================================================================
# Which product to test: "cheapest" (the lowest-priced product on the category page
# that can be added to the basket) or "first" (the recipe's product_index tile).
# Live and Preview always test the same product.
# ======================================================================
product = "cheapest"
"""

BRAND = """
# ######################################################################
# Brand: {site}
# ######################################################################
[[brands]]

# ======================================================================
# Site recipe in sites/{site}.json (how to click through the site)
# ======================================================================
site = "{site}"

# ======================================================================
# Storefront container (or the only container, if checkout uses the same one)
# Workspace link: GTM › Preview › Tag Assistant › ⋮ › Share. Needed for the preview check.
# ======================================================================
storefront_preview_link = ""

# ======================================================================
# Storefront container, published live version: GTM › Versions › the live version ›
# Preview › Share. Optional: with both storefront links, Tag Assistant records which tags fired.
# ======================================================================
storefront_live_link = ""

# ======================================================================
# Checkout container: only if checkout uses a different container than the storefront.
# Leave empty when the site uses one container. Workspace link, as above.
# ======================================================================
checkout_preview_link = ""

# ======================================================================
# Checkout container, published live version. Not used yet: Tag Assistant follows one
# container per run (the storefront's). Checkout tags still show in the vendor calls.
# ======================================================================
checkout_live_link = ""

# ======================================================================
# Optional: GTM container exports, so renamed and re-created tags are paired.
# Admin › Export Container: the live version (before) and the workspace (after).
# ======================================================================
exports_before = ""
exports_after = ""
"""

LINK_FIELDS = ("storefront_preview_link", "storefront_live_link", "checkout_preview_link", "checkout_live_link")


def _link(v):
    """One Share link from a field: a string, or the first entry if a list was pasted."""
    if isinstance(v, list):
        v = next((x for x in v if str(x).strip()), "")
    return str(v or "").strip()


def links(b):
    """A brand's Share links as preview_links / live_links (storefront first) plus the pair Tag
    Assistant connects through: the same container in both checks, storefront when it has both
    links, else checkout. Old release files with preview_links / live_links still work."""
    new = any(k in b for k in LINK_FIELDS)
    if new:
        f = {k: _link(b.get(k)) for k in LINK_FIELDS}
        prev = [l for l in (f["storefront_preview_link"], f["checkout_preview_link"]) if l]
        live = [l for l in (f["storefront_live_link"], f["checkout_live_link"]) if l]
        pairs = [(f[c + "_preview_link"], f[c + "_live_link"]) for c in ("storefront", "checkout")]
        ta = next((pr for pr in pairs if pr[0] and pr[1]), ("", ""))
    else:
        prev = [l for l in (b.get("preview_links") or []) if str(l).strip()]
        live = [l for l in (b.get("live_links") or []) if str(l).strip()]
        ta = (prev[0], live[0]) if prev and live else ("", "")
    return prev, live, ta


NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,60}$")


def path_of(name):
    return RELEASES / f"{name}.toml"


def site_names():
    return sorted(p.stem for p in SITES.glob("*.json") if not p.stem.startswith("_"))


def recipe(site):
    p = SITES / f"{site}.json"
    if not p.exists():
        raise ValueError(f"No site recipe sites/{site}.json. Recipes so far: {', '.join(site_names()) or 'none'}")
    return json.loads(p.read_text(encoding="utf-8"))


def create(name, sites):
    if not NAME_RE.match(name):
        raise ValueError("Use lower-case letters, numbers, - and _ for the release name (e.g. myp-consent-fix).")
    p = path_of(name)
    if p.exists():
        raise ValueError(f"{p.relative_to(ROOT)} already exists.")
    RELEASES.mkdir(exist_ok=True)
    p.write_text(HEAD.format(name=name) + "".join(BRAND.format(site=s) for s in sites), encoding="utf-8")
    return p


def load(name):
    p = path_of(name)
    if not p.exists():
        raise ValueError(f"No release file {p.relative_to(ROOT)}. Create it with: uv run gtm-qa new {name} --sites <site>,<site>")
    with p.open("rb") as f:
        rel = tomllib.load(f)
    rel.setdefault("journeys", list(JOURNEYS))
    rel.setdefault("purchase", "no")
    rel["product"] = str(rel.get("product") or "cheapest").strip().lower()
    brands = rel.get("brands") or []
    if not brands and rel.get("site"):   # a single-brand file written by hand
        brands = [{k: rel.get(k) for k in ("site", "url", "preview_links", "live_links", *LINK_FIELDS, "product_url", "exports_before", "exports_after", "purchase") if rel.get(k) is not None}]
    for b in brands:
        b["mixed_links"] = any(k in b for k in LINK_FIELDS) and any(k in b for k in ("preview_links", "live_links"))
        b["preview_links"], b["live_links"], b["ta_links"] = links(b)
        b.setdefault("purchase", rel["purchase"])
        if not b.get("url"):
            try:
                b["url"] = recipe(b["site"]).get("url", "")
            except ValueError:
                b["url"] = ""
    rel["brands"] = brands
    return rel


def problems(rel, check=None):
    """What's missing or wrong, as (level, message): 'error' stops a run, 'warn' doesn't."""
    out = []
    if not rel["brands"]:
        out.append(("error", "no brands: add a [[brands]] block with site = \"<recipe name>\""))
    bad = [j for j in rel["journeys"] if j not in JOURNEYS]
    if bad:
        out.append(("error", f"unknown journeys {bad}; use {list(JOURNEYS)}"))
    if rel.get("product") not in PRODUCT_CHOICES:
        out.append(("error", f"product = \"{rel.get('product')}\": use \"cheapest\" or \"first\""))
    for b in rel["brands"]:
        s = b.get("site", "?")
        if not (SITES / f"{s}.json").exists():
            out.append(("error", f"{s}: no site recipe sites/{s}.json yet"))
            continue
        if not str(b.get("url", "")).startswith("http"):
            out.append(("error", f"{s}: no homepage: add url to the brand or to sites/{s}.json"))
        if b.get("mixed_links"):
            out.append(("error", f"{s}: use either the storefront_/checkout_ link fields or the old preview_links / live_links, not both"))
        if check == "preview" and not b["preview_links"]:
            out.append(("error", f"{s}: storefront_preview_link is empty, so the preview check can't load the workspace"))
        cid = lambda l: (re.search(r"(GTM-[A-Z0-9]+)", unquote(unquote(l))) or [None, None])[1]
        sp, cp = _link(b.get("storefront_preview_link")), _link(b.get("checkout_preview_link"))
        if sp and cp and cid(sp) and cid(sp) == cid(cp):
            out.append(("error", f"{s}: storefront_preview_link and checkout_preview_link are both {cid(sp)}. "
                                 "If checkout uses the same container, leave checkout_preview_link empty"))
        if yes_no(b.get("purchase")) is None:
            out.append(("error", f"{s}: purchase = \"{b.get('purchase')}\": use \"yes\" or \"no\""))
        for l in b["preview_links"] + b["live_links"]:
            if "gtm_auth" not in l or "gtm_preview" not in l:
                out.append(("error", f"{s}: a Share link has no gtm_auth / gtm_preview: copy it from Tag Assistant › ⋮ › Share"))
        # a workspace link pasted as a live link makes the live check load the workspace too
        env = lambda l: (re.search(r"gtm_preview=([^&#\s\"']+)", l) or [None, None])[1]
        same = {env(l) for l in b["live_links"]} & {env(l) for l in b["preview_links"]} - {None}
        if same:
            out.append(("error", f"{s}: a live link has the same preview ({', '.join(sorted(same))}) as a preview link, so the live check "
                                 "would load the workspace. Use the Share link of the published version (GTM › Versions › the live version › Preview › Share)"))
        if b["preview_links"] and not b["ta_links"][0]:
            out.append(("warn", f"{s}: no live link: Tag Assistant won't record which tags fired (add storefront_live_link)"))
        for side in ("before", "after"):
            f = b.get(f"exports_{side}", "")
            if f and not Path(f).expanduser().exists() and not (ROOT / f).exists():
                out.append(("error", f"{s}: exports_{side} file not found: {f}"))
        if check is None and not b["preview_links"]:
            out.append(("warn", f"{s}: no preview link yet (needed before the preview check)"))
    if not rel.get("tester"):
        out.append(("warn", "tester is empty"))
    return out


def state(name):
    p = RUNS / name / "state.json"
    return json.loads(p.read_text()) if p.exists() else {}


def save_state(name, **kw):
    d = RUNS / name
    d.mkdir(parents=True, exist_ok=True)
    s = state(name)
    s.update(kw)
    (d / "state.json").write_text(json.dumps(s, indent=2))
    return s


def all_names():
    return sorted(p.stem for p in RELEASES.glob("*.toml") if p.stem != "example")
