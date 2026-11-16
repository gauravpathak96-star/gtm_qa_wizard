/* report.html: runs the comparison engine on the data embedded as window.REPORT and draws one
   section per brand. window.__summary is read back by `gtm-qa report` to print the result. */
(function(){
const R=window.REPORT;const $=s=>document.querySelector(s);
function brandResult(b){
  S.naming=null;S.nmIdx=null;S.tmap=b.tmap||null;S.rel.cfg.previews=b.preview_links||[];
  if(b.naming)S.naming=b.naming;
  else if(b.exports){const B=nmSide(b.exports.before,'before export'),A=nmSide(b.exports.after,'after export');const all=nmCompare(B,A);
    S.naming={items:all.filter(i=>i.s!=='same'),containers:[A.pub],counts:nmCounts(all)};S.tmap={before:tmapOf([B]),after:tmapOf([A])};}
  const cmp={N:{benchmark:b.live?norm(b.live):null,preview:b.preview?norm(b.preview):null,postlive:null}};
  const G=rgCheck(cmp),LS=rgLists(G,cmp);return{G,LS,cmp};
}
const det=(t,items,open)=>'<details'+(open?' open':'')+'><summary>'+esc(t)+'</summary>'+(items.length?'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="muted">None.</p>')+'</details>';
function checkInfo(b,cmp){
  const rows=[['Default / Live',b.live,cmp.N.benchmark],['Preview',b.preview,cmp.N.preview]].map(([n,raw,N])=>{
    if(!N)return'<tr><td>'+n+'</td><td colspan="4" class="muted">Not run yet: uv run gtm-qa run '+esc(R.release.name)+' '+(n==='Preview'?'preview':'live')+'</td></tr>';
    const all=N.steps.concat(N.optout||[]),bad=all.filter(s=>/fail|partial/.test(s.status));
    return'<tr><td>'+n+'</td><td class="mono">'+esc(N.meta.containers.join(', '))+'</td><td>'+esc((raw.meta||{}).started||'')+'</td><td class="mono">'+esc(N.meta.product?new URL(N.meta.product).pathname:'')+'</td><td>'+(bad.length?bad.map(s=>'<div class="bad">'+esc(s.name+': '+(s.error||s.status))+'</div>').join(''):all.length+' steps done')+'</td></tr>';}).join('');
  return'<table><thead><tr><th>Check</th><th>Containers loaded</th><th>Started</th><th>Product</th><th>Steps</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
const out=[];let html='';
R.brands.forEach((b,i)=>{
  const {G,LS,cmp}=brandResult(b);const nf=G.failed.length;
  const st=!G.pairs.length?'skip':nf?'fail':'pass';
  out.push({site:b.site,status:st,failed:nf,checked:G.checked,notes:G.notes});
  const passed=G.rows.filter(x=>x.st!=='fail');
  html+='<section id="b'+i+'"><h2>'+esc(b.site)+' '+pill(st==='skip'?'skip':st,st==='skip'?'Not compared yet':st==='fail'?nf+' failed':'Passed')+'</h2>'
    +(b.preview&&b.preview.meta&&b.preview.meta.noise_test?'<p class="line"><b>Noise test:</b> the preview check ran on the live container, so this compares Live with Live. Any failure here is noise, not a break.</p>':'')
    +(G.pairs.length?'<p class="line"><b>'+(nf?'Failed':'Passed')+': '+nf+' failed of '+G.checked+' checked</b> · Default / Live vs Preview'+(G.notes.length?'<br><span class="muted">'+esc(G.notes.join(' · '))+'</span>':'')+'</p>'
      +(nf?'<div class="tablewrap"><table><thead><tr><th>Result</th><th>Journey / action</th><th>Getting tracked? (Live)</th><th>Getting tracked? (Preview)</th><th>Tag fired (Live)</th><th>Tag fired (Preview)</th></tr></thead><tbody>'+G.failed.map(x=>rgRowHtml(x,false)).join('')+'</tbody></table></div>'
        :'<p>Nothing failed: every vendor that tracked on Live still tracks in Preview, with the same key values and consent behaviour.</p>')
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
