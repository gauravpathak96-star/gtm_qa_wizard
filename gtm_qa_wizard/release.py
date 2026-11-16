"""Release files: releases/<name>.toml describes one GTM release to test, on one or more brands.

A release file is the only thing a tester fills in. Each brand has its own site recipe and its
own GTM Share preview link, since every brand has its own container. Values a run works out
itself (the product the first check tested, which later checks reuse) are kept in
runs/<name>/state.json, so the release file is never rewritten."""
import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASES = ROOT / "releases"
SITES = ROOT / "sites"
RUNS = ROOT / "runs"

CHECKS = ("live", "preview")
JOURNEYS = ("opt-in", "opt-out")

HEAD = """# Release: {name}
# Fill in each brand's preview link and your name, then run:
#   uv run gtm-qa check {name}
#   uv run gtm-qa run {name} live
#   uv run gtm-qa run {name} preview
#   uv run gtm-qa report {name}

name = "{name}"

# Your name, for the report
tester = ""

# What this release changes, in a sentence (shown in the report)
note = ""

# Journeys to run on every brand: opt-in (Accept all) and opt-out (Reject all)
journeys = ["opt-in", "opt-out"]
"""

BRAND = """
[[brands]]
# Site recipe in sites/{site}.json (how to click through the site)
site = "{site}"
# GTM › Preview › Tag Assistant › ⋮ › Share, one link per container this release changes on this brand.
# Needed for the preview check. Tag Assistant also uses it to record which tags fired.
preview_links = [""]
# Optional: a Share link of the published live version (GTM › Versions › the live version › Preview › Share),
# so the live check records which tags fired too.
live_links = [""]
# Optional: GTM container exports, so renamed and re-created tags are paired.
# Admin › Export Container: the live version (before) and the workspace (after).
exports_before = ""
exports_after = ""
"""

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
    brands = rel.get("brands") or []
    if not brands and rel.get("site"):   # a single-brand file written by hand
        brands = [{k: rel.get(k) for k in ("site", "url", "preview_links", "product_url", "exports_before", "exports_after") if rel.get(k) is not None}]
    for b in brands:
        b["preview_links"] = [l for l in (b.get("preview_links") or []) if str(l).strip()]
        b["live_links"] = [l for l in (b.get("live_links") or []) if str(l).strip()]
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
    for b in rel["brands"]:
        s = b.get("site", "?")
        if not (SITES / f"{s}.json").exists():
            out.append(("error", f"{s}: no site recipe sites/{s}.json yet"))
            continue
        if not str(b.get("url", "")).startswith("http"):
            out.append(("error", f"{s}: no homepage: add url to the brand or to sites/{s}.json"))
        if check == "preview" and not b["preview_links"]:
            out.append(("error", f"{s}: preview_links is empty, so the preview check can't load the workspace"))
        for l in b["preview_links"] + b["live_links"]:
            if "gtm_auth" not in l or "gtm_preview" not in l:
                out.append(("error", f"{s}: a Share link has no gtm_auth / gtm_preview: copy it from Tag Assistant › ⋮ › Share"))
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
