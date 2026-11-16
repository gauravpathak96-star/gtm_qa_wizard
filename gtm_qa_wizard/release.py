"""Release files: releases/<name>.toml describes one GTM release to test.

A release file is the only thing a tester fills in. Values a run works out itself (such as the
product the first check tested, which later checks must reuse) are kept in
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

TEMPLATE = """# Release: {name}
# Fill in the fields below, then run:
#   uv run gtm-qa run {name} live
#   uv run gtm-qa run {name} preview
#   uv run gtm-qa report {name}

name = "{name}"

# Site recipe in sites/<site>.json (how to click through the site)
site = "{site}"

# Homepage of the site being tested
url = "{url}"

# Your name, for the report
tester = ""

# GTM › Preview › Tag Assistant › ⋮ › Share, one link per changed container.
# Needed for the preview check only.
preview_links = [""]

# Journeys to run in every check: opt-in (Accept all) and opt-out (Reject all)
journeys = ["opt-in", "opt-out"]

# Optional: a product URL to test. Left empty, the first check picks one from the
# category page and every later check reuses it.
product_url = ""

# What this release changes, in a sentence (shown in the report)
note = ""

# Optional: GTM container exports, so renamed and re-created tags are paired.
# Admin › Export Container: the live version (before) and the workspace (after).
[exports]
before = ""
after = ""
"""

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,60}$")


def path_of(name):
    return RELEASES / f"{name}.toml"


def create(name, site, url):
    if not NAME_RE.match(name):
        raise ValueError("Use lower-case letters, numbers, - and _ for the release name (e.g. myp-consent-fix).")
    p = path_of(name)
    if p.exists():
        raise ValueError(f"{p.relative_to(ROOT)} already exists.")
    RELEASES.mkdir(exist_ok=True)
    p.write_text(TEMPLATE.format(name=name, site=site, url=url), encoding="utf-8")
    return p


def load(name):
    p = path_of(name)
    if not p.exists():
        raise ValueError(f"No release file {p.relative_to(ROOT)}. Create it with: uv run gtm-qa new {name} --site <site> --url <homepage>")
    with p.open("rb") as f:
        rel = tomllib.load(f)
    rel.setdefault("preview_links", [])
    rel["preview_links"] = [l for l in rel["preview_links"] if l.strip()]
    rel.setdefault("journeys", list(JOURNEYS))
    rel.setdefault("exports", {})
    return rel


def problems(rel, check=None):
    """What's missing or wrong, as (level, message): level 'error' stops a run, 'warn' doesn't."""
    out = []
    if not rel.get("site"):
        out.append(("error", "site is empty"))
    elif not (SITES / f"{rel['site']}.json").exists():
        out.append(("error", f"no recipe sites/{rel['site']}.json for site \"{rel['site']}\""))
    if not str(rel.get("url", "")).startswith("http"):
        out.append(("error", "url must be the site's homepage, starting with https://"))
    bad = [j for j in rel["journeys"] if j not in JOURNEYS]
    if bad:
        out.append(("error", f"unknown journeys {bad}; use {list(JOURNEYS)}"))
    if check == "preview" and not rel["preview_links"]:
        out.append(("error", "preview_links is empty: the preview check needs a GTM Share preview link"))
    for l in rel["preview_links"]:
        if "gtm_auth" not in l or "gtm_preview" not in l:
            out.append(("error", "a preview link has no gtm_auth / gtm_preview: copy it from Tag Assistant › ⋮ › Share"))
    for side in ("before", "after"):
        f = rel["exports"].get(side, "")
        if f and not (ROOT / f).exists() and not Path(f).expanduser().exists():
            out.append(("error", f"exports.{side} file not found: {f}"))
    if not rel.get("tester"):
        out.append(("warn", "tester is empty"))
    if check is None and not rel["preview_links"]:
        out.append(("warn", "no preview link yet: needed before the preview check"))
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
