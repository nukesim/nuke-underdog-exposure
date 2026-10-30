(()=>{
'use strict';
if(globalThis.__NUKE_DUPE_TRACKER__)return;
globalThis.__NUKE_DUPE_TRACKER__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const NONE=Core.NONE||'__NO_TOURNAMENT__';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=Core.norm||((s)=>clean(s).toLowerCase());
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;
const isDraftPage=()=>/\/draft\//i.test(location.pathname);

let history=[],pool=[],scope={sport:'NFL',contest:NONE},rosterCache=null,lastDataAt=0,busy=false,timer=0;

function validContest(x){return x&&x!==NONE&&x!=='ALL'&&!/^(?:queue|players|drafts|completed|active)$/i.test(clean(x))}
function chooseScope(data,drafts){
 let sport=String(data.exposureScope?.sport||data.activePageScope?.sport||'NFL').toUpperCase();
 if(!sport||sport==='ALL')sport='NFL';
 const real=[...new Set(drafts.filter(d=>String(d.sport||'').toUpperCase()===sport).map(d=>clean(d.contest)).filter(validContest))];
 const choices=[data.exposureScope?.contest,data.activePageScope?.contest,data.lastSelectedContest].map(clean).filter(validContest);
 const contest=choices.find(x=>real.includes(x))||(real.length===1?real[0]:NONE);
 return {sport,contest};
}
async function refreshData(force=false){
 if(!force&&Date.now()-lastDataAt<5000&&pool.length)return;
 try{
  const data=await chrome.storage.local.get({drafts:[],exposureScope:null,activePageScope:null,lastSelectedContest:NONE,playerUniverse:{},officialExposure:{}});
  const drafts=(data.drafts||[]).filter(d=>d&&Array.isArray(d.players));
  scope=chooseScope(data,drafts);
  pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse||{},drafts,data.officialExposure||{});
  history=Core.displayDrafts(drafts,pool).filter(d=>String(d.sport||'').toUpperCase()===scope.sport&&scope.contest!==NONE&&d.contest===scope.contest);
  lastDataAt=Date.now();
 }catch{}
}
function nameMap(){
 const m=new Map();
 for(const p of pool){const k=norm(p.name);if(k)m.set(k,p.name)}
 for(const p of globalThis.NUKE_PLAYER_CATALOG||[]){const k=norm(p.name);if(k&&!m.has(k))m.set(k,p.name)}
 return m;
}
function rosterRoot(){
 if(visible(rosterCache))return rosterCache;
 rosterCache=null;
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Pick position']",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  let best=null,bestScore=-Infinity;
  for(let i=0;i<snap.snapshotLength;i++){
   const label=snap.snapshotItem(i);if(!visible(label))continue;
   const lr=label.getBoundingClientRect(),lc=lr.left+lr.width/2;if(lc<innerWidth*.68)continue;
   let p=label.parentElement;
   for(let depth=0;depth<10&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect();if(r.width<240||r.width>680||r.height<170||r.height>900||r.left<innerWidth*.60)continue;
    const text=clean(p.innerText),score=r.height+(/\bQB\b/.test(text)?80:0)+(/\bRB\b/.test(text)?80:0)+(/\bWR\b/.test(text)?80:0)+(/\bTE\b/.test(text)?80:0);
    if(score>bestScore){best=p;bestScore=score}
   }
  }
  rosterCache=best;return best;
 }catch{return null}
}
function currentPicks(){
 const root=rosterRoot();if(!root)return [];
 const map=nameMap(),out=[],seen=new Set();
 for(const el of root.getElementsByTagName('*')){
  if(!visible(el)||el.children.length)continue;
  const raw=clean(el.textContent);if(!raw||raw.length>60)continue;
  const full=map.get(norm(raw));if(!full)continue;
  const k=norm(full);if(seen.has(k))continue;seen.add(k);out.push(full);
 }
 return out;
}
function dupeState(picks){
 if(!picks.length||!history.length)return {level:0,matches:[]};
 let best={level:0,matches:[]};
 for(const d of history){
  const old=new Set((d.players||[]).map(p=>norm(p.name)).filter(Boolean));
  const matches=picks.filter(name=>old.has(norm(name)));
  if(matches.length>best.level)best={level:matches.length,matches};
 }
 return best;
}
function queueTitle(){
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Queue' or starts-with(normalize-space(text()),'Queue ')]",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  for(let i=0;i<snap.snapshotLength;i++){
   const x=snap.snapshotItem(i);if(!visible(x))continue;
   const r=x.getBoundingClientRect(),cx=r.left+r.width/2;
   if(cx>innerWidth*.34&&cx<innerWidth*.76)return x;
  }
 }catch{}
 return null;
}
function pill(){
 let el=document.getElementById('nuke-dupe-pill');
 if(!el){el=document.createElement('div');el.id='nuke-dupe-pill';document.body.appendChild(el)}
 return el;
}
function position(el,title){
 if(!title){el.hidden=true;return}
 const r=title.getBoundingClientRect();
 const w=190,left=Math.max(8,Math.round(r.left+r.width/2-w/2)),top=Math.max(8,Math.round(r.top-34));
 el.style.left=left+'px';el.style.top=top+'px';el.style.width=w+'px';el.hidden=false;
}
function render(){
 const el=pill();
 if(!isDraftPage()||!history.length){el.hidden=true;return}
 if(!document.body.innerText.includes('Players')){el.hidden=true;return}
 const picks=currentPicks(),state=dupeState(picks),level=Math.max(0,Math.min(6,state.level));
 el.className='nuke-dupe-pill nuke-dupe-level-'+level;
 el.textContent=picks.length?('DUPE PATH · '+level+'/6'):'DUPE PATH · 0/6';
 el.title=state.matches.length?('Closest prior lineup matches: '+state.matches.join(' + ')):'No matching prior core yet';
 position(el,queueTitle());
}
async function sync(force=false){
 if(busy)return;busy=true;
 try{await refreshData(force);render()}finally{busy=false}
}
function schedule(force=false){
 clearTimeout(timer);
 timer=setTimeout(()=>sync(force),180);
}
document.addEventListener('click',()=>{rosterCache=null;schedule(false)},true);
window.addEventListener('resize',()=>schedule(false),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){rosterCache=null;schedule(true)}});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='local'&&(changes.drafts||changes.exposureScope||changes.activePageScope||changes.lastSelectedContest||changes.playerUniverse)){
  lastDataAt=0;rosterCache=null;schedule(true);
 }
});
sync(true);
setInterval(()=>{if(!document.hidden&&isDraftPage())sync(false)},5000);
})();