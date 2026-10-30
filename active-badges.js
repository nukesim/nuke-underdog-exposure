(()=>{
'use strict';
if(globalThis.__NUKE_ACTIVE_BADGES__)return;
globalThis.__NUKE_ACTIVE_BADGES__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const norm=Core.norm||((s)=>String(s||'').trim().toLowerCase().replace(/\s+/g,' '));
const NONE=Core.NONE||'__NO_TOURNAMENT__';
let model={total:0,counts:new Map(),history:[],scope:{sport:'NFL',contest:NONE},pool:[]};
let playerRoot=null,lastUrl='',tickBusy=false,scrollRaf=0,rosterRootCache=null;
let stackTeams=new Set(),draftedTeams=new Set(),draftedNames=[],draftedQB=false,draftedQBTeam='',lastStackScan=0;

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

 const counts=new Map();
 for(const d of resolved){
  const names=[...new Set((d.players||[]).map(p=>canonical(p,d)).filter(Boolean))];
  for(const name of names){const key=norm(name);if(key)counts.set(key,(counts.get(key)||0)+1)}
 }
 model={total:resolved.length,counts,history:resolved,scope,pool};
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

function catalogMetaMap(){
 const map=new Map();
 for(const p of model.pool){const k=norm(p.name);if(k)map.set(k,p)}
 for(const p of globalThis.NUKE_PLAYER_CATALOG||[]){const k=norm(p.name);if(k&&!map.has(k))map.set(k,p)}
 return map;
}
function catalogNameMap(){
 const map=new Map();
 for(const [k,p] of catalogMetaMap())map.set(k,p.name);
 return map;
}

function rosterRoot(){
 if(visible(rosterRootCache))return rosterRootCache;
 rosterRootCache=null;
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Pick position']",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  let best=null,bestScore=-Infinity;
  for(let i=0;i<snap.snapshotLength;i++){
   const label=snap.snapshotItem(i);if(!visible(label))continue;
   const lr=label.getBoundingClientRect(),lc=lr.left+lr.width/2;if(lc<innerWidth*.68)continue;
   let p=label.parentElement;
   for(let depth=0;depth<10&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect();
    if(r.width<240||r.width>680||r.height<170||r.height>900||r.left<innerWidth*.60)continue;
    const text=(p.innerText||'').replace(/\s+/g,' ').trim();
    const score=r.height+(/\bQB\b/.test(text)?80:0)+(/\bRB\b/.test(text)?80:0)+(/\bWR\b/.test(text)?80:0)+(/\bTE\b/.test(text)?80:0);
    if(score>bestScore){best=p;bestScore=score}
   }
  }
  rosterRootCache=best;return best;
 }catch{return null}
}
function refreshStackTargets(force=false){
 const now=Date.now();if(!force&&now-lastStackScan<500)return;
 lastStackScan=now;
 const root=rosterRoot(),teams=new Set(),allTeams=new Set(),names=[];let hasQB=false,qbTeam='';
 if(root){
  const map=catalogMetaMap();
  for(const el of root.getElementsByTagName('*')){
   if(!visible(el)||el.children.length)continue;
   const raw=(el.textContent||'').replace(/\s+/g,' ').trim(),p=map.get(norm(raw));if(!p)continue;
   const pos=String(p.pos||p.position||'').toUpperCase(),team=String(p.teamAbbr||p.team||'').toUpperCase();
   if(!names.some(x=>norm(x)===norm(p.name)))names.push(p.name);
   if(team)allTeams.add(team);
   if(pos==='QB'){hasQB=true;if(team)qbTeam=team}
   else if((pos==='WR'||pos==='TE')&&team)teams.add(team);
  }
 }
 stackTeams=teams;draftedTeams=allTeams;draftedNames=names;draftedQB=hasQB;draftedQBTeam=qbTeam;
}
function playerRowFor(el,root){
 const rr=root.getBoundingClientRect();let p=el.parentElement;
 for(let depth=0;depth<7&&p&&p!==root;depth++,p=p.parentElement){
  const r=p.getBoundingClientRect();
  if(r.width>=rr.width*.72&&r.height>=42&&r.height<=110)return p;
 }
 return null;
}
function clearStackHighlights(root){
 root.querySelectorAll('.nuke-team-dot,.nuke-if-picked').forEach(x=>x.remove());
 root.querySelectorAll('[data-nuke-reverse-stack-row],[data-nuke-forward-stack-row]').forEach(row=>{
  row.classList.remove('nuke-stack-row');delete row.dataset.nukeReverseStackRow;delete row.dataset.nukeForwardStackRow;
 });
 root.querySelectorAll('[data-nuke-reverse-stack-name],[data-nuke-forward-stack-name]').forEach(el=>{
  el.classList.remove('nuke-qb-stack');delete el.dataset.nukeReverseStackName;delete el.dataset.nukeForwardStackName;
  if(el.title?.startsWith('STACK QB · ')||el.title?.startsWith('QB STACK · '))el.removeAttribute('title');
 });
}

function shortName(name){
 const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
 if(parts.length<=1)return String(name||'').trim();
 const suffix=/^(?:Jr\.?|Sr\.?|II|III|IV)$/i.test(parts.at(-1));
 return suffix&&parts.length>=2?parts.slice(-2).join(' '):parts.at(-1);
}
function candidateDupe(name){
 if(!draftedNames.length||!model.history.length)return {level:0,matches:[]};
 const candidate=norm(name);let best={level:0,matches:[]};
 for(const d of model.history){
  const old=new Set((d.players||[]).map(p=>norm(p.name)).filter(Boolean));
  if(!old.has(candidate))continue;
  const matches=draftedNames.filter(x=>old.has(norm(x)));
  const level=matches.length+1;
  if(level>best.level)best={level,matches};
 }
 return best;
}
function previewText(matches,level){
 const short=matches.map(shortName);
 let left='';
 if(short.length<=2)left=short.join(' + ');
 else left=short.slice(0,2).join(' + ')+' +'+(short.length-2);
 return (left?left+' → ':'IF PICKED → ')+level+'/6';
}

function badgeText(name){
 const count=model.counts.get(norm(name))||0,total=model.total,pct=total?count/total*100:0;
 return `${Math.round(pct)}% · ${count}/${total}`;
}
function colorFor(count,total){if(!total||count===0)return '#94a3b8';const pct=count/total;if(pct>=.4)return '#facc15';if(pct>=.2)return '#38bdf8';return '#a7f3d0'}

function renderBadges(){
 if(!isDraftPage()||!model.total)return;
 const root=findPlayerRoot();if(!root)return;
 refreshStackTargets();
 const metas=catalogMetaMap(),names=catalogNameMap();
 clearStackHighlights(root);
 for(const old of root.querySelectorAll('.nuke-active-own')){
  const prev=old.previousElementSibling,raw=(prev?.textContent||'').replace(/\s+/g,' ').trim();
  if(!prev||!names.has(norm(raw)))old.remove();
 }
 for(const el of root.querySelectorAll('span,p,div')){
  if(el.classList?.contains('nuke-active-own')||el.childElementCount||!visible(el))continue;
  const raw=(el.textContent||'').replace(/\s+/g,' ').trim(),key=norm(raw),meta=metas.get(key),full=names.get(key);if(!full)continue;
  let b=el.nextElementSibling;
  if(!b?.classList?.contains('nuke-active-own')){
   b=document.createElement('span');b.className='nuke-active-own';b.dataset.nukeActiveOwn='1';el.insertAdjacentElement('afterend',b);
  }
  const count=model.counts.get(norm(full))||0,text=badgeText(full);if(b.textContent!==text)b.textContent=text;
  b.title=`NUKE exposure · ${model.scope.sport} · ${model.scope.contest}`;
  b.style.color=colorFor(count,model.total);

  if(meta){
   const pos=String(meta.pos||meta.position||'').toUpperCase(),team=String(meta.teamAbbr||meta.team||'').toUpperCase();
   const reverseStack=!draftedQB&&pos==='QB'&&team&&stackTeams.has(team);
   const forwardStack=!!(draftedQB&&draftedQBTeam&&(pos==='RB'||pos==='WR'||pos==='TE')&&team===draftedQBTeam);

   // Green glow remains reserved ONLY for true QB-stack relationships.
   if(reverseStack){
    el.classList.add('nuke-qb-stack');el.dataset.nukeReverseStackName='1';el.title=`STACK QB · ${team}`;
    const row=playerRowFor(el,root);if(row){row.classList.add('nuke-stack-row');row.dataset.nukeReverseStackRow='1'}
   }
   if(forwardStack){
    el.classList.add('nuke-qb-stack');el.dataset.nukeForwardStackName='1';el.title=`QB STACK · ${team}`;
    const row=playerRowFor(el,root);if(row){row.classList.add('nuke-stack-row');row.dataset.nukeForwardStackRow='1'}
   }

   // Separate same-team awareness signal. Example: if an RB is already drafted,
   // remaining WR/TE teammates get a blue dot. Suppress the dot when the player
   // already has the stronger green QB-stack signal so stacking logic stays clear.
   if(team&&draftedTeams.has(team)&&!reverseStack&&!forwardStack){
    const dot=document.createElement('span');
    dot.className='nuke-team-dot';
    dot.dataset.nukeTeamDot='1';
    dot.title=`TEAMMATE ALREADY DRAFTED · ${team}`;
    b.insertAdjacentElement('afterend',dot);
   }

   // Pre-pick portfolio warning. This does not rank or recommend players; it only
   // shows the closest historical core that WOULD be recreated by drafting them.
   const preview=candidateDupe(full);
   if(preview.level>=2){
    const tag=document.createElement('span');
    tag.className='nuke-if-picked nuke-dupe-level-'+Math.min(6,preview.level);
    tag.dataset.nukeIfPicked='1';
    tag.textContent=previewText(preview.matches,preview.level);
    tag.title='If drafted: '+preview.matches.concat([full]).join(' + ')+' matched a prior completed lineup';
    const dot=b.parentElement?.querySelector?.('.nuke-team-dot');
    (dot||b).insertAdjacentElement('afterend',tag);
   }
  }
 }
}

function render(){
 if(!isDraftPage()){
  document.querySelectorAll('.nuke-active-own').forEach(x=>x.remove());
  const panel=document.getElementById('nuke-stable-combo-panel');if(panel)panel.hidden=true;
  document.querySelectorAll('.nuke-team-dot,.nuke-if-picked').forEach(x=>x.remove());
  playerRoot=null;rosterRootCache=null;stackTeams=new Set();draftedTeams=new Set();draftedNames=[];draftedQB=false;draftedQBTeam='';return;
 }
 // Live screen intentionally stays limited to ownership + stack/team signals.
 renderBadges();
}

async function tick(){
 if(tickBusy)return;tickBusy=true;
 try{if(location.href!==lastUrl){lastUrl=location.href;playerRoot=null;rosterRootCache=null;lastStackScan=0;await refreshData()}render()}finally{tickBusy=false}
}
function fastRender(){if(scrollRaf)return;scrollRaf=requestAnimationFrame(()=>{scrollRaf=0;render()})}
let clickTimer=0;
function clickRender(){
 clearTimeout(clickTimer);
 clickTimer=setTimeout(()=>{lastStackScan=0;render()},220);
}

document.addEventListener('scroll',fastRender,{capture:true,passive:true});
document.addEventListener('click',clickRender,true);
window.addEventListener('resize',fastRender,{passive:true});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.drafts||changes.exposureScope||changes.activePageScope||changes.lastSelectedContest||changes.playerUniverse||changes.officialExposure){refreshData().then(render)}
});

refreshData().then(render);
setInterval(tick,3000);
})();