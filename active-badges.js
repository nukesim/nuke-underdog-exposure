(()=>{
'use strict';
if(globalThis.__NUKE_ACTIVE_BADGES__)return;
globalThis.__NUKE_ACTIVE_BADGES__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const norm=Core.norm||((s)=>String(s||'').trim().toLowerCase().replace(/\s+/g,' '));
const NONE=Core.NONE||'__NO_TOURNAMENT__';
let model={total:0,counts:new Map(),pairs:new Map(),scope:{sport:'NFL',contest:NONE},pool:[]};
let playerRoot=null,lastUrl='',tickBusy=false,scrollRaf=0;

document.documentElement.classList.add('nuke-stable-mode');

const isDraftPage=()=>/\/draft\//.test(location.pathname);
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;

function selectedScope(data,drafts){
 let sport=String(data.exposureScope?.sport||data.activePageScope?.sport||'NFL').toUpperCase();
 if(!sport||sport==='ALL')sport='NFL';
 const real=[...new Set(drafts.filter(d=>String(d.sport||'').toUpperCase()===sport).map(d=>d.contest).filter(Boolean))];
 const choices=[data.exposureScope?.contest,data.activePageScope?.contest,data.lastSelectedContest].filter(x=>x&&x!==NONE&&x!=='ALL');
 let contest=choices.find(x=>real.includes(x))||NONE;
 if(contest===NONE&&real.length===1)contest=real[0];
 return {sport,contest};
}

function buildModel(data){
 const drafts=(data.drafts||[]).filter(d=>d&&Array.isArray(d.players));
 const scope=selectedScope(data,drafts);
 const pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse||{},drafts,data.officialExposure||{});
 const resolved=Core.displayDrafts(drafts,pool).filter(d=>(scope.sport==='ALL'||String(d.sport||'').toUpperCase()===scope.sport)&&(scope.contest==='ALL'||scope.contest===NONE||d.contest===scope.contest));

 const surnameFull=new Map();
 for(const d of resolved)for(const p of (d.players||[])){
  const r=Core.resolve({...p,sport:p.sport||d.sport},pool);
  if(r.unresolved||!r.name||!r.name.includes(' '))continue;
  const surname=norm(r.name).split(' ').filter(Boolean).at(-1);if(!surname)continue;
  if(!surnameFull.has(surname))surnameFull.set(surname,r.name);
  else if(surnameFull.get(surname)!==r.name)surnameFull.set(surname,null);
 }
 const canonical=(raw,d)=>{
  const r=Core.resolve({...raw,sport:raw.sport||d.sport},pool);let name=r.name;
  if(r.unresolved&&name&&!name.includes(' ')){const full=surnameFull.get(norm(name));if(full)name=full}
  return name;
 };

 const counts=new Map(),pairs=new Map();
 for(const d of resolved){
  const names=[...new Set((d.players||[]).map(p=>canonical(p,d)).filter(Boolean))];
  for(const name of names){const key=norm(name);if(key)counts.set(key,(counts.get(key)||0)+1)}
  const sorted=names.slice().sort((a,b)=>a.localeCompare(b));
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
   const key=sorted[i]+' + '+sorted[j];pairs.set(key,(pairs.get(key)||0)+1);
  }
 }
 model={total:resolved.length,counts,pairs,scope,pool};
}

async function refreshData(){
 try{
  const data=await chrome.storage.local.get({drafts:[],exposureScope:null,activePageScope:null,lastSelectedContest:NONE,playerUniverse:{},officialExposure:{}});
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
    const text=(p.innerText||'').replace(/\s+/g,' ').trim(),rect=p.getBoundingClientRect();
    if(/\bADP\b/i.test(text)&&/\bProj\b/i.test(text)&&rect.width>220&&rect.width<1000){playerRoot=p;return p}
   }
  }
 }catch{}
 return null;
}

function findQueueHost(){
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Queue']",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  for(let i=0;i<snap.snapshotLength;i++){
   const label=snap.snapshotItem(i);if(!visible(label))continue;
   let p=label.parentElement,best=null;
   for(let depth=0;depth<7&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect();
    if(r.width>300&&r.width<900&&r.height>35){best=p;if(r.height>140)break}
   }
   if(best)return best;
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
 const count=model.counts.get(norm(name))||0,total=model.total,pct=total?count/total*100:0;
 return `${Math.round(pct)}% · ${count}/${total}`;
}
function colorFor(count,total){if(!total||count===0)return '#94a3b8';const pct=count/total;if(pct>=.4)return '#facc15';if(pct>=.2)return '#38bdf8';return '#a7f3d0'}

function renderBadges(){
 if(!isDraftPage()||!model.total)return;
 const root=findPlayerRoot();if(!root)return;
 const names=catalogNameMap();
 for(const old of root.querySelectorAll('.nuke-active-own')){
  const prev=old.previousElementSibling,raw=(prev?.textContent||'').replace(/\s+/g,' ').trim();
  if(!prev||!names.has(norm(raw)))old.remove();
 }
 for(const el of root.querySelectorAll('span,p,div')){
  if(el.classList?.contains('nuke-active-own')||el.childElementCount||!visible(el))continue;
  const raw=(el.textContent||'').replace(/\s+/g,' ').trim(),full=names.get(norm(raw));if(!full)continue;
  let b=el.nextElementSibling;
  if(!b?.classList?.contains('nuke-active-own')){
   b=document.createElement('span');b.className='nuke-active-own';b.dataset.nukeActiveOwn='1';el.insertAdjacentElement('afterend',b);
  }
  const count=model.counts.get(norm(full))||0,text=badgeText(full);if(b.textContent!==text)b.textContent=text;
  b.title=`NUKE exposure · ${model.scope.sport} · ${model.scope.contest}`;
  b.style.color=colorFor(count,model.total);
 }
}

function stableComboPanel(){
 let panel=document.getElementById('nuke-stable-combo-panel');
 if(!panel){panel=document.createElement('section');panel.id='nuke-stable-combo-panel';document.body.appendChild(panel)}
 return panel;
}
function renderCombo(){
 const panel=stableComboPanel();
 if(!isDraftPage()||!model.total){panel.hidden=true;return}
 const host=findQueueHost();if(!host){return}
 const r=host.getBoundingClientRect();if(r.width<250||r.bottom<0||r.top>innerHeight){panel.hidden=true;return}
 panel.hidden=false;panel.style.left=Math.round(r.left)+'px';panel.style.width=Math.round(r.width)+'px';panel.style.top=Math.round(r.top+30)+'px';
 const top=[...model.pairs.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8);
 const frag=document.createDocumentFragment(),head=document.createElement('div');head.className='nuke-stable-combo-head';
 const title=document.createElement('b');title.textContent='NUKE · TOP COMBOS';const total=document.createElement('span');total.textContent=model.total+' drafts';head.append(title,total);frag.append(head);
 for(const [name,count] of top){const row=document.createElement('div');row.className='nuke-stable-combo-row';const n=document.createElement('span'),v=document.createElement('b');n.textContent=name;v.textContent=`${count}/${model.total} · ${Math.round(count/model.total*100)}%`;row.append(n,v);frag.append(row)}
 panel.replaceChildren(frag);
}

function render(){
 if(!isDraftPage()){
  document.querySelectorAll('.nuke-active-own').forEach(x=>x.remove());
  const panel=document.getElementById('nuke-stable-combo-panel');if(panel)panel.hidden=true;
  playerRoot=null;return;
 }
 renderBadges();renderCombo();
}

async function tick(){
 if(tickBusy)return;tickBusy=true;
 try{if(location.href!==lastUrl){lastUrl=location.href;playerRoot=null;await refreshData()}render()}finally{tickBusy=false}
}
function fastRender(){if(scrollRaf)return;scrollRaf=requestAnimationFrame(()=>{scrollRaf=0;render()})}

document.addEventListener('scroll',fastRender,{capture:true,passive:true});
window.addEventListener('resize',fastRender,{passive:true});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.drafts||changes.exposureScope||changes.activePageScope||changes.lastSelectedContest||changes.playerUniverse||changes.officialExposure){refreshData().then(render)}
});

refreshData().then(render);
setInterval(tick,700);
})();
