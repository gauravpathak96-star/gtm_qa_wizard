"""The gtm-qa command.

  gtm-qa new <release> --sites myprotein,lookfantastic   create a release file to fill in
  gtm-qa list                                            releases and how far each has got
  gtm-qa check <release>                                 check the release file before running
  gtm-qa check-setup                                     check this computer can run the tests
  gtm-qa run <release> live|preview [--only <site>]      run one check on every brand
  gtm-qa report <release>                                compare live and preview, open report.html
"""
import argparse
import json
import subprocess
import sys

from . import __version__, release


def cmd_new(a):
    sites = [x.strip() for x in a.sites.split(",") if x.strip()]
    missing = [x for x in sites if x not in release.site_names()]
    p = release.create(a.release, sites)
    print(f"Created {p.relative_to(release.ROOT)} with {len(sites)} brand(s): {', '.join(sites)}")
    if missing:
        print(f"! No site recipe yet for: {', '.join(missing)} (recipes so far: {', '.join(release.site_names())})")
    print("Open it, paste each brand's GTM Share links (storefront, and checkout if it's a separate container) and your name, then run:")
    print(f"  uv run gtm-qa check {a.release}")


def cmd_list(a):
    names = release.all_names()
    if not names:
        print("No releases yet. Create one with: uv run gtm-qa new <release> --site <site> --url <homepage>")
        return
    for n in names:
        try:
            sites = [b["site"] for b in release.load(n)["brands"]]
        except Exception:
            sites = []
        done = {c: sum((release.RUNS / n / s / c / "results.json").exists() for s in sites) for c in release.CHECKS}
        rep = (release.RUNS / n / "report.html").exists()
        print(f"  {n:34} {len(sites)} brand(s) · live {done['live']}/{len(sites)} · preview {done['preview']}/{len(sites)} · report {'yes' if rep else 'no'}")


def cmd_check(a):
    rel = release.load(a.release)
    probs = release.problems(rel)
    for lvl, msg in probs:
        print(f"  {'✗' if lvl == 'error' else '!'} {msg}")
    if any(l == "error" for l, _ in probs):
        print("Fix the ✗ items above in " + str(release.path_of(a.release).relative_to(release.ROOT)))
        return 1
    print(f"✓ {a.release} is ready: {', '.join(b['site'] for b in rel['brands'])} · journeys {', '.join(rel['journeys'])}")


def cmd_check_setup(a):
    ok = True
    print(f"  ✓ Python {sys.version.split()[0]}")
    try:
        from playwright.sync_api import sync_playwright
        print("  ✓ Playwright installed")
    except ImportError:
        print("  ✗ Playwright missing: run  uv sync")
        return 1
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            b.close()
        print("  ✓ Chromium browser installed")
    except Exception as e:
        ok = False
        print("  ✗ Chromium can't start: run  uv run playwright install chromium")
        print("    (" + str(e).splitlines()[0][:160] + ")")
    sites = sorted(p.stem for p in release.SITES.glob("*.json") if not p.stem.startswith("_"))
    print(f"  ✓ Site recipes: {', '.join(sites) or 'none yet'}")
    print("Ready to run tests." if ok else "Fix the ✗ items above.")
    return 0 if ok else 1


def cmd_run(a):
    from . import runner
    rel = release.load(a.release)
    only = [x.strip() for x in (a.only or "").split(",") if x.strip()]
    if only:
        unknown = [x for x in only if x not in [b["site"] for b in rel["brands"]]]
        if unknown:
            print("  ✗ not in this release: " + ", ".join(unknown))
            return 1
        rel["brands"] = [b for b in rel["brands"] if b["site"] in only]
    check = "preview" if a.check == "preview" else "live"
    errs = [m for l, m in release.problems(rel, None if a.without_workspace else check) if l == "error"]
    if errs:
        for m in errs:
            print("  ✗ " + m)
        return 1
    if a.without_workspace:
        if check != "preview":
            print("  ✗ --without-workspace only applies to the preview check")
            return 1
        for b in rel["brands"]:
            b["preview_links"] = []
        print("Noise test: the preview check runs on the LIVE container, so the report compares Live with Live.\n"
              "Any failure in that report is noise, not a break.")
    n = len(rel["brands"]) * len(rel["journeys"])
    print(f"{a.release} · {check} check · {len(rel['brands'])} brand(s) × {len(rel['journeys'])} journeys "
          f"(about {n} min)")
    res = runner.run_check(a.release, "live" if check == "live" else "preview", headed=a.headed,
                           only=[b["site"] for b in rel["brands"]], log=print,
                           no_preview=a.without_workspace, no_ta=a.no_tag_assistant)
    bad = [s for s, r in res.items() if not r["ok"]]
    print(f"\nDone: {len(res) - len(bad)} of {len(res)} brand(s) completed every step." +
          (f" Steps didn't complete on: {', '.join(bad)} (see the screenshots in runs/{a.release}/<brand>/{check}/)." if bad else ""))
    other = "preview" if check == "live" else "live"
    print(f"Next: uv run gtm-qa run {a.release} {other}" if not all((release.RUNS / a.release / s / other / "results.json").exists() for s in res)
          else f"Next: uv run gtm-qa report {a.release}")
    return 0


def cmd_report(a):
    from . import report
    rel = release.load(a.release)
    out = report.build(a.release)
    print(f"Report: {out.relative_to(release.ROOT)}")
    for s in report.summary(out) or []:
        if s["status"] == "skip":
            print(f"  – {s['site']:16} not compared yet: run both checks")
        else:
            print(f"  {'✗' if s['failed'] else '✓'} {s['site']:16} {s['failed']} failed of {s['checked']} checked"
                  + (f" · {'; '.join(s['notes'])}" if s["notes"] else ""))
            if s.get("noise_suggest"):
                print(f"    Noise test: these differ between two identical runs of {s['site']}. If they're timing or")
                print(f"    on-screen events, add them to \"noise_events\" in sites/{s['site']}.json: {json.dumps(s['noise_suggest'])}")
    if not a.no_open:
        subprocess.run(["open", str(out)], check=False)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gtm-qa", description="Regression tests for GTM releases: the same journey on Live and Preview, compared step by step.")
    ap.add_argument("--version", action="version", version=f"gtm-qa-wizard {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("new", help="create a release file to fill in")
    p.add_argument("release", help="short name, e.g. thg-consent-fix")
    p.add_argument("--sites", required=True, help="site recipes from sites/, comma-separated, e.g. myprotein,lookfantastic")
    p.set_defaults(fn=cmd_new)
    p = sub.add_parser("list", help="releases and how far each has got")
    p.set_defaults(fn=cmd_list)
    p = sub.add_parser("check", help="check a release file before running")
    p.add_argument("release")
    p.set_defaults(fn=cmd_check)
    p = sub.add_parser("check-setup", help="check this computer can run the tests")
    p.set_defaults(fn=cmd_check_setup)
    p = sub.add_parser("run", help="run one check: live (before the change) or preview (with your workspace)")
    p.add_argument("release")
    p.add_argument("check", choices=release.CHECKS)
    p.add_argument("--only", help="run only these brands, comma-separated (e.g. to re-run one)")
    p.add_argument("--headed", action="store_true", help="show the browser window while it runs")
    p.add_argument("--without-workspace", action="store_true",
                   help="noise test: run the preview check on the live container, so Live is compared with Live")
    p.add_argument("--no-tag-assistant", action="store_true", help="don't connect Tag Assistant (no tag data, slightly faster)")
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("report", help="compare live and preview and open the report")
    p.add_argument("release")
    p.add_argument("--no-open", action="store_true", help="don't open the report in the browser")
    p.set_defaults(fn=cmd_report)
    a = ap.parse_args(argv)
    try:
        return a.fn(a) or 0
    except ValueError as e:
        print("✗ " + str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
