/* Comparison engine of gtm-qa-wizard.
 * Copied unchanged from the GTM Journey Tester page (artifact/gtm-journey-tester.html in gtm-tester,
 * report standard v3, 2026-11-13), where it was checked against the MYP_NC release: 3 failed of 123.
 * Only the S state object, diagnoses() and parsePreview() are new: they stand in for the page around it. */
"use strict";
const S={naming:null,nmIdx:null,tmap:null,rel:{cfg:{previews:[]}},phases:{}};
function diagnoses(){return[];}
function parsePreview(link){try{const u=new URL(link.replace('/#/?','/?'));const p=u.searchParams;return{id:p.get('id')||(link.match(/GTM-[A-Z0-9]+/)||[''])[0],auth:/gtm_auth=/.test(link)||!!p.get('gtm_auth'),env:p.get('gtm_preview')||(link.match(/gtm_preview=([^&]+)/)||[])[1]||'',url:p.get('url')||''};}catch(e){return null;}}
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pill=(k,label)=>'<span class="pill '+k+'">'+esc(label||k)+'</span>';
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const PHASES=[
  {id:'benchmark',n:1,name:'Default / Live',sub:'Live container, before the change',desc:'Records how the live site behaves today, so later checks can tell your change apart from something that broke.',live:true},
  {id:'preview',n:2,name:'Preview',sub:'Unpublished workspace with the change',desc:'Same journey with your preview loaded. Your tags should change; nothing else should.',live:false},
  {id:'postlive',n:3,name:'Post-live',sub:'Live container, after you publish',desc:'Run once the version is published. Confirms the change survived and nothing else broke.',live:true}
];
const phName=id=>PHASES.find(p=>p.id===id).name;
const pick=(o,...k)=>{for(const x of k)if(o&&o[x]!=null)return o[x];return undefined;};
const arr=v=>Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
function stat(s){s=String(s==null?'':s).toLowerCase();if(/^(pass|passed|ok|success|true|met|fired)$/.test(s))return'pass';if(/fail|error|exception|false|not met|missing|blocked/.test(s))return'fail';if(/warn|timeout|partial/.test(s))return'warn';if(/skip|n\/a/.test(s))return'skip';return s?'info':'skip';}
const stepKey=n=>String(n||'').toLowerCase().replace(/^\d+[_\s.-]*/,'').replace(/[^a-z]+/g,' ').trim();
const EVENT_VENDORS=/^(GA4|Google Ads|Floodlight|Meta|Snapchat|Pinterest|Bing|Xandr|TikTok|Reddit|Line|Yandex)/i;
const NON_GTM=/^(THG Altitude)$/i;
const BEHAVIOUR=/^(scroll|user_engagement|first_visit|session_start|form_start|form_submit|click|file_download|video_\w+)$/i;
const BAD_VALUE=/^(\[object Object\]|NaN|\{\})$/;
function canonEvent(h){
  const p=h.params||{};const v=String(h.vendor||'');
  if(/^Floodlight/i.test(v)&&p.type&&p.cat)return p.type+'/'+p.cat;
  if(/^Google Ads/i.test(v)&&p.label)return p.label;
  const named=p.en||p.ev||p.evt||(p.event&&p.event!=='{}'?p.event:'')||(/^Xandr/i.test(v)?p.e:'');
  if(named)return String(named);
  const t=String(h.event||'');
  if(EVENT_VENDORS.test(v)&&/^[A-Za-z][\w\-\/.]*$/.test(t)&&!/\.(js|css)$/i.test(t))return t;
  return'(calls)';
}
const isScriptLoad=h=>!Object.keys(h.params||{}).some(k=>/^(en|ev|evt|event|label|cat|type)$/.test(k))&&/\.(js|css)(\b|$)|\bscript\b|\bloaded\b/i.test(String(h.event||''));
function norm(r){
  if(!r)return null;
  const meta=pick(r,'meta','run')||{};
  // the opt-in journey is results.steps; the opt-out (Reject all) journey is results.optout.steps
  const normSteps=list=>arr(list).map((s,i)=>({
    name:pick(s,'name','step')||('Step '+(i+1)),key:stepKey(pick(s,'name','step')||('step '+(i+1))),url:pick(s,'url')||'',
    status:pick(s,'error')?'failed':String(pick(s,'status')||'ok').toLowerCase(),error:pick(s,'error')||'',
    hits:arr(pick(s,'hits','network')).filter(h=>!/loader/i.test(h.vendor||'')).map(h=>{const x={vendor:pick(h,'vendor')||'Other',event:pick(h,'event')||(Array.isArray(h.events)?h.events.join(', '):'')||'(hit)',params:pick(h,'params')||{},n:h.count==null?1:+h.count||0};x.ev=canonEvent(x);return x;}).filter(h=>h.n>0&&!isScriptLoad(h)),
    gaps:arr(pick(s,'capture_gaps','not_captured')).map(String),
    dl:arr(pick(s,'datalayer','dataLayer')).map(d=>{const x=d&&d.data&&typeof d.data==='object'?d.data:d;return(x&&x.event)||'';}).filter(e=>e&&!/^gtm\./.test(e)),
    rawdl:arr(pick(s,'datalayer','dataLayer')).map(d=>{const x=d&&d.data&&typeof d.data==='object'?d.data:d;return String((x&&x.event)||'');}).filter(Boolean),
    via:String(pick(s,'via')||''),actions:arr(pick(s,'actions')).map(String),wait:pick(s,'wait_s','wait')==null?null:+pick(s,'wait_s','wait'),
    notes:pick(s,'notes')||'',capture:pick(s,'capture')||null,
    tags:arr(pick(s,'tags')).map(t=>({name:pick(t,'name')||'',status:stat(pick(t,'status')),count:+pick(t,'count')||1})),
    vars:pick(s,'variables','vars')||{},
    containers:arr(pick(s,'containers')).map(String),
    consent:pick(s,'consent')||null,
    cookies:arr(pick(s,'cookies')).map(c=>typeof c==='string'?c:(c.name||'')).filter(Boolean)
  }));
  const steps=normSteps(pick(r,'steps','journey'));
  const oo=pick(r,'optout','opt_out');const optout=oo?normSteps(Array.isArray(oo)?oo:pick(oo,'steps')):null;
  const cons=pick(r,'consent');
  const consent=cons?arr(pick(cons,'scenarios')).map(s=>({name:pick(s,'name')||'',verdict:stat(pick(s,'verdict','status')),state:pick(s,'consent_state','state')||{},before:arr(pick(s,'hits_before','before')),after:arr(pick(s,'hits_after','after')),notes:pick(s,'notes')||''})):null;
  const L=pick(r,'lead','lead_capture');
  const lead=L?arr(Array.isArray(L)?L:pick(L,'forms')).map(f=>({name:pick(f,'name')||'Form',verdict:stat(pick(f,'verdict','status')),events:arr(pick(f,'events')).map(e=>typeof e==='string'?e:(e.event||'')),hits:arr(pick(f,'hits')),result:pick(f,'result')||'',notes:pick(f,'notes')||''})):null;
  const cv=pick(meta,'capture_version')||(steps.map(s=>s.capture&&s.capture.version).find(Boolean))||'';
  return{meta:{url:pick(meta,'url')||pick(r,'url')||'',env:pick(meta,'env')||'',tester:pick(meta,'tester')||'',started:pick(meta,'started')||'',product:pick(meta,'product_url')||'',note:pick(meta,'note')||'',order:pick(meta,'order')||null,containers:arr(pick(r,'gtm_containers_loaded')||pick(meta,'gtm_containers_loaded')),captureVersion:String(cv),tagAssistant:String(pick(meta,'tag_assistant')||'')},steps,optout:optout&&optout.length?optout:null,consent,lead};
}
const TAG_VENDORS=[[/\bga4\b|google analytics|^gaawe$|^googtag$/i,'GA4'],[/floodlight|\bsa360\b|search ads 360|^flc$|^fls$/i,'Floodlight'],[/google ads|adwords|^awct$|^sp$|remarketing|smart pixel|youtube micro/i,'Google Ads'],[/\bmeta\b|facebook|\bfb\b/i,'Meta'],[/tik ?tok/i,'TikTok'],[/snap/i,'Snapchat'],[/pinterest/i,'Pinterest'],[/\bbing\b|microsoft ad(s|vertising)|\buet\b/i,'Bing'],[/criteo/i,'Criteo'],[/listrak/i,'Listrak'],[/dynamic yield|^dy\b/i,'Dynamic Yield'],[/content ?square/i,'Contentsquare'],[/xandr|appnexus|\blf dm\b/i,'Xandr'],[/reddit/i,'Reddit'],[/\bawin\b/i,'Awin'],[/rtb ?house/i,'RTB House'],[/\bcheq\b/i,'CHEQ'],[/twitter/i,'X/Twitter'],[/yandex/i,'Yandex'],[/intent\.?ly|made with intent/i,'Made With Intent'],[/appsflyer/i,'AppsFlyer']];
const tagVendor=(...names)=>{for(const n of names){if(!n)continue;const m=TAG_VENDORS.find(v=>v[0].test(n));if(m)return m[1];}return'';};
const normVal=v=>String(v==null?'':(typeof v==='object'?JSON.stringify(v):v)).replace(/([?&])(gtm_debug|gtm_preview|gtm_auth|gtm_cookies_win|_gl)=[^&#"]*&?/g,'$1').replace(/[?&]$/,'').trim();
const CMP_OP={EQUALS:'equals',CONTAINS:'contains',MATCH_REGEX:'matches RegEx',STARTS_WITH:'starts with',ENDS_WITH:'ends with',CSS_SELECTOR:'matches CSS selector',GREATER:'greater than',GREATER_OR_EQUALS:'greater than or equal to',LESS:'less than',LESS_OR_EQUALS:'less than or equal to'};
const BUILTIN_TRIG={'2147479553':'All Pages','2147479572':'Consent Initialization - All Pages','2147479573':'Initialization - All Pages'};
const TRIG_TYPE={PAGEVIEW:'Page view',DOM_READY:'DOM ready',WINDOW_LOADED:'Window loaded',CUSTOM_EVENT:'Custom event',CLICK:'All clicks',LINK_CLICK:'Link click',ELEMENT_VISIBILITY:'Element visibility',FORM_SUBMISSION:'Form submit',HISTORY_CHANGE:'History change',SCROLL_DEPTH:'Scroll depth',TIMER:'Timer',TRIGGER_GROUP:'Trigger group',JS_ERROR:'JavaScript error',YOU_TUBE_VIDEO:'YouTube video',INIT:'Initialisation',CONSENT_INIT:'Consent initialisation',ALWAYS:'All pages'};
function trigLine(t,side){
  const cond=c=>{const p={};(c.parameter||[]).forEach(e=>p[e.key]=e.value);const a=String(p.arg0||'').replace(/^\{\{_event\}\}$/,'Event');
    const op=CMP_OP[c.type]||String(c.type||'').toLowerCase();
    return a+' '+(String(p.negate)==='true'?'does not '+op.replace(/^(equal|contain|match|start|end)s\b/,'$1'):op)+' '+(p.arg1==null?'':p.arg1);};
  const conds=[].concat(t.customEventFilter||[],t.filter||[],t.autoEventFilter||[]).map(cond);
  if(t.type==='TRIGGER_GROUP'){const ids=((t.parameter||[]).find(e=>e.key==='triggerIds')||{}).list||[];conds.push('all of: '+ids.map(x=>{const g=side.items.trigger.byId[String(x.value)];return g?g.name:'trigger '+x.value;}).join(', '));}
  const s=(TRIG_TYPE[t.type]||t.type)+(conds.length?': '+conds.join('; '):'');return s.length>260?s.slice(0,257)+'…':s;
}
function tmapOf(sides){
  const out={tags:{},trig:{},vars:{}};(sides||[]).forEach(sd=>{const T=sd.items.trigger.byId;
    sd.items.trigger.list.forEach(t=>out.trig[t.name]=trigLine(t,sd));
    Object.values(BUILTIN_TRIG).forEach(n=>{if(!out.trig[n])out.trig[n]='Built-in trigger';});
    sd.items.tag.list.forEach(t=>{const nm=id=>{const g=T[String(id)];return g?g.name:BUILTIN_TRIG[String(id)]||'trigger '+id;};
      out.tags[t.name]={fire:(t.firingTriggerId||[]).map(nm),block:(t.blockingTriggerId||[]).map(nm),paused:!!t.paused};
      const refs=new Set();const scan=x=>String(JSON.stringify(x)).replace(/\{\{([^}]+)\}\}/g,(m,v)=>{refs.add(v);return m;});
      scan(t.parameter);(t.firingTriggerId||[]).concat(t.blockingTriggerId||[]).forEach(id=>{const g=T[String(id)];if(g)scan([g.filter,g.customEventFilter,g.autoEventFilter]);});
      refs.forEach(v=>{(out.vars[v]=out.vars[v]||[]).push(t.name);});});});
  return out;
}
function tagTriggers(side,name){const M=S.tmap&&S.tmap[side];if(!M||!M.tags[name])return null;const t=M.tags[name];
  return{fire:t.fire.map(n=>({n,c:M.trig[n]||''})),block:t.block.map(n=>({n,c:M.trig[n]||''})),paused:t.paused};}
const SCENS=[['steps','Opt-in','Accept all'],['optout','Opt-out','Reject all']];
const CALL_KEY=/^(value|epn\.value|ep\.value|cd\[value\]|cu|currency|cd\[currency\]|tid|label|src|type|cat|ep\.ads_data_redaction|npa|dma|cd\[content_ids\]|epn\.quantity|pr\d+|e_pr|e_cur|e_iids)$/;
const CALL_ORDER=/^(transaction_id|ep\.transaction_id|cd\[order_id\]|order_id)$/;
const emptyV=v=>/^(undefined|null|""|''|\[\]|\{\}|NaN|)$/.test(v);
const vNorm=v=>{let s=normVal(v).replace(/"\s*\+\s*\n\s*"/g,'').replace(/\s+/g,' ').trim();const q=s.match(/^"(.*)"$/);if(q&&!/"/.test(q[1]))s=q[1];return/^-?\d+(\.\d+)?$/.test(s)?String(parseFloat(s)):s;};
const itemsOfPr=v=>{const m=k=>(String(v).match(new RegExp('~'+k+'([^~]*)'))||[])[1]||'';const p=m('pr');return{ids:[m('id')].filter(Boolean),pr:p?[String(parseFloat(p))]:[],qt:[m('qt')].filter(Boolean)};};
function itemsDiff(a,b){const d=[];[['ids','item IDs'],['pr','prices'],['qt','quantities']].forEach(([k,l])=>{const n=Math.min(a[k].length,b[k].length);if(n&&a[k].slice(0,n).join()!==b[k].slice(0,n).join())d.push(l+': '+a[k].slice(0,n).join(', ')+' → '+b[k].slice(0,n).join(', '));});return d;}
const CONSENT_STEP=k=>/before consent/.test(k);
const NOT_COMPARED=/^Criteo Retail Media$/i;
const timedTrig=t=>!!(t&&t.fire.length&&t.fire.every(f=>/^(Element visibility|Scroll depth|Timer)/i.test(f.c)));
const ceEvents=t=>{if(!t||!t.fire.length)return[];const e=t.fire.map(f=>(String(f.c).match(/^Custom event: Event equals ([^;]+)/)||[])[1]);return e.every(Boolean)?e.map(x=>x.trim()):[];};
const NM_KINDS=[['tag','tagId'],['trigger','triggerId'],['variable','variableId'],['customTemplate','templateId']];
const NM_LABEL={tag:'Tag',trigger:'Trigger',variable:'Variable',customTemplate:'Template',builtIn:'Built-in variable'};
const NM_DROP=/^(name|accountId|containerId|workspaceId|fingerprint|parentFolderId|path|tagManagerUrl|notes|tagId|triggerId|variableId|templateId|uniqueTriggerId|galleryReference)$/;
const NM_NEAR=0.55;
function nmSide(j,file){
  const cv=j.containerVersion||j;if(!cv.tag&&!cv.trigger&&!cv.variable)throw 0;
  const side={pub:(cv.container&&cv.container.publicId)||'container',ver:cv.name||cv.containerVersionId||'',file,items:{},builtIn:(cv.builtInVariable||[]).map(b=>b.name)};
  NM_KINDS.forEach(([k,idk])=>{const list=cv[k]||[];const byName={},byId={};list.forEach(x=>{byName[x.name]=x;byId[String(x[idk])]=x;});side.items[k]={list,byName,byId,idk};});
  return side;
}
function nmHash(s){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return(h2>>>0).toString(36)+(h1>>>0).toString(36);}
const NM_STOP=new Set(['dlv','cjs','js','jsv','lt','rt','const','constant','cookie','url','tpl','ce','wl','pv','tg','mkt','chtml','html','custom','pixel','template','tag','event','trigger','variable','lookup','the','and','for','only','ot','onetrust','marketing','consent']);
const nmWords=n=>new Set(String(n||'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/tik ?tok/g,'tiktok').replace(/facebook|\bfb\b/g,'meta').split(/[^a-z0-9]+/).filter(w=>w.length>1&&!NM_STOP.has(w)));
function nmIdent(k,x){if(k!=='variable')return null;const p={};(x.parameter||[]).forEach(e=>p[e.key]=e.value);
  if(/^(v|k|j|aev)$/.test(x.type))return x.type+':'+(p.name||p.varType||'');if(x.type==='c')return'c:'+p.value;if(x.type==='u')return'u:'+p.component+':'+(p.queryKey||'');return null;}
function nmJac(a,b){if(!a.size&&!b.size)return 1;let i=0;a.forEach(x=>{if(b.has(x))i++;});return i/(a.size+b.size-i);}
function nmLeaves(v,p,out){
  if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach((e,i)=>nmLeaves(e,p+'['+i+']',out));else Object.keys(v).forEach(k=>nmLeaves(v[k],p+'.'+k,out));}
  else if(typeof v==='string'&&v.length>80)v.split(/\n|;\s*/).forEach(l=>{l=l.trim();if(l)out.add(p+'#'+l);});
  else out.add(p+'='+v);return out;}
const nmShort=v=>{if(v===undefined)return'(not set)';const t=typeof v==='string'?v:JSON.stringify(v);return t.length>160?t.slice(0,157)+'…':t;};
const nmPretty=t=>String(t).replace(/\{\{(var|tag)#(\d+)\}\}/g,'{{$1 $2}}');
function nmDiff(a,b,path,out){
  if(out.length>=8||JSON.stringify(a)===JSON.stringify(b))return out;
  const f=(path||'item').replace(/\.value$/,'');
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    if(!Array.isArray(a)&&!Array.isArray(b)){new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>nmDiff(a[k],b[k],path?path+'.'+k:k,out));return out;}
    if(Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(e=>e==null||typeof e!=='object')){
      const sa=new Set(a.map(String)),sb=new Set(b.map(String));const ra=[...sa].filter(e=>!sb.has(e)),rb=[...sb].filter(e=>!sa.has(e));
      if(!ra.length&&!rb.length)out.push({f,a:'(same items, different order)',b:'(same items, different order)'});
      else out.push({f,a:ra.length?nmShort('removed: '+ra.join(', ')):'–',b:rb.length?nmShort('added: '+rb.join(', ')):'–'});return out;}
    if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){a.forEach((e,i)=>nmDiff(e,b[i],f+'['+(i+1)+']',out));return out;}}
  if(typeof a==='string'&&typeof b==='string'&&(a.includes('\n')||b.includes('\n'))){
    const la=a.split('\n').map(l=>l.trim()),lb=b.split('\n').map(l=>l.trim());let i=0;while(i<la.length&&i<lb.length&&la[i]===lb[i])i++;
    if(i>=la.length&&i>=lb.length){out.push({f,a:'(spacing only)',b:'(spacing only)'});return out;}
    out.push({f:f+' (line '+(i+1)+')',a:nmPretty(nmShort(i<la.length?la[i]:'(no line)')),b:nmPretty(nmShort(i<lb.length?lb[i]:'(no line)'))});return out;}
  out.push({f,a:nmPretty(nmShort(a)),b:nmPretty(nmShort(b))});return out;
}
function nmCompare(B,A){
  const sides={b:B,a:A},pairs=[],P={},AL={};
  const idk=k=>B.items[k].idk;
  const key=(s,k,x)=>s+'|'+k+'|'+x[idk(k)];
  const addPair=(k,x,y,how,score)=>{P[key('b',k,x)]=P[key('a',k,y)]=pairs.length;pairs.push({k,x,y,how,score});};
  const free=(s,k)=>sides[s].items[k].list.filter(x=>P[key(s,k,x)]==null&&AL[key(s,k,x)]==null);
  let memo={};
  // a reference becomes the pair it belongs to; an unpaired target becomes the hash of its own settings
  // (mode 'h') or its name marked as unmatched (mode 'show', for the diff)
  function ref(s,k,x,mode){
    if(!x)return null;const kk=key(s,k,x),n=P[kk]!=null?P[kk]:AL[kk];
    if(n!=null)return mode==='h'?'#'+k+n:pairs[n].y.name;
    return mode==='h'?'~'+hashOf(s,k,x):x.name+' (no match on the '+(s==='b'?'after':'before')+' side)';}
  function hashOf(s,k,x){const m=key(s,k,x);if(memo[m]!==undefined)return memo[m]===null?'cycle':memo[m];memo[m]=null;
    const h=nmHash(JSON.stringify(canon(s,k,x,'h')));memo[m]=h;return h;}
  function canon(s,k,x,mode){
    const I=sides[s].items,c={};
    Object.keys(x).forEach(f=>{if(!NM_DROP.test(f))c[f]=x[f];});
    const R=(kk,t)=>{const r=ref(s,kk,t,mode);return r==null?null:r;};
    ['setupTag','teardownTag'].forEach(f=>{if(c[f])c[f]=c[f].map(t=>Object.assign({},t,{tagName:R('tag',I.tag.byName[t.tagName])||t.tagName}));});
    ['firingTriggerId','blockingTriggerId'].forEach(f=>{if(c[f])c[f]=c[f].map(id=>R('trigger',I.trigger.byId[String(id)])||'trigger '+id).sort();});
    if(k==='tag'&&/^cvt_/.test(c.type||'')){const m=c.type.match(/^cvt_\d+_(\d+)$/);const t=m&&I.customTemplate.byId[m[1]];if(t)c.type='template: '+R('customTemplate',t);}
    if(k==='customTemplate'&&typeof c.templateData==='string')c.templateData=c.templateData.replace(/"displayName":\s*"(?:[^"\\]|\\.)*"/,'"displayName":""');
    // parameter lists become objects keyed by their key, so a diff names the parameter
    const walk=v=>{
      if(Array.isArray(v)){if(v.length&&v.every(e=>e&&typeof e==='object'&&!Array.isArray(e)&&typeof e.key==='string')&&new Set(v.map(e=>e.key)).size===v.length){const o={};v.forEach(e=>{const y=Object.assign({},e);delete y.key;o[e.key]=walk(y);});return o;}return v.map(walk);}
      if(v&&typeof v==='object'){
        if(v.type==='TRIGGER_REFERENCE'&&v.value!=null)return{type:v.type,value:R('trigger',I.trigger.byId[String(v.value)])||v.value};
        if(v.type==='TAG_REFERENCE'&&v.value!=null)return{type:v.type,value:R('tag',I.tag.byName[v.value])||v.value};
        const o={};Object.keys(v).sort().forEach(f=>o[f]=walk(v[f]));return o;}
      if(typeof v==='string')return v.replace(/\{\{([^{}]+)\}\}/g,(m,n)=>{const r=R('variable',I.variable.byName[n]);return r==null?m:'{{'+r+'}}';});
      return v;};
    return walk(c);
  }
  const ORDER=['customTemplate','variable','trigger','tag'];
  // 1. same GTM ID
  ORDER.forEach(k=>B.items[k].list.forEach(x=>{const y=A.items[k].byId[String(x[idk(k)])];if(y)addPair(k,x,y,'id');}));
  // 2. identical settings, repeated until no new pairs appear
  const exact=()=>{let added=1,rounds=0;while(added&&rounds++<12){added=0;memo={};
    ORDER.forEach(k=>{const g={};free('a',k).forEach(y=>{const h=hashOf('a',k,y);(g[h]=g[h]||[]).push(y);});
      free('b',k).forEach(x=>{const ys=g[hashOf('b',k,x)];if(!ys||!ys.length)return;
        const wx=nmWords(x.name);let bi=0,bs=-1;ys.forEach((y,i)=>{const sc=nmJac(wx,nmWords(y.name));if(sc>bs){bs=sc;bi=i;}});
        addPair(k,x,ys.splice(bi,1)[0],'settings');added++;});});
    // several old items with the same settings merged into one new item
    if(!added)ORDER.forEach(k=>{const g={};A.items[k].list.forEach(y=>{const n=P[key('a',k,y)];if(n!=null)g[hashOf('a',k,y)]=n;});
      free('b',k).forEach(x=>{const n=g[hashOf('b',k,x)];if(n!=null){AL[key('b',k,x)]=n;added++;}});});}};
  // 3. closest match of the same type for what's left, best scores first
  const near=(k,byName)=>{memo={};const fa=free('a',k);if(!fa.length)return 0;
    const L=(s,x)=>{const c=canon(s,k,x,'h');return{x,t:c.type,i:nmIdent(k,x),l:nmLeaves(c,'',new Set()),w:nmWords(x.name)};};
    const as=fa.map(y=>L('a',y)),cand=[];
    free('b',k).forEach(x=>{const bx=L('b',x);as.forEach(ay=>{const nw=nmJac(bx.w,ay.w);
      // same type and settings mostly alike; a variable whose type changed pairs only on a near-identical name
      let sc=-1;if(byName){if(ay.t===bx.t&&nw>=0.6){const lj=nmJac(bx.l,ay.l);if(lj>=0.15)sc=0.5*nw+0.5*lj;}}
      else if(ay.t===bx.t){if(!(bx.i&&ay.i&&bx.i!==ay.i)||nw>=0.8)sc=0.75*nmJac(bx.l,ay.l)+0.25*nw;if(bx.i&&bx.i===ay.i)sc=Math.max(sc,0.7+0.3*nw);}
      else if(k==='variable'&&nw>=0.8)sc=0.6+0.2*nw;
      if(sc>=(byName?0.4:NM_NEAR))cand.push([sc,bx.x,ay.x]);});});
    cand.sort((p,q)=>q[0]-p[0]);let n=0;
    cand.forEach(([sc,x,y])=>{if(P[key('b',k,x)]!=null||P[key('a',k,y)]!=null)return;addPair(k,x,y,byName?'name':'near',Math.round(sc*100));n++;});
    return n;};
  exact();
  for(let r=0;r<4;r++){let n=0;ORDER.forEach(k=>{n+=near(k);exact();});if(!n)break;}
  ORDER.forEach(k=>{if(near(k,true))exact();});
  // 4. one row per item
  const items=[];memo={};
  pairs.forEach(p=>{const k=p.k,x=p.x,y=p.y;
    const d=nmDiff(canon('b',k,x,'show'),canon('a',k,y,'show'),'',[]);
    const it={k,c:A.pub,id:p.how==='id'?String(y[idk(k)]):String(x[idk(k)])+'→'+String(y[idk(k)]),a:x.name,b:y.name,m:p.how};
    if(p.score)it.p=p.score;
    it.s=x.name!==y.name?(d.length?'renamed_changed':'renamed'):(d.length?'changed':'same');if(d.length)it.d=d;
    items.push(it);});
  Object.keys(AL).forEach(kk=>{const[,k,id]=kk.split('|'),x=B.items[k].byId[id],y=pairs[AL[kk]].y;
    items.push({k,c:A.pub,id:id+'→'+String(y[idk(k)]),a:x.name,b:y.name,m:'merged',s:'merged'});});
  NM_KINDS.forEach(([k])=>{free('b',k).forEach(x=>items.push({k,c:A.pub,id:String(x[idk(k)]),a:x.name,b:'',s:'removed'}));
    free('a',k).forEach(y=>items.push({k,c:A.pub,id:String(y[idk(k)]),a:'',b:y.name,s:'added'}));});
  const bb=new Set(B.builtIn),ab=new Set(A.builtIn);
  ab.forEach(n=>{if(!bb.has(n))items.push({k:'builtIn',c:A.pub,id:n,a:'',b:n,s:'added'});});
  bb.forEach(n=>{if(!ab.has(n))items.push({k:'builtIn',c:A.pub,id:n,a:n,b:'',s:'removed'});});
  return items;
}
function nmCounts(items){const C={};items.forEach(it=>{const c=C[it.k]||(C[it.k]={});c[it.s]=(c[it.s]||0)+1;});return C;}
function nmLook(kind,ph,name){
  if(!S.naming||!ph)return null;
  if(!S.nmIdx){const bi={},ai={};const tk=it=>it.k==='tag'||it.k==='variable';
    S.naming.items.forEach(it=>{if(!tk(it)||it.s==='merged')return;const v={key:'#'+it.k+'#'+it.c+'#'+it.id,now:it.b||it.a,was:it.a,ren:/^renamed/.test(it.s)&&!!it.a,it};if(it.a)bi[it.k+'|'+it.a]=v;if(it.b)ai[it.k+'|'+it.b]=v;});
    // an old item merged into a kept one shares the kept item's key (its name when the kept item is unchanged)
    S.naming.items.forEach(it=>{if(!tk(it)||it.s!=='merged')return;const t=ai[it.k+'|'+it.b];bi[it.k+'|'+it.a]=t?Object.assign({},t,{was:it.a,ren:true,it}):{key:it.b,now:it.b,was:it.a,ren:true,it};});
    S.nmIdx={bi,ai};}
  return(ph==='benchmark'?S.nmIdx.bi:S.nmIdx.ai)[kind+'|'+name]||null;
}
const STEP_ORDER=['before consent','home','category','product','add to basket','basket','checkout','purchase'];
const stepIdx=k=>{const i=STEP_ORDER.findIndex(s=>String(k).includes(s));return i<0?99:i;};
const HEARTBEAT_V=/^(CHEQ|Contentsquare|Dynamic Yield)$/i;   // timed and session pings
const NECESSARY_V=/^(CHEQ)$/i;                               // strictly necessary, allowed before consent
const GOOGLE_V=/^(GA4|Google Ads|Floodlight)$/;              // consent mode: cookieless pings are expected
const BODY_V=/^(Pinterest|TikTok|Meta)$/;                    // event name often only in the request body
const BASE_TAG=/\b(base|config(uration)?|google tag|init|set ?up|master ?tag|smart ?script|library|loader|conversion linker|js file|consent( signals| update)?|page context|all pages)\b/i;
const TAG_NOISE=/\b(chtml|pixel|template|event|tag|counter|custom html|html|ga4|meta|facebook|fb|tik ?tok|pinterest|snapchat|snap|google ads|floodlight|sa360|criteo|xandr|bing|microsoft (ads|advertising)|listrak|rtb ?house|dynamic yield|dy|awin|appsflyer|content ?square|reddit|cheq)\b/gi;
const rgFlat=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
const tagJob=n=>rgFlat(String(n).replace(TAG_NOISE,' '));
const urlish=e=>e==='(calls)'||/[./]/.test(String(e));
const rgWhen=k=>CONSENT_STEP(k)?'before the consent choice':'after Reject all';
function rgCheck(cmp){
  const N=cmp.N,rows=[],agg={},notes=[],cov=new Set();
  const relC=new Set([...((S.naming&&S.naming.containers)||[]),...((S.rel&&S.rel.cfg&&S.rel.cfg.previews)||[]).map(l=>(parsePreview(l)||{}).id)].filter(Boolean));
  const inRel=s=>!relC.size||(s.containers||[]).some(c=>relC.has(String(c).split(' ')[0]));
  const pairs=[];if(N.preview&&N.benchmark)pairs.push(['benchmark','preview']);if(N.postlive&&(N.preview||N.benchmark))pairs.push([N.preview?'preview':'benchmark','postlive']);
  const side=id=>id==='benchmark'?'before':'after';
  const partial=s=>!!s&&/partial|fail/.test(s.status);
  const jr=(n,sk)=>sk==='steps'?n.steps:(n.optout||[]);
  pairs.forEach(([rid,cid])=>{
    const R=N[rid],C=N[cid],rName=phName(rid),cName=phName(cid),pairTxt=rName+' vs '+cName;
    // a tag's counterpart in the other check: paired through the exports, or the same name
    const tags=(s,ph)=>s.tags.map(t=>{const L=nmLook('tag',ph,t.name);const paired=L&&!/^(added|removed)$/.test(L.it.s);
      return{name:t.name,other:paired?(ph===rid?L.it.b:L.it.a):(L?'':t.name),added:!!(L&&L.it.s==='added'),v:tagVendor(paired?L.it.b:'',t.name,paired?L.it.a:''),fail:t.status==='fail',job:tagJob(t.name)};});
    // events and tag jobs Live has anywhere in either journey: rule 5 only flags what Live never does
    const liveDoes=new Set(),liveFired=new Set();
    SCENS.forEach(([sk])=>jr(R,sk).forEach(s=>{s.hits.forEach(h=>{if(!urlish(h.ev))liveDoes.add(h.vendor+'|'+rgFlat(h.ev));});
      tags(s,rid).forEach(t=>{if(t.fail)return;liveFired.add(t.name);if(t.v&&t.job)liveDoes.add(t.v+'|'+t.job);});}));
    SCENS.forEach(([sk,scen])=>{
      const RS=jr(R,sk),CS=jr(C,sk);
      if(!RS.length||!CS.length){if(RS.length||CS.length)cov.add(scen+' journey wasn’t run in both '+rName+' and '+cName+', so it wasn’t compared');return;}
      const ta=RS.some(s=>s.tags.length)&&CS.some(s=>s.tags.length);
      if(!ta)cov.add(scen+': no Tag Assistant data in '+(RS.some(s=>s.tags.length)?cName:rName)+', so only vendor calls were compared');
      RS.forEach(rs=>{
        const cs=CS.find(s=>s.key===rs.key);
        if(!cs){cov.add(scen+' · '+rs.name+' wasn’t done in '+cName);return;}
        if(!inRel(rs)||!inRel(cs)){const other=[...new Set(rs.containers.concat(cs.containers).map(c=>String(c).split(' ')[0]))].join(', ');
          const t=rs.name+' not compared: different container'+(other?' ('+other+')':'');if(!notes.includes(t))notes.push(t);return;}
        const strict=sk==='optout'||CONSENT_STEP(rs.key);
        const calls=s=>{const m={};s.hits.forEach(h=>{if(/^Unrecognised/i.test(h.vendor)||NON_GTM.test(h.vendor)||NOT_COMPARED.test(h.vendor))return;
          const e=m[h.vendor]||(m[h.vendor]={named:{},un:0,all:0});if(urlish(h.ev))e.un+=h.n;else if(!BEHAVIOUR.test(h.ev)){const x=e.named[h.ev]||(e.named[h.ev]={n:0,params:h.params});x.n+=h.n;}else return;e.all+=h.n;});return m;};
        const HR=calls(rs),HC=calls(cs),E={named:{},un:0,all:0};
        const TR=ta?tags(rs,rid):[],TC=ta?tags(cs,cid):[];const firedC=TC.filter(t=>!t.fail);
        new Set([...Object.keys(HR),...Object.keys(HC),...TR.map(t=>t.v),...TC.map(t=>t.v)].filter(Boolean)).forEach(v=>{
          const r=HR[v]||E,c=HC[v]||E,tr=TR.filter(t=>t.v===v),tc=TC.filter(t=>t.v===v);
          const iss=[];const add=(rule,text,o)=>{const x=Object.assign({rule,text},o||{});iss.push(x);return x;};
          const gapped=rs.gaps.concat(cs.gaps).some(g=>String(g).toLowerCase()===v.toLowerCase());
          if(gapped)cov.add(scen+' · '+rs.name+': '+v+' wasn’t captured in one of the checks');
          const hb=HEARTBEAT_V.test(v);
          if(!gapped&&!hb){
            // 2 a Live tag that sends tracking stopped firing and nothing else does its job
            tr.forEach(t=>{if(t.fail||BASE_TAG.test(t.name)||(t.other&&BASE_TAG.test(t.other)))return;
              if(firedC.some(x=>(t.other&&x.name===t.other)||(x.v===v&&t.job&&x.job===t.job)))return;
              const tl=tagTriggers(side(rid),t.name),tn=t.other?tagTriggers(side(cid),t.other):null;
              if(timedTrig(tl)||timedTrig(tn))return;
              const ev=ceEvents(tl);if(ev.length&&!ev.some(e=>cs.rawdl.includes(e)))return;   // the site didn't push the trigger's event this time
              const nf=TC.find(x=>x.name===t.other);
              add(2,t.name+' fired on '+rName+'; '+(t.other?t.other+(nf&&nf.fail?' failed':' didn’t fire'):'no '+v+' tag does this')+' in '+cName,{tag:t.name,now:t.other,nowFail:true,trg:tn});});
            const tagOk=!iss.length&&tr.length>0;
            // 1 calls Live sent that Preview doesn't send
            Object.keys(r.named).forEach(e=>{if(c.named[e])return;
              if(BODY_V.test(v)&&c.un>0&&tagOk)return;   // the event is in a request body the capture can't read; the tags fired in both
              if(partial(cs)){cov.add(scen+' · '+rs.name+' was only partly captured in '+cName);return;}
              add(1,e+' not sent in '+cName+' (×'+r.named[e].n+' on '+rName+')',{ev:e});});
            if(r.all&&!c.all&&!iss.some(i=>i.rule===1)){if(partial(cs))cov.add(scen+' · '+rs.name+' was only partly captured in '+cName);else add(1,'no '+v+' calls in '+cName+' (×'+r.all+' on '+rName+')',{none:true});}
            // 4 key values
            Object.keys(r.named).forEach(e=>{const y=c.named[e];if(!y||/promotion/i.test(e))return;const a=r.named[e].params||{},b=y.params||{};
              Object.keys(a).forEach(k=>{const A=vNorm(a[k]),B=b[k]==null?'':vNorm(b[k]);if(A===B||emptyV(A)||BAD_VALUE.test(A))return;
                if(CALL_ORDER.test(k)){if(emptyV(B))add(4,e+': '+k+' lost (was '+A.slice(0,60)+')',{ev:e});return;}
                if(!CALL_KEY.test(k))return;
                if(/^pr\d+$/.test(k)){if(b[k]==null)add(4,e+': '+k+' (item) missing',{ev:e});else itemsDiff(itemsOfPr(A),itemsOfPr(B)).forEach(x=>add(4,e+': '+x,{ev:e}));return;}
                add(4,e+': '+k+(b[k]==null?' missing (was '+A.slice(0,60)+')':' '+A.slice(0,60)+' → '+B.slice(0,60)),{ev:e});});
              Object.keys(b).forEach(k=>{if(BAD_VALUE.test(String(b[k]))&&!BAD_VALUE.test(String(a[k]==null?'':a[k])))add(4,e+': '+k+' = '+b[k],{ev:e});});});
            // 3 consent: before the choice and after Reject all nothing new may be sent or fired
            if(strict&&!NECESSARY_V.test(v)){
              Object.keys(c.named).forEach(e=>{if(r.named[e]||/^G100$/.test(String((c.named[e].params||{}).gcs||'')))return;
                if(!liveDoes.has(v+'|'+rgFlat(e)))return;   // an event Live never sends: rule 5
                add(3,v+' '+e+' sent '+rgWhen(rs.key)+' in '+cName+' only',{ev:e,extra:true});});
              if(c.un&&!r.all&&!GOOGLE_V.test(v))add(3,v+' calls sent '+rgWhen(rs.key)+' in '+cName+' only (×'+c.un+')',{extra:true});
              if(!GOOGLE_V.test(v))tc.forEach(x=>{if(x.fail||TR.some(t=>!t.fail&&(t.name===x.other||(t.v===v&&t.job&&t.job===x.job))))return;
                if(!liveDoes.has(v+'|'+x.job)&&!BASE_TAG.test(x.name))return;
                add(3,x.name+' fires '+rgWhen(rs.key)+' in '+cName+' only',{tag:x.name,extra:true});});}
            // 5 collect events Live never sends; judged once every step is seen
            const nw=(k,label,tag,n)=>{const g=agg[pairTxt+'|'+v+'|'+k]||(agg[pairTxt+'|'+v+'|'+k]={rid,cid,pairTxt,vendor:v,ev:'',tags:new Set(),acts:[],calls:0});
              if(label&&!g.ev)g.ev=label;if(tag)g.tags.add(tag);g.calls+=n||0;if(!g.acts.some(a=>a.scen===scen&&a.step===rs.name))g.acts.push({scen,step:rs.name,key:rs.key});};
            Object.keys(c.named).forEach(e=>{if(!r.named[e]&&!liveDoes.has(v+'|'+rgFlat(e)))nw(rgFlat(e),e,'',c.named[e].n);});
            tc.forEach(x=>{if(x.fail||!x.job||BASE_TAG.test(x.name)||(x.other&&liveFired.has(x.other)))return;if(!liveDoes.has(v+'|'+x.job))nw(x.job,'',x.name,0);});
          }
          rows.push({pairTxt,rid,cid,scen,step:rs.name,stepKey:rs.key,vendor:v,strict,st:iss.length?'fail':'pass',iss,r,c,tr,tc,hb});
        });
      });
    });
  });
  // 5 an event Live never sends that now fires on several pages of one journey: the data would be wrong
  const extraRows=Object.values(agg).filter(g=>SCENS.some(([,sc])=>g.acts.filter(a=>a.scen===sc).length>1)).map(g=>{
    const tag=[...g.tags][0]||'',trg=tag?tagTriggers(side(g.cid),tag):null,ev=g.ev||(tag?tagJob(tag):'');
    return{agg:true,pairTxt:g.pairTxt,rid:g.rid,cid:g.cid,vendor:g.vendor,ev,acts:g.acts,st:'fail',tags:[...g.tags],trg,calls:g.calls,
      iss:[{rule:5,text:g.vendor+' '+ev+' fires on '+g.acts.length+' steps in '+phName(g.cid)+'; '+phName(g.rid)+' never sends it'}]};});
  const failed=rows.filter(x=>x.st==='fail').concat(extraRows);
  const SI={'Opt-in':0,'Opt-out':1};
  rows.sort((a,b)=>(a.st==='fail'?0:1)-(b.st==='fail'?0:1)||SI[a.scen]-SI[b.scen]||stepIdx(a.stepKey)-stepIdx(b.stepKey)||a.vendor.localeCompare(b.vendor));
  return{rows,extra:extraRows,failed,checked:rows.length+extraRows.length,notes,cov:[...cov],pairs};
}
const RULE_TXT={1:'Not tracked any more',2:'Tag stopped firing',3:'Consent broken',4:'Key value broken',5:'Fires where it shouldn’t'};
function rgTracked(x,which){
  if(x.agg)return which==='live'?'No · '+x.vendor+' '+x.ev+' never sent':'Yes · '+x.vendor+' '+x.ev+(x.calls?' ×'+x.calls:'')+' (or its tag fired)';
  const m=which==='live'?x.r:x.c,o=which==='live'?x.c:x.r;
  const evs=[...new Set(x.iss.map(i=>i.ev).filter(Boolean))];
  if(evs.length)return evs.map(e=>m.named[e]?'Yes · '+x.vendor+' '+e+' ×'+m.named[e].n:'No · '+x.vendor+' '+e).join('; ');
  if(!m.all)return x.strict&&!o.all?'No (blocked, correct)':'No';
  const named=Object.keys(m.named);
  return'Yes · '+x.vendor+' '+(named.length?named.slice(0,4).map(e=>e+' ×'+m.named[e].n).join(', ')+(named.length>4?', +'+(named.length-4)+' more':''):'calls ×'+m.un)+(named.length&&m.un?' (+'+m.un+' other calls)':'');
}
const trgShort=t=>t&&t.fire.length?t.fire.map(f=>f.c||f.n).join(' or '):'';
function rgTags(x,which){
  if(x.agg)return which==='live'?[]:x.tags.map(n=>({n,ok:true,note:trgShort(x.trg)?'trigger: '+trgShort(x.trg):''}));
  const hit=x.iss.filter(i=>i.rule===2);
  if(hit.length)return which==='live'?hit.map(i=>({n:i.tag,ok:true})):hit.map(i=>({n:i.now||'no '+x.vendor+' tag',ok:false,note:trgShort(i.trg)?'trigger now: '+trgShort(i.trg):''}));
  return(which==='live'?x.tr:x.tc).map(t=>({n:t.name,ok:!t.fail}));
}
function rgLists(G,cmp){
  const N=S.naming;if(!N)return{ra:[],set:[],ids:new Set()};
  const failedTags=new Set();G.failed.forEach(x=>{(x.tags||[]).forEach(n=>failedTags.add(n));(x.iss||[]).forEach(i=>{if(i.tag)failedTags.add(i.tag);if(i.now)failedTags.add(i.now);});});
  const firedAt=(ph,name)=>{const n=cmp.N[ph];if(!n)return[];const out=[];SCENS.forEach(([sk,sc])=>(sk==='steps'?n.steps:(n.optout||[])).forEach(s=>{if(s.tags.some(t=>t.name===name&&t.status!=='fail'))out.push(sc+' · '+s.name);}));return out;};
  const ra=N.items.filter(it=>it.k==='tag'&&/^(added|removed)$/.test(it.s)).map(it=>{const nm=it.b||it.a,at=firedAt(it.s==='added'?'preview':'benchmark',nm);return{s:it.s,name:nm,vendor:tagVendor(nm),at};})
    .filter(x=>!failedTags.has(x.name)&&!(x.s==='added'&&BASE_TAG.test(x.name)&&x.at.length))
    .sort((a,b)=>(a.s==='removed'?0:1)-(b.s==='removed'?0:1)||a.name.localeCompare(b.name));
  const set=[],ids=new Set(),seen=new Set();const line=(it,t)=>{if(seen.has(t))return;seen.add(t);set.push(t);ids.add(it.k+'|'+it.id);};
  const ttq=[];
  // the event a tag fires on; for a generic site event (elysiumEvent, ecom_event) the event_name it checks
  const evOf=t=>{if(!t||!t.fire.length)return[];const e=t.fire.map(f=>{const c=String(f.c);const n=(c.match(/event_name\}\} (?:equals|contains) ([^;]+)/)||[])[1],x=(c.match(/^Custom event: Event equals ([^;]+)/)||[])[1];return(n||x||'').trim();});return e.every(Boolean)?e:[];};
  const clean=v=>String(v).replace(/\s*\(no match on the (before|after) side\)/g,'').replace(/^(removed|added): /,'');
  N.items.forEach(it=>{if(!it.d||!/changed/.test(it.s))return;const nm=it.b||it.a;if(failedTags.has(nm)||failedTags.has(it.a))return;
    if(it.d.some(d=>d.f==='paired by reviewer'))return;
    it.d.forEach(d=>{const f=String(d.f),a=String(d.a),b=String(d.b);
      if(it.k==='tag'&&f==='firingTriggerId'){const eb=evOf(tagTriggers('before',it.a)),ea=evOf(tagTriggers('after',nm));
        if(eb.length&&ea.length&&eb.slice().sort().join()!==ea.slice().sort().join())line(it,nm+': now fires on '+ea.join(', ')+' (was '+eb.join(', ')+')');}
      else if(it.k==='trigger'&&/customEventFilter(\[\d+\])?\.parameter\.arg1$/.test(f))line(it,nm+' (trigger): event '+a+' → '+b);
      else if(it.k==='trigger'&&/filter(\[\d+\])?\.type$/.test(f))line(it,nm+' (trigger): condition '+(CMP_OP[a]||a)+' → '+(CMP_OP[b]||b));
      else if(it.k==='tag'&&f==='consentSettings.consentStatus'&&a==='NEEDED')line(it,nm+': consent requirement removed ('+a+' → '+b+')');
      else if(it.k==='tag'&&f==='blockingTriggerId'&&!/^(–|\(not set\))$/.test(a)&&(b==='(not set)'||!/added:/.test(b)))line(it,nm+': no longer blocked by '+clean(a.replace(/^\[|\]$/g,'').replace(/"/g,'')));
      else if(it.k==='tag'&&/^parameter\.html/.test(f)&&/ttq\.instance\(/.test(a)&&!/ttq\.instance\(/.test(b)){ttq.push(nm);ids.add(it.k+'|'+it.id);}
      else if(it.k==='tag'&&/\.(measurementId|measurementIdOverride|conversionId|conversionLabel|pixelId|tagId|sendTo|trackingId|accountId)$/.test(f)&&!/no match on/.test(a+b))line(it,nm+': '+f.split('.').pop()+' '+a+' → '+b);
      else if(it.k==='variable'&&/^parameter/.test(f)&&/event.?id|transaction|order.?id|\bvalue\b|price|currency|pixel|account|measurement|conversion/i.test(nm)&&!/no match on/.test(a+b))line(it,nm+' (variable): '+a.slice(0,90)+' → '+b.slice(0,90));});});
  if(ttq.length)set.push('TikTok: '+plural(ttq.length,'tag')+' now call ttq.track(…) instead of ttq.instance(ID).track(…), so each event goes to every TikTok pixel on the page ('+ttq.slice(0,4).join(', ')+(ttq.length>4?', …':'')+')');
  return{ra,set,ids};
}
const rgAct=x=>{if(!x.agg)return x.scen+' · '+x.step;const by={};x.acts.forEach(a=>(by[a.scen]=by[a.scen]||[]).push(a.step));return Object.entries(by).map(([sc,st])=>sc+' · '+st.join(' / ')).join(', ');};
const rgTagTxt=L=>L.map(t=>t.n+(t.ok?' ✓':' ✗')+(t.note?' ('+t.note+')':'')).join('\n');
function rgDiag(x){const names=new Set([...(x.tags||[]),...x.iss.map(i=>i.tag),...x.iss.map(i=>i.now)].filter(Boolean));const out=[];
  diagnoses().forEach(d=>(d.tags||[]).forEach(t=>{if(t&&names.has(t.tag))out.push('Tag Assistant ('+d.phase.name+'): '+[t.tag,t.trigger,t.condition,t.why].filter(Boolean).join(' · '));}));
  if(out.length)diagnoses().forEach(d=>{(d.root_cause||[]).forEach(r=>out.push('Root cause: '+r));(d.fixes||[]).forEach(r=>out.push('Fix: '+r));});return out;}
const rgWhy=x=>x.iss.map(i=>RULE_TXT[i.rule]+': '+i.text).concat(x.st==='fail'?rgDiag(x):[]);
function rgCells(x){return[x.st==='fail'?'Failed':'Passed',rgAct(x),rgTracked(x,'live'),rgTracked(x,'cur'),rgTagTxt(rgTags(x,'live')),rgTagTxt(rgTags(x,'cur'))];}
function rgTagCell(L){return L.length?L.map(t=>'<div>'+esc(t.n)+' <b style="color:var(--'+(t.ok?'pass':'fail')+')">'+(t.ok?'✓':'✗')+'</b>'+(t.note?'<div class="why mono">'+esc(t.note)+'</div>':'')+'</div>').join(''):'<span class="muted">–</span>';}
function rgRowHtml(x,multi){
  return'<tr><td>'+pill(x.st==='fail'?'fail':'pass',x.st==='fail'?'Failed':'Passed')+'</td>'
    +'<td style="min-width:200px"><b style="font-weight:500">'+esc(rgAct(x))+'</b><div class="why">'+esc(x.vendor)+(multi?' · '+esc(x.pairTxt):'')+'</div>'
    +(x.st==='fail'?'<ul class="steplist" style="margin-top:4px">'+rgWhy(x).map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'')+'</td>'
    +'<td>'+esc(rgTracked(x,'live'))+'</td><td>'+esc(rgTracked(x,'cur'))+'</td><td>'+rgTagCell(rgTags(x,'live'))+'</td><td>'+rgTagCell(rgTags(x,'cur'))+'</td></tr>';}
const raTxt=x=>(x.s==='removed'?'Removed':'Added')+' · '+x.name+(x.vendor?' ('+x.vendor+')':'')+' · '+(x.at.length?'fired on '+(x.s==='removed'?'Live':'Preview')+' at '+x.at.slice(0,3).join(', ')+(x.at.length>3?' +'+(x.at.length-3)+' more':''):'not reached by the journey')+' · needs a decision';
function rgSheet(G){return[['Result','Journey / action','Vendor','Check','Getting tracked? (Live)','Getting tracked? (Preview)','Tag fired (Live)','Tag fired (Preview)','Why it failed']]
  .concat(G.failed.concat(G.rows.filter(x=>x.st!=='fail')).map(x=>{const c=rgCells(x);return[c[0],c[1],x.vendor,x.pairTxt,c[2],c[3],c[4],c[5],rgWhy(x).join('\n')];}));}
function rgListRows(LS,G){return[['List','Item']].concat(LS.ra.map(x=>['Removed or added in this release',raTxt(x)])).concat(LS.set.map(x=>['Settings change that can affect tracking',x])).concat(G.cov.map(x=>['Not compared',x])).concat(G.notes.map(x=>['Not compared',x]));}
