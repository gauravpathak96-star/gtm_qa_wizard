"""Builds runs/<release>/report.html from the live and preview results of every brand.

The comparison itself runs inside the report page (engine.js, the rules proven on the old
tester page), so the HTML file is complete on its own and needs no internet connection.
`gtm-qa report` opens it in a headless browser once to print the summary in the terminal."""
import html
import json
from datetime import datetime
from pathlib import Path

from .. import release

HERE = Path(__file__).parent


def _read_json(p):
    p = Path(p).expanduser()
    if not p.is_absolute() and not p.exists():
        p = release.ROOT / p
    return json.loads(p.read_text(encoding="utf-8"))


def gather(name):
    rel = release.load(name)
    brands = []
    for b in rel["brands"]:
        d = release.RUNS / name / b["site"]
        item = {"site": b["site"], "url": b.get("url", ""), "preview_links": b["preview_links"],
                "noise_events": release.recipe(b["site"]).get("noise_events", [])}
        for check in release.CHECKS:
            f = d / check / "results.json"
            item[check] = _read_json(f) if f.exists() else None
        if b.get("exports_before") and b.get("exports_after"):
            item["exports"] = {"before": _read_json(b["exports_before"]), "after": _read_json(b["exports_after"])}
        brands.append(item)
    return rel, brands


def build(name, data_override=None):
    """Write the report; data_override replaces the gathered brands (used by the tests)."""
    rel, brands = gather(name) if data_override is None else (data_override["release"], data_override["brands"])
    data = {"release": {"name": rel.get("name", name), "tester": rel.get("tester", ""), "note": rel.get("note", "")}, "brands": brands}
    title = "GTM regression · " + data["release"]["name"]
    meta = " · ".join(x for x in [data["release"]["note"], data["release"]["tester"] and "Tester: " + data["release"]["tester"],
                                  "Generated " + datetime.now().strftime("%d %b %Y %H:%M")] if x)
    page = (HERE / "template.html").read_text(encoding="utf-8")
    page = (page.replace("__TITLE__", html.escape(title)).replace("__META__", html.escape(meta))
            .replace("__ENGINE__", (HERE / "engine.js").read_text(encoding="utf-8"))
            .replace("__PAGE__", (HERE / "page.js").read_text(encoding="utf-8"))
            .replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")))
    out = release.RUNS / name / "report.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    return out


def summary(path):
    """Open the report in a headless browser and return what it computed, per brand."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page()
        errors = []
        p.on("pageerror", lambda e: errors.append(str(e)))
        p.goto(Path(path).resolve().as_uri())
        p.wait_for_function("() => window.__summary || document.readyState === 'complete'", timeout=60000)
        s = p.evaluate("() => window.__summary || null")
        b.close()
    if errors:
        raise RuntimeError("The report page hit an error: " + errors[0])
    return s
