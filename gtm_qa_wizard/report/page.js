/* report.html: runs the comparison engine on the data embedded as window.REPORT and draws one
   section per brand. window.__summary is read back by `gtm-qa report` to print the result. */
(function(){
const R=window.REPORT;const $=s=>document.querySelector(s);
// events a noise test showed differ between two identical runs (sites/<site>.json noise_events):
// left out of the comparison and listed under Not compared
function stripNoise(r,noise){
  if(!r||!noise.length)return[r,0];
  const hit=h=>noise.some(n=>{const [v,e]=n.includes(':')?n.split(':'):['',n];return(!v||h.vendor===v)&&[h.event,(h.params||{}).en,(h.params||{}).ev,(h.params||{}).event].includes(e);});
  const c=JSON.parse(JSON.stringify(r));let n=0;
  [c.steps||[],(c.optout&&c.optout.steps)||[]].forEach(L=>L.forEach(s=>{const k=(s.hits||[]).length;s.hits=(s.hits||[]).filter(h=>!hit(h));n+=k-s.hits.length;}));
  return[c,n];
}
function brandResult(b){
  const noise=b.noise_events||[];const [lv,n1]=stripNoise(b.live,noise),[pv,n2]=stripNoise(b.preview,noise);b={...b,live:lv,preview:pv};
  S.naming=null;S.nmIdx=null;S.tmap=b.tmap||null;S.rel.cfg.previews=b.preview_links||[];
  if(b.naming)S.naming=b.naming;
  else if(b.exports){const B=nmSide(b.exports.before,'before export'),A=nmSide(b.exports.after,'after export');const all=nmCompare(B,A);
    S.naming={items:all.filter(i=>i.s!=='same'),containers:[A.pub],counts:nmCounts(all)};S.tmap={before:tmapOf([B]),after:tmapOf([A])};}
  const cmp={N:{benchmark:b.live?norm(b.live):null,preview:b.preview?norm(b.preview):null,postlive:null}};
  const G=rgCheck(cmp),LS=rgLists(G,cmp);
  if(n1+n2)G.cov.push('Known noise for this site, left out ('+(n1+n2)+' calls): '+noise.join(', ')+'. Listed in noise_events in sites/'+b.site+'.json');
  // key values (dataLayer and GTM variables) that are empty, broken or different in Preview, by the tester page's rules
  const V=(cmp.N.benchmark&&cmp.N.preview?regression(cmp).rows:[]).filter(r=>r.cat==='variable'&&r.st==='broken');
  return{G,LS,cmp,V};
}
// The tag a failed row is about, matched from the container exports: same vendor, and the tag's job
// (its name without vendor and naming-convention words) matches the event that broke. Shown as
// "likely" because it's matched from the exports, not seen firing.
function likelyCause(x){
  if(!S.tmap||!S.tmap.before||!S.tmap.after)return[];
  const jobs=new Set();(x.agg?[x.ev]:x.iss.map(i=>i.ev)).filter(Boolean).forEach(e=>jobs.add(rgFlat(e)));
  (x.agg?x.tags:x.iss.map(i=>i.tag)).filter(Boolean).forEach(t=>jobs.add(tagJob(t)));
  const J=[...jobs].filter(j=>j.length>2);if(!J.length)return[];
  const fits=n=>tagVendor(n)===x.vendor&&!BASE_TAG.test(n)&&J.some(j=>{const t=tagJob(n);return t.length>2&&(t===j||t.includes(j)||j.includes(t));});
  const out=[],seen=new Set();
  Object.keys(S.tmap.before.tags).filter(fits).forEach(was=>{const L=nmLook('tag','benchmark',was);const it=L&&L.it;
    const now=it&&!/removed/.test(it.s)?it.b:'';seen.add(now);out.push({was,now,removed:!!(it&&it.s==='removed'),it});});
  Object.keys(S.tmap.after.tags).filter(n=>fits(n)&&!seen.has(n)).forEach(now=>{const L=nmLook('tag','preview',now);const it=L&&L.it;out.push({was:it&&it.a&&it.s!=='added'?it.a:'',now,added:!!(it&&it.s==='added'),it});});
  return out.slice(0,3).map(c=>{const tb=c.was?trgShort(tagTriggers('before',c.was)):'',ta=c.now?trgShort(tagTriggers('after',c.now)):'';
    const d=((c.it&&c.it.d)||[]).filter(z=>z.f!=='paired by reviewer').slice(0,3).map(z=>z.f+': '+z.a+' → '+z.b);
    return(c.removed?c.was+' was removed from the workspace':c.added?c.now+' is new in this release':(c.was&&c.now&&c.was!==c.now?c.was+' → '+c.now:(c.now||c.was)))
      +(tb&&ta&&tb!==ta?'. Trigger was: '+tb+'. Trigger now: '+ta:ta?'. Trigger: '+ta:tb?'. Trigger was: '+tb:'')+(d.length?'. Changed: '+d.join('; '):'');});
}
const det=(t,items,open)=>'<details'+(open?' open':'')+'><summary>'+esc(t)+'</summary>'+(items.length?'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="muted">None.</p>')+'</details>';
function checkInfo(b,cmp){
  const rows=[['Default / Live',b.live,cmp.N.benchmark],['Preview',b.preview,cmp.N.preview]].map(([n,raw,N])=>{
    if(!N)return'<tr><td>'+n+'</td><td colspan="4" class="muted">Not run yet: uv run gtm-qa run '+esc(R.release.name)+' '+(n==='Preview'?'preview':'live')+'</td></tr>';
    const all=N.steps.concat(N.optout||[]),bad=all.filter(s=>/fail|partial/.test(s.status));
    return'<tr><td>'+n+'</td><td class="mono">'+esc(N.meta.containers.join(', '))+'</td><td>'+esc((raw.meta||{}).started||'')+'</td><td class="mono">'+esc(N.meta.product?new URL(N.meta.product).pathname:'')+'</td><td>'+(bad.length?bad.map(s=>'<div class="bad">'+esc(s.name+': '+(s.error||s.status))+'</div>').join(''):all.length+' steps done')+'</td></tr>';}).join('');
  return'<table><thead><tr><th>Check</th><th>Containers loaded</th><th>Started</th><th>Product</th><th>Steps</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
// a failed row's detail: why it failed, then the likely cause from the exports
const rowHtml=x=>{let h=rgRowHtml(x,false);const lc=x.st==='fail'?likelyCause(x):[];
  if(lc.length)h=h.replace('</ul></td>',lc.map(t=>'<li><b>Likely cause (from the exports):</b> '+esc(t)+'</li>').join('')+'</ul></td>');return h;};
// the dataLayer push that last set a key at a step, as the runner recorded it (runs from before this have none)
function dlSource(raw,scen,stepName,key){
  if(!raw)return'';const L=scen==='Opt-out'?((raw.optout||{}).steps||[]):(raw.steps||[]);
  const st=L.find(s=>s.name===stepName);const x=st&&st.variable_sources&&st.variable_sources[key];if(!x)return'';
  return'Set by '+(x.event?'event '+x.event:'a push with no event')+' (dataLayer push '+x.push+(x.pushes>1?', last of '+x.pushes+' pushes setting it':'')+')';
}
const srcDiv=t=>t?'<div class="why">'+esc(t)+'</div>':'';
const varTable=(V,b)=>'<div class="tablewrap"><table><thead><tr><th>Result</th><th>Journey / action</th><th>Variable</th><th>Live</th><th>Preview</th><th>What</th></tr></thead><tbody>'
  +V.map(r=>'<tr><td>'+pill('fail','Failed')+'</td><td>'+esc(r.scen+' · '+r.action.name)+'</td><td class="mono">'+esc(r.tag)+(r.was?'<div class="why">was '+esc(r.was)+'</div>':'')+'</td><td class="mono">'+esc(String(r.live).slice(0,200))+srcDiv(dlSource(b.live,r.scen,r.action.name,r.was||r.tag))+'</td><td class="mono">'+esc(String(r.cur).slice(0,200))+srcDiv(dlSource(b.preview,r.scen,r.action.name,r.tag))+'</td><td>'+esc(r.what)+(r.detail.length?'<div class="why">'+r.detail.map(esc).join('<br>')+'</div>':'')+'</td></tr>').join('')+'</tbody></table></div>';
// ---- Live only: one check (e.g. after publishing), no comparison. Same table, Live columns only.
// A row fails when, on its own, the check shows tracking that's wrong:
//   consent: a vendor sends calls before the consent choice or after Reject all (strictly necessary
//            vendors excepted; Google calls only when their gcs flag says consent was granted)
//   tag failed: Tag Assistant shows a tag that failed
//   key value broken: a call carries [object Object], NaN or {}
RULE_TXT[6]='Tag failed';
const GRANTED_GCS=/^G1(1.|.1)$/;
function auditCheck(N){
  const rows=[],cov=new Set();
  SCENS.forEach(([sk,scen])=>{
    const L=sk==='steps'?N.steps:(N.optout||[]);
    if(!L.length){cov.add(scen+' journey wasn’t run');return;}
    if(!L.some(s=>s.tags.length))cov.add(scen+': no Tag Assistant data, so only vendor calls were checked');
    L.forEach(s=>{
      const strict=sk==='optout'||CONSENT_STEP(s.key);
      const m={};s.hits.forEach(h=>{if(/^Unrecognised/i.test(h.vendor)||NON_GTM.test(h.vendor)||NOT_COMPARED.test(h.vendor))return;
        const e=m[h.vendor]||(m[h.vendor]={named:{},un:0,all:0,params:[]});e.params.push(h.params||{});
        if(urlish(h.ev))e.un+=h.n;else if(!BEHAVIOUR.test(h.ev)){const x=e.named[h.ev]||(e.named[h.ev]={n:0,params:h.params,all:[]});x.n+=h.n;x.all.push(h.params||{});}else return;e.all+=h.n;});
      const T=s.tags.map(t=>({name:t.name,fail:t.status==='fail',v:tagVendor(t.name)}));
      const E={named:{},un:0,all:0,params:[]};
      new Set([...Object.keys(m),...T.map(t=>t.v)].filter(Boolean)).forEach(v=>{
        const r=m[v]||E,tr=T.filter(t=>t.v===v),iss=[];const add=(rule,text,o)=>iss.push(Object.assign({rule,text},o||{}));
        if(s.gaps.some(g=>String(g).toLowerCase()===v.toLowerCase()))cov.add(scen+' · '+s.name+': '+v+' wasn’t captured');
        if(strict&&r.all&&!NECESSARY_V.test(v)){
          if(GOOGLE_V.test(v)){const g=r.params.map(p=>String(p.gcs||'')).filter(x=>GRANTED_GCS.test(x));
            if(g.length)add(3,v+' sent with consent granted ('+g[0]+') '+rgWhen(s.key));}
          else{const evs=Object.keys(r.named);
            if(evs.length)evs.forEach(e=>add(3,v+' '+e+' sent '+rgWhen(s.key)+' (×'+r.named[e].n+')',{ev:e}));
            else add(3,v+' calls sent '+rgWhen(s.key)+' (×'+r.un+')');}}
        tr.filter(t=>t.fail).forEach(t=>add(6,t.name+' failed (Tag Assistant)'));
        Object.keys(r.named).forEach(e=>(r.named[e].all||[]).forEach(p=>Object.keys(p).forEach(k=>{
          if(BAD_VALUE.test(String(p[k]))&&!iss.some(i=>i.rule===4&&i.k===k&&i.ev===e))add(4,e+': '+k+' = '+p[k],{ev:e,k});})));
        rows.push({scen,step:s.name,stepKey:s.key,vendor:v,strict,st:iss.length?'fail':'pass',iss,r,c:E,tr:tr.map(t=>({name:t.name,fail:t.fail})),tc:[]});
      });
    });
  });
  const SI={'Opt-in':0,'Opt-out':1};
  rows.sort((a,b)=>(a.st==='fail'?0:1)-(b.st==='fail'?0:1)||SI[a.scen]-SI[b.scen]||stepIdx(a.stepKey)-stepIdx(b.stepKey)||a.vendor.localeCompare(b.vendor));
  return{rows,failed:rows.filter(x=>x.st==='fail'),checked:rows.length,cov:[...cov]};
}
const auditRow=x=>'<tr><td>'+pill(x.st==='fail'?'fail':'pass',x.st==='fail'?'Failed':'Passed')+'</td>'
  +'<td style="min-width:200px"><b style="font-weight:500">'+esc(x.scen+' · '+x.step)+'</b><div class="why">'+esc(x.vendor)+'</div>'
  +(x.st==='fail'?'<ul class="steplist" style="margin-top:4px">'+x.iss.map(i=>'<li>'+esc(RULE_TXT[i.rule]+': '+i.text)+'</li>').join('')+'</ul>':'')+'</td>'
  +'<td>'+esc(rgTracked(x,'live'))+'</td><td>'+rgTagCell(rgTags(x,'live'))+'</td></tr>';
const auditTable=L=>'<div class="tablewrap"><table><thead><tr><th>Result</th><th>Journey / action</th><th>Getting tracked? (Live)</th><th>Tag fired (Live)</th></tr></thead><tbody>'+L.map(auditRow).join('')+'</tbody></table></div>';
function auditSection(b,i){
  const noise=b.noise_events||[];const [lv,n]=stripNoise(b.live,noise);const N=norm(lv);const A=auditCheck(N);
  if(n)A.cov.push('Known noise for this site, left out ('+n+' calls): '+noise.join(', '));
  const nf=A.failed.length,st=nf?'fail':'pass',passed=A.rows.filter(x=>x.st!=='fail');
  const html='<section id="b'+i+'"><h2>'+esc(b.site)+' '+pill(st,nf?nf+' failed':'Passed')+' '+pill('info','Live only')+'</h2>'
    +'<p class="line"><b>'+(nf?'Failed':'Passed')+': '+nf+' failed of '+A.checked+' checked</b> · Live only, no comparison</p>'
    +'<p class="muted">One check of the live container, judged on its own: a row fails when a vendor sends calls before the consent choice or after Reject all (strictly necessary vendors excepted; Google only when its calls say consent was granted), when Tag Assistant shows a failed tag, or when a call carries a broken value ([object Object], NaN, {}).</p>'
    +(nf?auditTable(A.failed):'<p>Nothing failed.</p>')
    +'<details><summary>Passed: '+passed.length+'</summary>'+auditTable(passed)+'</details>'
    +(A.cov.length?det('Not checked: '+A.cov.length,A.cov):'')
    +'<details><summary>The check</summary>'+checkInfo({live:b.live,preview:null},{N:{benchmark:N,preview:null}}).replace(/<tr><td>Preview<\/td>.*?<\/tr>/,'')+'</details></section>';
  return{html,out:{site:b.site,status:st,failed:nf,checked:A.checked,notes:[],mode:'live-only',noise_suggest:[]}};
}
const out=[];let html='';
R.brands.forEach((b,i)=>{
  if(b.live&&(R.live_only||!b.preview)){const a=auditSection(b,i);html+=a.html;out.push(a.out);return;}
  const {G,LS,cmp,V}=brandResult(b);const nf=G.failed.length+V.length;
  const st=!G.pairs.length?'skip':nf?'fail':'pass';
  // what a noise test found: the events to consider adding to the site's noise_events
  const suggest=b.preview&&b.preview.meta&&b.preview.meta.noise_test?[...new Set(G.failed.flatMap(x=>x.agg?[x.vendor+':'+x.ev]:x.iss.map(i=>i.ev?x.vendor+':'+i.ev:'').filter(Boolean)))]:[];
  out.push({site:b.site,status:st,failed:nf,checked:G.checked,notes:G.notes,noise_suggest:suggest});
  const passed=G.rows.filter(x=>x.st!=='fail');
  html+='<section id="b'+i+'"><h2>'+esc(b.site)+' '+pill(st==='skip'?'skip':st,st==='skip'?'Not compared yet':st==='fail'?nf+' failed':'Passed')+'</h2>'
    +(b.preview&&b.preview.meta&&b.preview.meta.noise_test?'<p class="line"><b>Noise test:</b> the preview check ran on the live container, so this compares Live with Live. Any failure here is noise, not a break.</p>':'')
    +(G.pairs.length?'<p class="line"><b>'+(nf?'Failed':'Passed')+': '+nf+' failed of '+G.checked+' checked</b>'+(V.length?' ('+G.failed.length+' in vendor calls, '+V.length+' key value'+(V.length>1?'s':'')+')':'')+' · Default / Live vs Preview'+(G.notes.length?'<br><span class="muted">'+esc(G.notes.join(' · '))+'</span>':'')+'</p>'
      +(G.failed.length?'<div class="tablewrap"><table><thead><tr><th>Result</th><th>Journey / action</th><th>Getting tracked? (Live)</th><th>Getting tracked? (Preview)</th><th>Tag fired (Live)</th><th>Tag fired (Preview)</th></tr></thead><tbody>'+G.failed.map(rowHtml).join('')+'</tbody></table></div>'
        :'<p>Nothing failed in the vendor calls: every vendor that tracked on Live still tracks in Preview, with the same key values and consent behaviour.</p>')
      +(V.length?'<h3>Key values that broke ('+V.length+')</h3><p class="muted">Values read from the GTM dataLayer at the end of each step, under each value the push that set it. Values that carry tracking data (value, price, currency, items, IDs, consent) that are empty, broken or different in Preview. Values that change on every visit are left out.</p>'+varTable(V,b):'')
      +'<details><summary>Passed: '+passed.length+'</summary><div class="tablewrap"><table><thead><tr><th>Result</th><th>Journey / action</th><th>Getting tracked? (Live)</th><th>Getting tracked? (Preview)</th><th>Tag fired (Live)</th><th>Tag fired (Preview)</th></tr></thead><tbody>'+passed.map(x=>rgRowHtml(x,false)).join('')+'</tbody></table></div></details>'
      +(S.naming?det('Removed or added in this release: '+LS.ra.length,LS.ra.map(raTxt))+det('Settings changes that can affect tracking: '+LS.set.length,LS.set):'')
      +(G.cov.length?det('Not compared: '+G.cov.length,G.cov):'')
      :'<p class="muted">Run both checks to compare them.</p>')
    +'<details><summary>The checks</summary>'+checkInfo(b,cmp)+'</details></section>';
});
const nf=out.reduce((a,o)=>a+o.failed,0);
$('#summary').innerHTML='<table><thead><tr><th>Brand</th><th>Result</th><th>Checked</th></tr></thead><tbody>'+out.map((o,i)=>'<tr><td><a href="#b'+i+'">'+esc(o.site)+'</a></td><td>'+pill(o.status==='skip'?'skip':o.status,o.status==='skip'?'Not compared yet':o.status==='fail'?o.failed+' failed':'Passed')+'</td><td>'+(o.checked||'–')+'</td></tr>').join('')+'</tbody></table>';
$('#verdict').textContent=out.every(o=>o.status==='skip')?'Nothing compared yet':nf?nf+' failure'+(nf>1?'s':'')+' across '+out.filter(o=>o.failed).length+' brand'+(out.filter(o=>o.failed).length>1?'s':''):'Passed on every brand compared';
$('#verdict').className=nf?'bad':'good';
$('#brands').innerHTML=html;
window.__summary=out;
})();
