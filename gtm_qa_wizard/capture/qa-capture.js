/* GTM tester – shared capture script (capture standard v4).
 *
 * Inject the same file on every page of every check so the checks stay comparable:
 *   QA.boost()      straight after injecting on every page: lifts the browser's 250-entry resource log cap
 *                   and starts the wait clock, so wait_s is measured from the navigation or click
 *   QA.mark()       just before an in-page action (e.g. add to basket), so only its calls are saved
 *   QA.save(step, how)  after the step settles; returns a short summary and stores the step.
 *                   how = {via:'direct'|'click'|'action', actions:['what you did', ...]}
 *                   The seconds waited, the referrer and this page's own cookies are added automatically.
 *   QA.dump()       writes all saved steps into the page as JSON so they can be read in one go
 *   QA.clear()      removes everything this script stored on the site
 *   QA.step(step, how, urls)  for gtm_tester.py (Playwright): builds the same step from a list of
 *                   request URLs the runner captured itself, without storing anything on the site
 *
 * Hits are stored as vendor + raw event name (GA4 en, Meta ev, Floodlight type/cat,
 * Ads label, ...) with a count, never as hand-written descriptions. Script and CSS loads
 * are left out. cid/sid/uid and anything that looks like an email or phone number are dropped.
 * Steps are kept in localStorage under __qaS on the site's origin until QA.clear().
 * v3 (2026-10-29): each step also records how the page was reached (via + actions), the seconds
 * waited before saving, and the referrer, so the tester can check the journeys match.
 * 2026-11-10: Listrak now matches only listrak/listrakbi hosts (it used to match "ltk" anywhere in a URL,
 * so Criteo and CHEQ calls were labelled Listrak), and Criteo Retail Media /rm beacons have their own vendor.
 * v4 (2026-11-13): Snapchat price, currency and item IDs (e_pr, e_cur, e_iids) are kept, so price
 * changes show. Pinterest /v3, TikTok and Meta calls whose event is only in the request body are
 * recorded as "(event in body, not readable)" instead of looking like a missing event; Playwright
 * runs pass the bodies to QA.step, so there the event is read. wait_s is measured from QA.boost().
 */
(function () {
  var VENDORS = [
    ['GA4', /\/g\/collect/, 'en'],
    ['Google Ads', /googleads\.g\.doubleclick\.net\/pagead\/(viewthroughconversion|conversion)|google(adservices)?\.[a-z.]+\/pagead\/(1p-)?(user-list|conversion)|\/ccm\/collect|\/rmkt\/collect|googlesyndication\.com\/ccm/, 'label'],
    ['Floodlight', /fls\.doubleclick\.net|ad\.doubleclick\.net\/activity|\/activityi/, ''],
    ['Meta', /facebook\.com\/tr/, 'ev'],
    ['TikTok', /analytics\.tiktok\.com\/api\/v2\/pixel/, 'event'],
    ['Snapchat', /tr\d*\.snapchat\.com\/p/, 'ev'],
    ['Pinterest', /ct\.pinterest\.com\/(v3|user)/, 'event'],
    ['Bing', /bat\.bing\.com\/action/, 'evt'],
    ['X/Twitter', /analytics\.twitter\.com\/(1\/)?i\/adsct|t\.co\/(1\/)?i\/adsct/, ''],
    ['Criteo Retail Media', /\.criteo\.(com|net)\/rm(\/|\?|$)/, 'ev'],
    ['Criteo', /sslwidget\.criteo\.com\/event|dynamic\.criteo/, ''],
    ['Listrak', /\/\/[^/?#]*listrak(bi)?\.(com|net)\//i, ''],
    ['Dynamic Yield', /dynamicyield\.com\/(st|batch|var|uia|dpx|pd|spa)/i, ''],
    ['Contentsquare', /contentsquare\.net\/(pageview|dvar|v2\/events)/i, ''],
    ['Line', /tr\.line\.me/, 'e'],
    ['Xandr', /adnxs\.com\/(px|pixie)/, 'e'],
    ['Yandex', /mc\.yandex/, ''],
    ['AppsFlyer', /appsflyer/i, ''],
    ['CHEQ', /seroundprince|cheqzone/i, ''],
    ['RTB House', /creativecdn\.com\/tags/i, ''],
    ['Awin', /dwin1|awin1/i, ''],
    ['Reddit', /reddit\.com\/rp/, 'event'],
    ['Made With Intent', /madewithintent|intently|intent\.ly/i, ''],
    ['THG Altitude', /thgaltitude/, '']
  ];
  var KEEP = /^(en|ev|event|label|cat|type|src|gcs|gcd|npa|dma|cu|currency|value|evt|e|a|tid|transaction_id|e_pr|e_cur|e_iids)$|^(ep|epn)\.|^cd\[|^pr\d|^u\d+$/;
  var DROP = /^(cid|sid|uid|_?em|ph|email|phone)$|^(ep|up)\.(.*email.*|.*phone.*|.*_hash.*)$/i;
  var TRACKERISH = /collect|pixel|track|event|beacon|\/tr\b|\/p\b|activity|conversion|adsct|analytics|tag/i;

  function eventName(vendor, field, p, path) {
    if (vendor === 'Floodlight') return (p.type || '') + '/' + (p.cat || '');
    if (field && p[field] && p[field] !== '{}') return p[field];
    return '';
  }

  function hits() {
    var since = window.__qaT0 || 0;
    return hitsFrom(performance.getEntriesByType('resource').filter(function (e) { return e.startTime >= since; }).map(function (e) { return e.name; }));
  }

  // same vendor table, parameter filter and grouping for every way a check is run
  function hitsFrom(urls) {
    var out = [], unknown = {};
    urls.forEach(function (u) {
      if (/\.(js|css)(\?|$)/.test(u)) return;
      var U; try { U = new URL(u); } catch (x) { return; }
      var v = VENDORS.find(function (x) { return x[1].test(u); });
      if (!v) {
        if (U.host !== location.host && TRACKERISH.test(U.pathname) && !/\.(png|jpe?g|gif|webp|svg|woff2?)$/i.test(U.pathname)) unknown[U.host] = (unknown[U.host] || 0) + 1;
        return;
      }
      var p = {};
      U.searchParams.forEach(function (val, k) { if (KEEP.test(k) && !DROP.test(k) && !/@/.test(val)) p[k] = val.slice(0, 120); });
      U.pathname.split(';').slice(1).forEach(function (s) { var kv = s.split('='); if (kv[0] && KEEP.test(kv[0]) && kv[1]) p[kv[0]] = kv[1].slice(0, 80); });
      var body = /^(Pinterest|TikTok|Meta)$/.test(v[0]) && (v[0] !== 'Pinterest' || /\/v3\//.test(U.pathname));
      out.push({ vendor: v[0], event: eventName(v[0], v[2], p, U.pathname) || (body ? '(event in body, not readable)' : U.host + U.pathname.split(';')[0].slice(0, 40)), params: p });
    });
    var m = {};
    out.forEach(function (h) {
      var k = h.vendor + '|' + h.event + '|' + JSON.stringify(Object.keys(h.params).sort());
      if (!m[k]) m[k] = { vendor: h.vendor, event: h.event, count: 0, params: h.params };
      m[k].count++;
    });
    var list = Object.keys(m).map(function (k) { return m[k]; });
    Object.keys(unknown).forEach(function (host) { list.push({ vendor: 'Unrecognised: ' + host, event: '(calls)', count: unknown[host], params: {} }); });
    return list;
  }

  function build(name, how, h) {
    how = how || {};
    var s = state(), from = window.__qaT0 || 0;
    return { name: name, url: location.href.split('?')[0], containers: s.cont,
      via: how.via || (from ? 'action' : ''), actions: how.actions || [],
      wait_s: how.wait_s != null ? how.wait_s : Math.round((performance.now() - (from || window.__qaW0 || 0)) / 100) / 10,
      referrer: document.referrer ? document.referrer.split('?')[0] : '',
      consent: Object.assign({}, s.cs, { update_fired: s.updated }), hits: h, datalayer: s.dl, cookies: s.ck,
      capture: { version: how.version || 'capture-standard-v4', resources: performance.getEntriesByType('resource').length, cap_hit_before_boost: !!window.__qaCapHit } };
  }

  function state() {
    var ics = (window.google_tag_data || {}).ics, cs = {};
    if (ics && ics.entries) ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'].forEach(function (k) {
      var e = ics.entries[k] || {}; cs[k] = (e.update !== undefined ? e.update : e.default) ? 'granted' : 'denied';
    });
    var dl = (window.dataLayer || []).slice(window.__qaDl0 || 0).map(function (e) {
      if (!e || !e.event) return null;
      var o = { event: e.event };
      if (e.event_name) o.event_name = e.event_name;
      var ec = e.ecommerce;
      if (ec) {
        if (ec.currency) o.currency = ec.currency;
        if (ec.value !== undefined) o.value = ec.value;
        if (ec.transaction_id) o.transaction_id = ec.transaction_id;
        if (ec.items && ec.items[0] && ec.items[0].item_id) { o.items = ec.items.length; o.first = ec.items[0].item_id + '|' + String(ec.items[0].item_name || '').slice(0, 40) + '|' + ec.items[0].price; }
      }
      return o;
    }).filter(Boolean);
    var cont = [].slice.call(document.scripts).map(function (s) { return s.src; }).filter(function (s) { return /gtm\.js/.test(s); }).map(function (s) {
      var U = new URL(s), env = (U.searchParams.get('gtm_preview') || '').replace(/\D/g, '');
      return U.searchParams.get('id') + (env ? ' (PREVIEW env-' + env + ')' : ' (live)');
    });
    cont = cont.filter(function (c, i) { return cont.indexOf(c) === i && !(/live/.test(c) && cont.some(function (d) { return d.indexOf(c.split(' ')[0]) === 0 && /PREVIEW/.test(d); })); });
    var ck = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); }).filter(function (n) { return n && n.length < 60; });
    return { cs: cs, dl: dl, cont: cont, ck: ck, updated: dl.some(function (d) { return /gtm_consent_update|OneTrustGroupsUpdated|consent_update/i.test(d.event); }) };
  }

  window.QA = {
    version: 'capture-standard-v4',
    boost: function () { var full = performance.getEntriesByType('resource').length >= 250; performance.setResourceTimingBufferSize(20000); window.__qaCapHit = full; window.__qaW0 = performance.now(); return full ? 'cap already hit: some early calls may be missing' : 'ok'; },
    mark: function () { window.__qaT0 = performance.now(); window.__qaDl0 = (window.dataLayer || []).length; return 'marked'; },
    save: function (name, how) {
      var step = build(name, how, hits());
      var all = JSON.parse(localStorage.__qaS || '{}'); all[name] = step; localStorage.__qaS = JSON.stringify(all);
      window.__qaT0 = 0; window.__qaDl0 = 0;
      return name + ': ' + step.hits.length + ' calls, ' + step.datalayer.length + ' dataLayer events, ' + step.cookies.length + ' cookies, waited ' + step.wait_s + ' s, ' + step.containers.join(', ');
    },
    step: function (name, how, urls) { var step = build(name, how, hitsFrom(urls || [])); window.__qaT0 = 0; window.__qaDl0 = 0; return step; },
    dump: function () { var pre = document.createElement('pre'); pre.id = 'qa-dump'; pre.textContent = localStorage.__qaS || '{}'; document.body.innerHTML = ''; var a = document.createElement('article'); a.appendChild(pre); document.body.appendChild(a); return 'dumped'; },
    clear: function () { Object.keys(localStorage).filter(function (k) { return /^__qa/.test(k); }).forEach(function (k) { localStorage.removeItem(k); }); return 'cleared'; }
  };
  return 'QA ready';
})();
