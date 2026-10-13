(()=>{
'use strict';
if(globalThis.__NUKE_PORTFOLIO_GUARD__)return;
globalThis.__NUKE_PORTFOLIO_GUARD__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const NONE=Core.NONE||'__NO_TOURNAMENT__';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=Core.norm||((s)=>clean(s).toLowerCase());
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;
const isDraftPage=()=>/\/draft\//i.test(location.pathname);
let lastCapturedId='',captureBusy=false,lastFallbackAt=0;

function dupeLevel(text){
 const t=clean(text);
 if(/FULL LINEUP DUPLICATE/i.test(t))return 6;
 const m=t.match(/(\d+)\s*\/\s*6\b/)||t.match(/(?:closest|WATCH|PATH|DANGER)[^\d]*(\d+)\s*\/\s*\d+/i);
 return m?Math.max(0,Math.min(6,Number(m[1])||0)):0;
}
function decorateDuplicatePath(){
 const box=document.querySelector('#nuke-combo-dock .nuke-duplicate');
 if(box){
  const level=dupeLevel(box.textContent);
  for(let i=0;i<=6;i++)box.classList.remove('nuke-dupe-level-'+i);
  box.classList.add('nuke-dupe-level-'+level);
  const label=box.querySelector('b');
  if(label){
   if(level===0)label.textContent='UNIQUE BUILD · 0/6';
   else if(level<=3)label.textContent=`DUPE PATH · ${level}/6`;
   else if(level===4)label.textContent='DUPLICATE WATCH · 4/6';
   else if(level===5)label.textContent='DUPLICATE DANGER · 5/6';
   else label.textContent='⚠ FULL LINEUP DUPLICATE · 6/6';
  }
 }
 for(const tag of document.querySelectorAll('#nuke-combo-dock .nuke-next-tag.duplicate')){
  const level=dupeLevel(tag.textContent);
  for(let i=0;i<=6;i++)tag.classList.remove('nuke-dupe-level-'+i);
  tag.classList.add('nuke-dupe-level-'+level);
 }
}

function comboPickNames(){
 const el=document.querySelector('#nuke-combo-dock .nuke-next-picks');
 if(!el)return [];
 const text=clean(el.textContent).replace(/^MY PICKS\s*[·:-]\s*/i,'');
 if(!text)return [];
 return [...new Set(text.split(/\s+\+\s+/).map(clean).filter(Boolean))];
}
function rosterRoot(){
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
  return best;
 }catch{return null}
}
function scopeFrom(data){
 let sport=String(data.activePageScope?.sport||data.exposureScope?.sport||'NFL').toUpperCase();
 if(!sport||sport==='ALL')sport='NFL';
 const choices=[data.activePageScope?.contest,data.exposureScope?.contest,data.lastSelectedContest].map(clean).filter(x=>x&&x!==NONE&&x!=='ALL');
 const real=[...new Set((data.drafts||[]).filter(d=>String(d.sport||'').toUpperCase()===sport).map(d=>clean(d.contest)).filter(Boolean))];
 const contest=choices[0]||(real.length===1?real[0]:NONE);
 return {sport,contest};
}
function poolFrom(data){return Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse||{},data.drafts||[],data.officialExposure||{})}
function rosterPickNames(pool){
 const root=rosterRoot();if(!root)return [];
 const map=new Map(pool.map(p=>[norm(p.name),p.name]).filter(([k])=>k));
 for(const p of globalThis.NUKE_PLAYER_CATALOG||[]){const k=norm(p.name);if(k&&!map.has(k))map.set(k,p.name)}
 const out=[],seen=new Set();
 for(const el of root.getElementsByTagName('*')){
  if(!visible(el)||el.children.length)continue;
  const raw=clean(el.textContent);if(!raw||raw.length>60)continue;
  const full=map.get(norm(raw));if(!full)continue;
  const k=norm(full);if(seen.has(k))continue;seen.add(k);out.push(full);
 }
 return out;
}
async function captureIfComplete(forceFallback=false){
 if(captureBusy||!isDraftPage())return;
 const routeId=location.pathname.match(/\/draft\/([^/?#]+)/i)?.[1]||'';
 if(!routeId||routeId===lastCapturedId)return;
 let names=comboPickNames();
 const now=Date.now();
 const needFallback=forceFallback||names.length!==6&&now-lastFallbackAt>2500;
 let data=null,pool=null;
 if(needFallback){
  lastFallbackAt=now;
  try{data=await chrome.storage.local.get({drafts:[],exposureScope:null,activePageScope:null,lastSelectedContest:NONE,playerUniverse:{},officialExposure:{}});pool=poolFrom(data);const roster=rosterPickNames(pool);if(roster.length>names.length)names=roster}catch{}
 }
 names=[...new Set(names.map(clean).filter(Boolean))];
 if(names.length!==6)return;
 captureBusy=true;lastCapturedId=routeId;
 try{
  if(!data)data=await chrome.storage.local.get({drafts:[],exposureScope:null,activePageScope:null,lastSelectedContest:NONE,playerUniverse:{},officialExposure:{}});
  const scope=scopeFrom(data);if(!scope.contest||scope.contest===NONE||scope.contest==='ALL'){lastCapturedId='';return}
  if(!pool)pool=poolFrom(data);
  const players=names.map(name=>{
   const p=Core.resolve({name,sport:scope.sport},pool);
   return {name:p.name||name,pos:String(p.pos||'').toUpperCase(),team:String(p.teamAbbr||p.team||'').toUpperCase(),sport:scope.sport};
  });
  const drafts=[...(data.drafts||[])];
  const exact=drafts.findIndex(d=>String(d.draftId||'')===routeId);
  const draft={draftId:routeId,sport:scope.sport,format:'Daily Draft',contest:scope.contest,players,sourceUrl:location.href,capturedAt:new Date().toISOString(),source:'live-auto'};
  if(exact>=0)drafts[exact]={...drafts[exact],...draft};
  else drafts.push(draft);
  await chrome.storage.local.set({drafts,exposureScope:scope,lastAutoCapturedDraft:{draftId:routeId,contest:scope.contest,capturedAt:draft.capturedAt}});
 }catch{lastCapturedId=''}finally{captureBusy=false}
}

function tick(){decorateDuplicatePath();captureIfComplete(false)}
document.addEventListener('click',()=>{decorateDuplicatePath();setTimeout(()=>captureIfComplete(false),180);setTimeout(()=>captureIfComplete(false),650)},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){decorateDuplicatePath();captureIfComplete(true)}});
setInterval(tick,700);
tick();
})();
