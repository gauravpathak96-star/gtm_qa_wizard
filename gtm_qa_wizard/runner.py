"""Runs one check (live or preview) for every brand in a release.

Each journey runs in a brand-new browser context, so every journey starts as a fresh visitor
with no cookies and no consent choice. The steps are the same in every check:

  Before consent  open the homepage, leave the cookie banner alone
  Home            click Accept all (opt-in) or Reject all (opt-out)
  Category ...    then the site recipe's steps: category, product tile, add to basket,
                  basket, checkout (never an order)

Every request the page sends is recorded per step, including events inside request bodies
(batched GA4, Meta's form data, TikTok's JSON). capture/qa-capture.js groups them exactly as the
Chrome runs of the old tester did, and adds dataLayer events, consent state, cookies and
containers. For the preview check, the GTM Share link's gtm_auth and gtm_preview are added to the
container's gtm.js request, so the browser loads the workspace instead of the live version.
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlparse, urlunparse

from . import __version__, release

QA_JS = (Path(__file__).parent / "capture" / "qa-capture.js").read_text(encoding="utf-8")
CAPTURE_VERSION = "capture-standard-v4"
WAIT_S = 8
# request types that are never tracking calls
IGNORED_TYPES = {"document", "stylesheet", "script", "font", "media", "manifest", "texttrack", "eventsource", "websocket", "other"}
ONETRUST_ACCEPT = ["#onetrust-accept-btn-handler"]
ONETRUST_REJECT = ["#onetrust-reject-all-handler"]
ONETRUST_SETTINGS = ["#onetrust-pc-btn-handler"]
ONETRUST_PC_REJECT = [".ot-pc-refuse-all-handler", "#onetrust-pc-sdk button:has-text('Reject All')"]
STD_NAMES = {"home": "Home", "category": "Category", "product": "Product", "add_to_basket": "Add to basket",
             "add_to_cart": "Add to basket", "basket": "Basket", "cart": "Basket", "checkout": "Checkout",
             "begin_checkout": "Checkout"}
VIA_OF_ACTION = {"goto": "direct", "click": "click", "click_random": "click"}


def parse_preview(link):
    """Container ID, gtm_auth and gtm_preview from a GTM Share preview link."""
    txt = link
    for _ in range(3):
        txt = unquote(txt)
    cid = re.search(r"(GTM-[A-Z0-9]+)", txt)
    auth = re.search(r"gtm_auth=([^&#\s\"']+)", txt)
    prev = re.search(r"gtm_preview=([^&#\s\"']+)", txt)
    if not (auth and prev):
        raise ValueError("A preview link has no gtm_auth / gtm_preview. Copy it from Tag Assistant › ⋮ › Share.")
    return {"container": cid.group(1) if cid else None, "gtm_auth": auth.group(1), "gtm_preview": prev.group(1)}


def split_batch(url, post):
    """One URL per event: GA4 batches events as lines of the POST body, Meta sends multipart form data
    and TikTok a JSON body, while the capture script reads events from URLs."""
    if not post:
        return [url]
    sep = "&" if "?" in url else "?"
    pd = post.strip()
    if "Content-Disposition: form-data" in pd[:400]:
        fields = dict(re.findall(r'name="([^"]+)"\r?\n\r?\n([^\r\n]*)', pd))
        return [url + (sep + urlencode(fields) if fields else "")]
    if pd.startswith("{"):
        try:
            j = json.loads(pd)
            flat = {k: v for k, v in j.items() if isinstance(v, (str, int, float)) and not isinstance(v, bool)}
            return [url + (sep + urlencode(flat) if flat else "")]
        except Exception:
            return [url]
    lines = [l.strip() for l in pd.splitlines() if re.match(r"^[\w.\[\]%-]+=", l.strip())]
    return [url + sep + l for l in lines] if lines else [url]


def journey_steps(recipe):
    """The recipe's steps after Home, grouped into standard steps. An entry with "step" joins that
    step (e.g. a guest e-mail field as part of Checkout). Purchase steps are never run."""
    out = []
    for e in recipe["journey"]:
        key = (e.get("step") or e.get("name") or "").strip()
        name = STD_NAMES.get(key.lower().replace(" ", "_"), key)
        if name == "Home" or e.get("is_purchase") or name.lower() == "purchase":
            continue
        if out and e.get("step") and out[-1]["name"] == name:
            out[-1]["parts"].append(e)
            continue
        out.append({"name": name, "parts": [e]})
    return out


class Journey:
    """One journey (opt-in or opt-out) in its own fresh browser context."""

    def __init__(self, browser, brand, recipe, check, journey, product_url, log):
        self.brand, self.recipe, self.check, self.journey, self.log = brand, recipe, check, journey, log
        self.base = brand["url"].rstrip("/")
        self.product_url = product_url
        self.current = "Before consent"
        self.urls = {}
        self.previews = {}
        self.applied = []
        if check == "preview":
            for l in brand["preview_links"]:
                p = parse_preview(l)
                self.previews[p["container"] or "*"] = p
        ua = recipe.get("user_agent") or ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                                          "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
        self.ctx = browser.new_context(viewport={"width": 1366, "height": 900}, user_agent=ua, locale="en-GB",
                                       ignore_https_errors=True)
        if self.previews:
            loader = re.compile("|".join(recipe.get("gtm_loader_patterns") or [r"googletagmanager\.com/gtm\.js"]), re.I)
            self.ctx.route(loader, self.route_loader)
        self.ctx.on("request", self.on_request)
        self.page = self.ctx.new_page()
        self.page.add_init_script(QA_JS)

    def on_request(self, req):
        if req.resource_type in IGNORED_TYPES or not req.url.startswith("http"):
            return
        try:
            post = req.post_data
        except Exception:
            post = None
        if post is None and req.method == "POST":
            # beacons sent while a page unloads sometimes have no text body; read the raw bytes instead
            try:
                post = (req.post_data_buffer or b"").decode("utf-8", "ignore") or None
            except Exception:
                post = None
        self.urls.setdefault(self.current, []).extend(split_batch(req.url, post))

    def route_loader(self, route, request):
        q = dict(parse_qsl(urlparse(request.url).query, keep_blank_values=True))
        cid = q.get("id")
        p = self.previews.get(cid) or self.previews.get("*")
        if p and p["container"] in (None, cid):
            q.update({"gtm_auth": p["gtm_auth"], "gtm_preview": p["gtm_preview"], "gtm_cookies_win": "x"})
            if cid not in self.applied:
                self.applied.append(cid)
            return route.continue_(url=urlunparse(urlparse(request.url)._replace(query=urlencode(q))))
        return route.continue_()

    def label_containers(self, conts):
        """The preview is added by request routing, so the page's script tag still reads as live."""
        out = []
        for c in conts:
            cid = c.split(" ")[0]
            if cid in self.applied:
                p = self.previews.get(cid) or self.previews.get("*") or {}
                env = re.sub(r"\D", "", p.get("gtm_preview", ""))
                c = cid + (f" (PREVIEW env-{env})" if env else " (PREVIEW)")
            if c not in out:
                out.append(c)
        return out

    def settle(self):
        try:
            self.page.wait_for_load_state("load", timeout=20000)
        except Exception:
            pass
        self.page.wait_for_timeout(WAIT_S * 1000)

    def click_first(self, selectors, wait_s):
        deadline = time.time() + wait_s
        while True:
            for sel in selectors:
                try:
                    loc = self.page.locator(sel).first
                    if loc.is_visible(timeout=300):
                        loc.click(timeout=3000)
                        return sel
                except Exception:
                    pass
            if time.time() >= deadline:
                return None
            self.page.wait_for_timeout(400)

    def banner_visible(self, wait_s):
        sels = (self.recipe.get("cookie_banner_accept") or []) + ONETRUST_ACCEPT
        deadline = time.time() + wait_s
        while time.time() < deadline:
            for sel in sels:
                try:
                    if self.page.locator(sel).first.is_visible(timeout=300):
                        return True
                except Exception:
                    pass
            self.page.wait_for_timeout(400)
        return False

    def do(self, part, info):
        a = part.get("action", "goto")
        sel = part.get("selector")
        p = self.page
        if a == "goto":
            p.goto(part["url"].replace("{base_url}", self.base), wait_until="domcontentloaded", timeout=45000)
            return "Opened " + part["url"].replace("{base_url}", self.base)
        if a == "click":
            p.locator(sel).first.click(timeout=part.get("timeout", 15000))
            return "Clicked " + sel
        if a == "click_random":
            loc = p.locator(sel)
            hrefs = loc.evaluate_all("els => els.map(e => e.href || '')")
            vis = [i for i in range(min(len(hrefs), 60)) if loc.nth(i).is_visible()]
            if not vis:
                raise RuntimeError("No product tiles found for " + sel)
            if self.product_url:
                want = urlparse(self.product_url).path.rstrip("/")
                same = [i for i in vis if urlparse(hrefs[i]).path.rstrip("/") == want]
                if not same:
                    # the agreed product isn't on the category page: open it directly and say so
                    p.goto(self.product_url, wait_until="domcontentloaded", timeout=45000)
                    info["via"] = "direct"
                    info["note"] = "The agreed product wasn't on the category page, so its URL was opened directly"
                    return "Opened " + self.product_url + " directly"
                i = same[0]
            else:
                i = vis[min(int(self.recipe.get("product_index", 0)), len(vis) - 1)]   # the same tile in every check
            el = loc.nth(i)
            el.scroll_into_view_if_needed(timeout=5000)
            el.click(timeout=part.get("timeout", 15000))
            return "Clicked the product tile (" + urlparse(hrefs[i]).path + ") on the category page"
        if a == "fill":
            for s, v in part["fields"].items():
                p.locator(s).first.fill(str(v), timeout=10000)
            return "Filled " + ", ".join(part["fields"])
        if a == "wait":
            if sel:
                p.locator(sel).first.wait_for(timeout=part.get("timeout", 20000))
            else:
                p.wait_for_timeout(part.get("ms", 2000))
            return "Waited"
        raise ValueError("Unknown action in the recipe: " + a)

    def save(self, name, via, actions, status, error, out_dir, n):
        rec = {"name": name, "status": status, "via": via, "actions": actions, "wait_s": WAIT_S}
        if error:
            rec["error"] = error
        shot = f"screenshots/{self.journey}-{n:02d}-{re.sub(r'[^a-z]+', '-', name.lower()).strip('-')}.jpg"
        try:
            self.page.screenshot(path=str(out_dir / shot), type="jpeg", quality=55)
            rec["screenshot"] = shot
        except Exception:
            pass
        try:
            cap = self.page.evaluate("([n, how, urls]) => QA.step(n, how, urls)",
                                     [name, {"via": via, "actions": actions, "wait_s": WAIT_S, "version": CAPTURE_VERSION},
                                      self.urls.get(name, [])])
            for k in ("url", "containers", "referrer", "consent", "hits", "datalayer", "cookies", "capture"):
                rec[k] = cap.get(k)
            rec["containers"] = self.label_containers(rec.get("containers") or [])
        except Exception as e:
            rec["url"] = self.page.url.split("?")[0]
            rec["capture_gaps"] = ["all vendors (the capture script couldn't run on this page)"]
            rec["notes"] = "Capture failed: " + str(e).splitlines()[0][:200]
        named = sorted({h["vendor"] for h in rec.get("hits") or [] if not str(h["vendor"]).startswith("Unrecognised")})
        calls = sum(h.get("count", 1) for h in rec.get("hits") or [])
        mark = "✓" if status == "ok" else "✗"
        self.log(f"    {mark} {name:15} {calls:4} calls · {len(named):2} vendors" + (f" · {error}" if error else ""))
        return rec

    def run(self, out_dir):
        steps, n = [], 1
        choice = "Accept all" if self.journey == "opt-in" else "Reject all"
        try:
            # Before consent: the landing page as a fresh visitor, banner untouched
            self.current = "Before consent"
            self.page.goto(self.base + "/", wait_until="domcontentloaded", timeout=45000)
            seen = self.banner_visible(WAIT_S)
            self.settle()
            steps.append(self.save("Before consent", "direct", ["Opened " + self.base + "/ as a fresh visitor",
                                   "Cookie banner " + ("shown, left alone" if seen else "not seen")], "ok", "", out_dir, n))
            # Home: the consent choice
            n += 1
            self.current = "Home"
            self.page.evaluate("() => window.QA && QA.mark()")
            sels = (self.recipe.get("cookie_banner_accept") or []) + ONETRUST_ACCEPT if self.journey == "opt-in" \
                else (self.recipe.get("cookie_banner_reject") or []) + ONETRUST_REJECT
            clicked = self.click_first(sels, 6)
            if not clicked and self.journey == "opt-out":
                # OneTrust banners often have no Reject button: Cookie settings › Reject All instead
                if self.click_first(self.recipe.get("cookie_settings") or ONETRUST_SETTINGS, 2):
                    self.page.wait_for_timeout(1500)
                    inner = self.click_first(self.recipe.get("cookie_settings_reject") or ONETRUST_PC_REJECT, 4)
                    clicked = inner and "Cookie settings › " + inner
            self.page.wait_for_timeout(WAIT_S * 1000)
            if clicked:
                steps.append(self.save("Home", "action", [f"Clicked {choice} ({clicked})"], "ok", "", out_dir, n))
            else:
                steps.append(self.save("Home", "action", [], "partial", f"{choice} button not found on the cookie banner", out_dir, n))
        except Exception as e:
            steps.append(self.save(self.current, "direct", [], "failed", type(e).__name__ + ": " + str(e).splitlines()[0][:200], out_dir, n))
            return steps
        for grp in journey_steps(self.recipe):
            n += 1
            name = grp["name"]
            self.current = name
            actions, info, via = [], {}, ""
            try:
                before = self.page.url.split("?")[0]
                for part in grp["parts"]:
                    act = part.get("action", "goto")
                    if act != "goto":
                        self.page.evaluate("() => window.QA && QA.mark()")
                    actions.append(self.do(part, info))
                    via = via or info.get("via") or VIA_OF_ACTION.get(act, "action")
                # a click that stays on the same page (Add to basket) is an in-page action
                if via == "click" and self.page.url.split("?")[0] == before:
                    via = "action"
                self.settle()
                rec = self.save(name, via, actions, "ok", "", out_dir, n)
                if info.get("note"):
                    rec["notes"] = info["note"]
                steps.append(rec)
                if name == "Product" and not self.product_url:
                    self.product_url = self.page.url.split("?")[0]
            except Exception as e:
                err = type(e).__name__ + ": " + str(e).splitlines()[0][:200]
                steps.append(self.save(name, via or "direct", actions, "failed", err, out_dir, n))
                break   # later steps would start from the wrong page
        return steps

    def close(self):
        try:
            self.ctx.close()
        except Exception:
            pass


def run_check(name, check, headed=False, only=None, log=print, no_preview=False):
    """Run one check for every brand of the release (or just `only`). Returns {site: summary}."""
    from playwright.sync_api import sync_playwright
    rel = release.load(name)
    brands = [b for b in rel["brands"] if not only or b["site"] in only]
    if no_preview:
        for b in brands:
            b["preview_links"] = []
    out = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        for b in brands:
            recipe = release.recipe(b["site"])
            st = release.state(name).get(b["site"], {})
            product = b.get("product_url") or st.get("product_url") or ""
            out_dir = release.RUNS / name / b["site"] / check
            (out_dir / "screenshots").mkdir(parents=True, exist_ok=True)
            log(f"\n{b['site']} · {check}" + (f" · product {urlparse(product).path}" if product else ""))
            started = datetime.now().isoformat(timespec="seconds")
            results = {"meta": {}, "steps": [], "optout": {"steps": []}}
            applied, loaded = set(), set()
            for j in rel["journeys"]:
                log(f"  {j} journey (fresh visitor, {'Accept all' if j == 'opt-in' else 'Reject all'})")
                jr = Journey(browser, b, recipe, check, j, product, log)
                try:
                    steps = jr.run(out_dir)
                finally:
                    jr.close()
                product = product or jr.product_url
                applied.update(jr.applied)
                for s in steps:
                    loaded.update(s.get("containers") or [])
                if j == "opt-in":
                    results["steps"] = steps
                else:
                    results["optout"]["steps"] = steps
            if check == "preview" and not no_preview:
                missing = [p for p in (parse_preview(l)["container"] for l in b["preview_links"]) if p and p not in applied]
                if missing:
                    log(f"  ! preview not applied to {', '.join(missing)}: that container never loaded on these pages")
            results["meta"] = {"url": b["url"], "site": b["site"], "check": check, "env": "production",
                               "noise_test": bool(no_preview),
                               "tester": rel.get("tester", ""), "started": started, "product_url": product,
                               "capture_version": CAPTURE_VERSION, "capture_method": "playwright",
                               "tool": "gtm-qa-wizard " + __version__,
                               "tag_assistant": "not used: findings come from the calls that reached each vendor",
                               "gtm_containers_loaded": sorted(loaded), "preview_applied_to": sorted(applied)}
            (out_dir / "results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
            if product and not st.get("product_url"):
                release.save_state(name, **{b["site"]: dict(st, product_url=product)})
            bad = [s["name"] for s in results["steps"] + results["optout"]["steps"] if s["status"] != "ok"]
            out[b["site"]] = {"ok": not bad, "bad": bad, "path": out_dir / "results.json"}
            log(f"  saved {(out_dir / 'results.json').relative_to(release.ROOT)}" + (f" · steps not completed: {', '.join(bad)}" if bad else ""))
        browser.close()
    return out
