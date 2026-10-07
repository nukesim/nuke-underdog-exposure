(()=>{
'use strict';
if(globalThis.__NUKE_COMBO_DOCK_V2__)return;
globalThis.__NUKE_COMBO_DOCK_V2__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const NONE=Core.NONE||'__NO_TOURNAMENT__';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=Core.norm||((s)=>clean(s).toLowerCase());
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;
const isDraftPage=()=>/\/draft\//.test(location.pathname);
let model={total:0,counts:new Map(),pairs:new Map(),history:[],pool:[],scope:{sport:'NFL',contest:NONE}};
let lastDataAt=0,busy=false,timer=0,playerRoot=null,queueHost=null;

function dock(){
 let el=document.getElementById('nuke-combo-dock');
 if(!el){el=document.createElement('section');el.id='nuke-combo-dock';document.body.appendChild(el)}
 return el;
}

function chooseScope(data,drafts){
 let sport=String(data.exposureScope?.sport||data.activePageScope?.sport||'NFL').toUpperCase();
 if(!sport||sport==='ALL')sport='NFL';
 const real=[...new Set(drafts.filter(d=>String(d.sport||'').toUpperCase()===sport).map(d=>d.contest).filter(Boolean))];
 const choices=[data.exposureScope?.contest,data.activePageScope?.contest,data.lastSelectedContest].filter(x=>x&&x!==NONE&&x!=='ALL');
 let contest=choices.find(x=>real.includes(x))||NONE;
 if(contest===NONE&&real.length===1)contest=real[0];
 return {sport,contest};
}

function canonicalPlayer(raw,d,pool){
 const r=Core.resolve({...raw,sport:raw?.sport||d?.sport},pool);
 return r?.name||raw?.name||'';
}

function buildModel(data){
 const drafts=(data.drafts||[]).filter(d=>d&&Array.isArray(d.players));
 const scope=chooseScope(data,drafts);
 const pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse||{},drafts,data.officialExposure||{});
 const history=Core.displayDrafts(drafts,pool).filter(d=>(String(d.sport||'').toUpperCase()===scope.sport)&&(scope.contest===NONE||d.contest===scope.contest));
 const counts=new Map(),pairs=new Map();
 for(const d of history){
  const names=[...new Set((d.players||[]).map(p=>canonicalPlayer(p,d,pool)).filter(Boolean))];
  for(const name of names){const k=norm(name);counts.set(k,(counts.get(k)||0)+1)}
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
   const a=norm(names[i]),b=norm(names[j]),k=[a,b].sort().join('|');pairs.set(k,(pairs.get(k)||0)+1);
  }
 }
 model={total:history.length,counts,pairs,history,pool,scope};
}

async function refreshData(force=false){
 if(!force&&Date.now()-lastDataAt<5000&&model.pool.length)return;
 try{
  const data=await chrome.storage.local.get({drafts:[],exposureScope:null,activePageScope:null,lastSelectedContest:NONE,playerUniverse:{},officialExposure:{}});
  buildModel(data);lastDataAt=Date.now();
 }catch{}
}

function nameMap(){
 const m=new Map();
 for(const p of model.pool||[]){const k=norm(p.name);if(k)m.set(k,p)}
 for(const p of globalThis.NUKE_PLAYER_CATALOG||[]){const k=norm(p.name);if(k&&!m.has(k))m.set(k,p)}
 return m;
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
    const text=clean(p.innerText),r=p.getBoundingClientRect();
    if(/\bADP\b/i.test(text)&&/\bProj\b/i.test(text)&&r.width>220&&r.width<1000){playerRoot=p;return p}
   }
  }
 }catch{}
 return null;
}

function findQueueHost(){
 if(visible(queueHost)){
  const r=queueHost.getBoundingClientRect(),cx=r.left+r.width/2;
  if(cx>innerWidth*.34&&cx<innerWidth*.76)return queueHost;
 }
 queueHost=null;
 try{
  // Anchor to the actual Queue CARD, not a player-detail Queue button/title.
  const snap=document.evaluate("//*[contains(normalize-space(text()),'Use the star button in the player list') or contains(normalize-space(text()),'Queued players will appear here')]",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  const hits=[];
  for(let i=0;i<snap.snapshotLength;i++){
   const node=snap.snapshotItem(i);if(!visible(node))continue;
   let p=node;
   for(let depth=0;depth<8&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect(),cx=r.left+r.width/2,text=clean(p.innerText);
    if(r.width<300||r.width>900||r.height<75||r.height>600||cx<innerWidth*.34||cx>innerWidth*.76)continue;
    const both=/Use the star button/i.test(text)&&/Queued players/i.test(text);
    hits.push({p,score:(both?-500:0)+r.height+Math.abs(cx-innerWidth*.58)});
   }
  }
  hits.sort((a,b)=>a.score-b.score);queueHost=hits[0]?.p||null;
  if(queueHost)return queueHost;

  // When the queue already has players, the empty-state copy can disappear.
  const titles=document.evaluate("//*[normalize-space(text())='Queue' or starts-with(normalize-space(text()),'Queue ')]",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  for(let i=0;i<titles.snapshotLength;i++){
   const label=titles.snapshotItem(i);if(!visible(label))continue;
   const lr=label.getBoundingClientRect(),lc=lr.left+lr.width/2;if(lc<innerWidth*.34||lc>innerWidth*.76)continue;
   let p=label.parentElement,best=null;
   for(let depth=0;depth<7&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect(),cx=r.left+r.width/2;if(r.width<300||r.width>900||r.height<70||r.height>600||cx<innerWidth*.34||cx>innerWidth*.76)continue;
    best=p;if(r.height>120)break;
   }
   if(best){queueHost=best;return best}
  }
 }catch{}
 return null;
}

function rosterRoot(){
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Pick position']",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  const hits=[];
  for(let i=0;i<snap.snapshotLength;i++){
   const label=snap.snapshotItem(i);if(!visible(label))continue;
   const lr=label.getBoundingClientRect(),lc=lr.left+lr.width/2;if(lc<innerWidth*.68)continue;
   let p=label.parentElement;
   for(let depth=0;depth<9&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect(),text=clean(p.innerText);
    if(r.width<250||r.width>650||r.height<220||r.height>850||r.left<innerWidth*.62)continue;
    if(/\bQB\b/.test(text)&&/\bRB\b/.test(text)&&/\bWR\b/.test(text)&&/\bTE\b/.test(text))hits.push({p,score:r.height+Math.abs(r.width-390)});
   }
  }
  hits.sort((a,b)=>a.score-b.score);return hits[0]?.p||null;
 }catch{return null}
}

function currentPicks(){
 const root=rosterRoot();if(!root)return [];
 const map=nameMap(),out=[],seen=new Set();
 for(const el of root.querySelectorAll('span,p,div')){
  if(el.childElementCount||!visible(el))continue;
  const p=map.get(norm(clean(el.textContent)));if(!p)continue;
  const k=norm(p.name);if(seen.has(k))continue;seen.add(k);
  out.push({name:p.name,pos:String(p.pos||p.position||'').toUpperCase(),team:String(p.teamAbbr||p.team||'').toUpperCase()});
 }
 return out;
}

function pairCount(a,b){return model.pairs.get([norm(a),norm(b)].sort().join('|'))||0}
function histNames(d){return [...new Set((d.players||[]).map(p=>norm(p.name)).filter(Boolean))]}
function duplicateState(picks){
 if(!picks.length||!model.history.length)return {best:0,matches:[],exact:false};
 let best={best:0,matches:[],exact:false};
 for(const d of model.history){
  const old=new Set(histNames(d)),matches=picks.filter(p=>old.has(norm(p.name))).map(p=>p.name);
  if(matches.length>best.best)best={best:matches.length,matches,exact:picks.length>=6&&matches.length===picks.length&&old.size===picks.length};
 }
 return best;
}
function duplicateCandidate(name,picks){
 let max=0;
 for(const d of model.history){const old=new Set(histNames(d));if(!old.has(norm(name)))continue;let n=1;for(const p of picks)if(old.has(norm(p.name)))n++;max=Math.max(max,n)}
 return {max,label:max>=6?'FULL DUPLICATE':max===5?'DUP PATH 5/6':max===4?'DUP PATH 4/6':''};
}

function posOf(name){const p=nameMap().get(norm(name));return String(p?.pos||p?.position||'').toUpperCase()}
function buildStyleStats(){
 const defs=[['1QB / 2RB / 2WR / 1TE',{QB:1,RB:2,WR:2,TE:1}],['1QB / 1RB / 3WR / 1TE',{QB:1,RB:1,WR:3,TE:1}],['1QB / 1RB / 2WR / 2TE',{QB:1,RB:1,WR:2,TE:2}]];
 const out=defs.map(([key,want])=>({key,want,count:0}));
 for(const d of model.history){const c={QB:0,RB:0,WR:0,TE:0};for(const p of (d.players||[])){const pos=String(p.pos||p.position||posOf(p.name)||'').toUpperCase();if(c[pos]!==undefined)c[pos]++}for(const x of out)if(Object.keys(x.want).every(k=>c[k]===x.want[k]))x.count++}
 return out;
}
function rosterState(picks){
 const counts={QB:0,RB:0,WR:0,TE:0};for(const p of picks)if(counts[p.pos]!==undefined)counts[p.pos]++;
 const qb=picks.find(p=>p.pos==='QB'),catchers=qb?picks.filter(p=>['WR','TE'].includes(p.pos)&&p.team===qb.team):[];
 let text='QB STACK · NOT STARTED',cls='open';
 if(qb){text=catchers.length?`${qb.team} STACK · ${qb.name} + ${catchers.map(x=>x.name).join(' + ')} ✓`:`${qb.team} STACK · ${qb.name} → NEED WR/TE`;cls=catchers.length?'complete':'need'}
 else {const teams=[...new Set(picks.filter(p=>['WR','TE'].includes(p.pos)).map(p=>p.team).filter(Boolean))];if(teams.length)text=`QB STACK · ${teams.join('/')} PASS CATCHER → QB AVAILABLE`}
 return {counts,text,cls,qb};
}

function visibleCandidates(picks){
 const root=findPlayerRoot();if(!root)return [];
 const map=nameMap(),seen=new Set(),out=[],picked=new Set(picks.map(p=>norm(p.name)));
 for(const el of root.querySelectorAll('span,p,div')){
  if(el.childElementCount||!visible(el))continue;
  const p=map.get(norm(clean(el.textContent)));if(!p)continue;
  const k=norm(p.name);if(seen.has(k)||picked.has(k))continue;seen.add(k);
  const pos=String(p.pos||p.position||'').toUpperCase();if(picks.some(x=>x.pos==='QB')&&pos==='QB')continue;
  const exposure=model.counts.get(k)||0,rels=picks.map(x=>({pick:x.name,count:pairCount(p.name,x.name)})).sort((a,b)=>b.count-a.count),covered=rels.filter(x=>x.count>0).length,sum=rels.reduce((s,x)=>s+x.count,0),dup=duplicateCandidate(p.name,picks);
  const sameTeamQB=picks.find(x=>x.pos==='QB'&&x.team&&x.team===String(p.teamAbbr||p.team||'').toUpperCase());
  const isCatcher=['WR','TE'].includes(pos)&&sameTeamQB;
  const score=sum*12+covered*10+(isCatcher?34:0)-Math.max(0,dup.max-3)*22-Math.round(exposure/(model.total||1)*10);
  out.push({name:p.name,pos,exposure,rels,covered,dup,score,tag:isCatcher?'QB STACK':''});
 }
 return out.sort((a,b)=>b.score-a.score||b.covered-a.covered||a.exposure-b.exposure||a.name.localeCompare(b.name)).slice(0,8);
}

function renderHtml(picks){
 const total=model.total;
 if(!picks.length){
  const top=[...model.pairs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([k,n])=>{
   const [a,b]=k.split('|'),ma=nameMap(),an=ma.get(a)?.name||a,bn=ma.get(b)?.name||b;
   return `<div class="nuke-combo-row"><span>${an} + ${bn}</span><b>${n}/${total} · ${total?Math.round(n/total*100):0}%</b></div>`;
  }).join('');
  return `<div class="nuke-combo-head"><b>NUKE · TOP COMBOS</b><span>${total} drafts</span></div>${top}`;
 }
 const state=rosterState(picks),dupe=duplicateState(picks),styles=buildStyleStats(),build=`QB ${state.counts.QB} · RB ${state.counts.RB} · WR ${state.counts.WR} · TE ${state.counts.TE}`;
 const candidates=visibleCandidates(picks).map(x=>{
  const pct=total?Math.round(x.exposure/total*100):0,rel=x.rels.filter(r=>r.count).slice(0,2).map(r=>`${r.pick} ${r.count}/${total}`).join(' · ')||'No prior combo with my picks';
  const stack=x.tag?`<em class="nuke-next-tag qb-stack">${x.tag}</em>`:'',dup=x.dup.label?`<em class="nuke-next-tag duplicate">${x.dup.label}</em>`:'';
  return `<div class="nuke-next-row"><div class="nuke-next-main"><b>${x.name}</b>${stack}${dup}<span>${rel}</span></div><div class="nuke-next-metrics"><div><b>${Math.max(0,Math.min(99,x.score))}</b><span>FIT</span></div><div><b>${x.covered}/${picks.length}</b><span>WITH</span></div><div><b>${pct}%</b><span>EXP</span></div></div></div>`;
 }).join('');
 return `<div class="nuke-combo-head"><b>NUKE · NEXT</b><span>${total} drafts</span></div>`+
  `<div class="nuke-roster-intel"><span>${build}</span><b class="${state.cls}">${state.text}</b></div>`+
  `<div class="nuke-duplicate ${dupe.exact?'danger':dupe.best>=4?'warn':'safe'}"><b>${dupe.exact?'⚠ FULL LINEUP DUPLICATE':dupe.best>=4?`DUPLICATE WATCH · ${dupe.best}/${picks.length}`:`UNIQUE BUILD · closest ${dupe.best}/${picks.length}`}</b><span>${dupe.matches.length?dupe.matches.join(' + '):'No matching prior core'}</span></div>`+
  `<div class="nuke-build-mix">${styles.map(s=>`<span><b>${s.key}</b><em>${s.count}/${total} · ${total?Math.round(s.count/total*100):0}%</em></span>`).join('')}</div>`+
  `<div class="nuke-next-picks">MY PICKS · ${picks.map(x=>x.name).join(' + ')}</div>${candidates}`;
}

function position(el,host){
 const r=host.getBoundingClientRect(),gap=10,edge=8,top=r.bottom+gap,available=Math.floor(innerHeight-edge-top);
 if(r.width<250||r.bottom<0||r.top>innerHeight||available<80){el.hidden=true;return false}
 el.style.left=Math.round(r.left)+'px';el.style.width=Math.round(r.width)+'px';el.style.top=Math.round(top)+'px';el.style.maxHeight=Math.min(330,available)+'px';el.hidden=false;return true;
}

async function sync(forceData=false){
 if(busy)return;busy=true;
 try{
  const el=dock();
  if(!isDraftPage()){el.hidden=true;return}
  // The live draft board intentionally has no player list. Never cover it.
  const players=findPlayerRoot();if(!players){el.hidden=true;queueHost=null;return}
  await refreshData(forceData);
  const host=findQueueHost();if(!host){el.hidden=true;return}
  const picks=currentPicks();
  el.innerHTML=renderHtml(picks);
  position(el,host);
 }finally{busy=false}
}

function burst(forceData=false){
 clearTimeout(timer);sync(forceData);
 for(const ms of [80,220,500,900])setTimeout(()=>sync(false),ms);
}

document.addEventListener('click',()=>burst(false),true);
document.addEventListener('pointerup',()=>burst(false),true);
window.addEventListener('resize',()=>burst(false),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)burst(true)});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.drafts||changes.exposureScope||changes.activePageScope||changes.playerUniverse||changes.officialExposure)){lastDataAt=0;burst(true)}});

sync(true);
setInterval(()=>sync(false),2000);
})();