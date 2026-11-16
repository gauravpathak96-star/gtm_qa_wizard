"""The gtm-qa command.

  gtm-qa new <release> --site <site> --url <homepage>   create a release file to fill in
  gtm-qa list                                           releases and how far each has got
  gtm-qa check <release>                                check the release file before running
  gtm-qa check-setup                                    check this computer can run the tests
  gtm-qa run <release> live|preview                     run one check (step 2 of the build)
  gtm-qa report <release>                               compare live and preview (step 3 of the build)
"""
import argparse
import sys

from . import __version__, release


def cmd_new(a):
    p = release.create(a.release, a.site, a.url)
    print(f"Created {p.relative_to(release.ROOT)}")
    print("Open it, paste the GTM Share preview link and your name, then run:")
    print(f"  uv run gtm-qa check {a.release}")


def cmd_list(a):
    names = release.all_names()
    if not names:
        print("No releases yet. Create one with: uv run gtm-qa new <release> --site <site> --url <homepage>")
        return
    for n in names:
        done = [c for c in release.CHECKS if (release.RUNS / n / c / "results.json").exists()]
        rep = (release.RUNS / n / "report.html").exists()
        print(f"  {n:32} checks done: {', '.join(done) or 'none':16} report: {'yes' if rep else 'no'}")


def cmd_check(a):
    rel = release.load(a.release)
    probs = release.problems(rel)
    for lvl, msg in probs:
        print(f"  {'✗' if lvl == 'error' else '!'} {msg}")
    if any(l == "error" for l, _ in probs):
        print("Fix the ✗ items above in " + str(release.path_of(a.release).relative_to(release.ROOT)))
        return 1
    print(f"✓ {a.release} is ready: site {rel['site']}, journeys {', '.join(rel['journeys'])}, "
          f"{len(rel['preview_links'])} preview link(s)")


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
    rel = release.load(a.release)
    errs = [m for l, m in release.problems(rel, a.check) if l == "error"]
    if errs:
        for m in errs:
            print("  ✗ " + m)
        return 1
    print("Running checks arrives in step 2 of the build. The release file is ready for it.")
    return 2


def cmd_report(a):
    release.load(a.release)
    print("Reports arrive in step 3 of the build.")
    return 2


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gtm-qa", description="Regression tests for GTM releases: the same journey on Live and Preview, compared step by step.")
    ap.add_argument("--version", action="version", version=f"gtm-qa-wizard {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("new", help="create a release file to fill in")
    p.add_argument("release", help="short name, e.g. myp-consent-fix")
    p.add_argument("--site", required=True, help="site recipe name from sites/, e.g. myprotein")
    p.add_argument("--url", required=True, help="the site's homepage, e.g. https://www.myprotein.com")
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
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("report", help="compare live and preview and open the report")
    p.add_argument("release")
    p.set_defaults(fn=cmd_report)
    a = ap.parse_args(argv)
    try:
        return a.fn(a) or 0
    except ValueError as e:
        print("✗ " + str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
