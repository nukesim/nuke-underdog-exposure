(()=>{
'use strict';
if(globalThis.__NUKE_ACTIVE_BADGES__)return;
globalThis.__NUKE_ACTIVE_BADGES__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const norm=Core.norm||((s)=>String(s||'').trim().toLowerCase().replace(/\s+/g,' '));
const NONE=Core.NONE||'__NO_TOURNAMENT__';
let model={total:0,counts:new Map(),scope:{sport:'NFL',contest:NONE},pool:[]};
let playerRoot=null,lastUrl='',tickBusy=false;

const isDraftPage=()=>/\/draft\//.test(location.pathname);
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;

function selectedScope(data,drafts){
 let sport=String(data.exposureScope?.sport||'NFL').toUpperCase();
 let contest=data.exposureScope?.contest||data.lastSelectedContest||NONE;
 if(!sport||sport==='ALL')sport='NFL';
 const real=[...new Set(drafts.filter(d=>String(d.sport||'').toUpperCase()===sport).map(d=>d.contest).filter(Boolean))];
 if(!contest||contest===NONE||contest==='ALL'){
  if(real.length===1)contest=real[0];
 }
 return {sport,contest};
}

function buildModel(data){
 const drafts=(data.drafts||[]).filter(d=>d&&Array.isArray(d.players));
 const scope=selectedScope(data,drafts);
 const pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse||{},drafts,data.officialExposure||{});
 const resolved=Core.displayDrafts(drafts,pool).filter(d=>(scope.sport==='ALL'||String(d.sport||'').toUpperCase()===scope.sport)&&(scope.contest==='ALL'||scope.contest===NONE||d.contest===scope.contest));

 // Learn one safe full-name mapping per surname from this exact tournament.
 const surnameFull=new Map();
 for(const d of resolved)for(const p of (d.players||[])){
  const r=Core.resolve({...p,sport:p.sport||d.sport},pool);
  if(r.unresolved||!r.name||!r.name.includes(' '))continue;
  const parts=norm(r.name).split(' ').filter(Boolean),surname=parts.at(-1);
  if(!surname)continue;
  if(!surnameFull.has(surname))surnameFull.set(surname,r.name);
  else if(surnameFull.get(surname)!==r.name)surnameFull.set(surname,null);
 }

 const counts=new Map();
 for(const d of resolved){
  const seen=new Set();
  for(const raw of (d.players||[])){
   let r=Core.resolve({...raw,sport:raw.sport||d.sport},pool),name=r.name;
   if(r.unresolved&&name&&!name.includes(' ')){
    const full=surnameFull.get(norm(name));
    if(full)name=full;
   }
   const key=norm(name);if(!key||seen.has(key))continue;
   seen.add(key);counts.set(key,(counts.get(key)||0)+1);
  }
 }
 model={total:resolved.length,counts,scope,pool};
}

async function refreshData(){
 try{
  const data=await chrome.storage.local.get({drafts:[],exposureScope:null,lastSelectedContest:NONE,playerUniverse:{},officialExposure:{}});
  buildModel(data);
 }catch{}
}

function findPlayerRoot(){
 if(visible(playerRoot))return playerRoot;
 playerRoot=null;
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Players']",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  for(let i=0;i<snap.snapshotLength;i++){
   const label=snap.snapshotItem(i);if(!visible(label))continue;
   let p=label;
   for(let depth=0;depth<7&&p&&p!==document.body;depth++,p=p.parentElement){
    const text=(p.innerText||'').replace(/\s+/g,' ').trim();
    const rect=p.getBoundingClientRect();
    if(/\bADP\b/i.test(text)&&/\bProj\b/i.test(text)&&rect.width>220&&rect.width<1000){playerRoot=p;return p}
   }
  }
 }catch{}
 return null;
}

function catalogNameMap(){
 const map=new Map();
 for(const p of model.pool){const k=norm(p.name);if(k)map.set(k,p.name)}
 for(const p of globalThis.NUKE_PLAYER_CATALOG||[]){const k=norm(p.name);if(k&&!map.has(k))map.set(k,p.name)}
 return map;
}

function badgeText(name){
 const count=model.counts.get(norm(name))||0,total=model.total;
 const pct=total?count/total*100:0;
 return `${pct.toFixed(1)}% · ${count}/${total}`;
}

function colorFor(count,total){
 if(!total||count===0)return '#94a3b8';
 const pct=count/total;
 if(pct>=0.4)return '#facc15';
 if(pct>=0.2)return '#38bdf8';
 return '#a7f3d0';
}

function render(){
 if(!isDraftPage()){
  document.querySelectorAll('.nuke-active-own').forEach(x=>x.remove());
  playerRoot=null;return;
 }
 if(!model.total)return;
 // If the legacy renderer is already showing badges, do not duplicate them.
 if(document.querySelector('[data-nuke-exposure]')){
  document.querySelectorAll('.nuke-active-own').forEach(x=>x.remove());return;
 }
 const root=findPlayerRoot();if(!root)return;
 const names=catalogNameMap();
 const candidates=root.querySelectorAll('span,p,div');
 for(const el of candidates){
  if(el.classList?.contains('nuke-active-own')||el.childElementCount||!visible(el))continue;
  const raw=(el.textContent||'').replace(/\s+/g,' ').trim(),key=norm(raw),full=names.get(key);
  if(!full)continue;
  let next=el.nextElementSibling;
  if(next?.classList?.contains('nuke-active-own')){
   const text=badgeText(full);if(next.textContent!==text)next.textContent=text;continue;
  }
  const count=model.counts.get(norm(full))||0,b=document.createElement('span');
  b.className='nuke-active-own';b.dataset.nukeActiveOwn='1';b.textContent=badgeText(full);
  b.title=`NUKE exposure · ${model.scope.sport} · ${model.scope.contest}`;
  Object.assign(b.style,{display:'inline-block',marginLeft:'8px',padding:'2px 6px',borderRadius:'999px',fontSize:'11px',fontWeight:'800',lineHeight:'16px',whiteSpace:'nowrap',color:colorFor(count,model.total),background:'rgba(15,23,42,.88)',border:'1px solid rgba(148,163,184,.35)',verticalAlign:'middle'});
  el.insertAdjacentElement('afterend',b);
 }
}

async function tick(){
 if(tickBusy)return;tickBusy=true;
 try{
  if(location.href!==lastUrl){lastUrl=location.href;playerRoot=null;await refreshData()}
  render();
 }finally{tickBusy=false}
}

chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.drafts||changes.exposureScope||changes.lastSelectedContest||changes.playerUniverse||changes.officialExposure){refreshData().then(render)}
});

refreshData().then(render);
setInterval(tick,1200);
})();
