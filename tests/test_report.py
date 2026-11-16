"""The report must reproduce the MYP_NC result the comparison rules were proven on:
3 failed rows (Pinterest search and TikTok Search at Opt-in · Category, GA4 organic_search_visit).
The MYP_NC data is client data, so tests/fixtures/ is git-ignored and this test skips without it.

Run: uv run python tests/test_report.py"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from gtm_qa_wizard import report  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "myp_nc" / "db.json"


def main():
    if not FIX.exists():
        print("skipped: tests/fixtures/myp_nc/db.json isn't on this computer")
        return 0
    db = json.loads(FIX.read_text())
    r = "releases/relmweuoebd"
    naming = dict(db[r]["naming"])
    naming["items"] = db[r + "/naming/p0"]["items"] + db[r + "/naming/p1"]["items"]
    brand = {"site": "myprotein", "url": "https://www.myprotein.com/", "preview_links": db[r]["cfg"]["previews"],
             "live": db[r + "/phases/benchmark"]["results"], "preview": db[r + "/phases/preview"]["results"],
             "naming": naming, "tmap": {"before": db[r + "/tmap/before"], "after": db[r + "/tmap/after"]}}
    out = report.build("test-myp-nc", {"release": {"name": "test-myp-nc", "tester": "test"}, "brands": [brand]})
    s = report.summary(out)[0]
    print(f"MYP_NC: {s['failed']} failed of {s['checked']} checked · {' · '.join(s['notes'])}")
    ok = s["failed"] == 3 and s["checked"] == 123
    print("PASS" if ok else "FAIL: expected 3 failed of 123 checked")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
