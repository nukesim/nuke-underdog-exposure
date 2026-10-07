(()=>{
'use strict';
if(globalThis.__NUKE_COMBO_DOCK_V3__)return;
globalThis.__NUKE_COMBO_DOCK_V3__=true;

const Core=globalThis.NukeExposure;
if(!Core)return;
const NONE=Core.NONE||'__NO_TOURNAMENT__';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=Core.norm||((s)=>clean(s).toLowerCase());
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;
const isDraftPage=()=>/\/draft\//.test(location.pathname);
let model={total:0,counts:new Map(),pairs:new Map(),history:[],pool:[],scope:{sport:'NFL',contest:NONE}};
let lastDataAt=0,busy=false,playerRoot=null,rosterCache=null,burstId=0;

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
function canonicalPlayer(raw,d,pool){const r=Core.resolve({...raw,sport:raw?.sport||d?.sport},pool);return r?.name||raw?.name||''}
function buildModel(data){
 const drafts=(data.drafts||[]).filter(d=>d&&Array.isArray(d.players));
 const scope=chooseScope(data,drafts);
 const pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse||{},drafts,data.officialExposure||{});
 const history=Core.displayDrafts(drafts,pool).filter(d=>String(d.sport||'').toUpperCase()===scope.sport&&(scope.contest===NONE||d.contest===scope.contest));
 const counts=new Map(),pairs=new Map();
 for(const d of history){
  const names=[...new Set((d.players||[]).map(p=>canonicalPlayer(p,d,pool)).filter(Boolean))];
  for(const name of names){const k=norm(name);counts.set(k,(counts.get(k)||0)+1)}
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
   const k=[norm(names[i]),norm(names[j])].sort().join('|');pairs.set(k,(pairs.get(k)||0)+1);
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

// The queue changes its internal markup as soon as a player is queued. Anchor
// from the stable Queue heading/center column instead of the empty-queue copy.
function queueGeometry(){
 try{
  const snap=document.evaluate("//*[normalize-space(text())='Queue' or starts-with(normalize-space(text()),'Queue ')]",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  let title=null;
  for(let i=0;i<snap.snapshotLength;i++){
   const x=snap.snapshotItem(i);if(!visible(x))continue;
   const r=x.getBoundingClientRect(),cx=r.left+r.width/2;
   if(cx>innerWidth*.34&&cx<innerWidth*.76){title=x;break}
  }
  if(!title)return null;
  const tr=title.getBoundingClientRect();
  let col=null,p=title.parentElement;
  for(let depth=0;depth<8&&p&&p!==document.body;depth++,p=p.parentElement){
   const r=p.getBoundingClientRect(),cx=r.left+r.width/2;
   if(r.width>=300&&r.width<=900&&cx>innerWidth*.34&&cx<innerWidth*.76){
    if(!col||Math.abs(r.width-520)<Math.abs(col.getBoundingClientRect().width-520))col=p;
   }
  }
  const cr=(col||title.parentElement).getBoundingClientRect();
  let bottom=tr.bottom+105;
  const nodes=(col||title.parentElement).getElementsByTagName('*');
  const maxY=Math.min(innerHeight-8,tr.bottom+360);
  for(const el of nodes){
   if(!visible(el)||el.id==='nuke-combo-dock'||el.closest?.('#nuke-combo-dock'))continue;
   const r=el.getBoundingClientRect(),cx=r.left+r.width/2;
   if(cx<cr.left||cx>cr.right||r.top<tr.bottom-4||r.top>maxY||r.height>230||r.width<20)continue;
   bottom=Math.max(bottom,r.bottom);
  }
  bottom=Math.min(bottom,tr.bottom+330);
  return {left:cr.left,width:cr.width,bottom,titleTop:tr.top};
 }catch{return null}
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
    const r=p.getBoundingClientRect();
    if(r.width<240||r.width>680||r.height<170||r.height>900||r.left<innerWidth*.60)continue;
    const text=clean(p.innerText);
    const score=r.height+( /\bQB\b/.test(text)?80:0)+( /\bRB\b/.test(text)?80:0)+( /\bWR\b/.test(text)?80:0)+( /\bTE\b/.test(text)?80:0);
    if(score>bestScore){best=p;bestScore=score}
   }
  }
  rosterCache=best;return best;
 }catch{return null}
}
function currentPicks(){
 const root=rosterRoot();if(!root)return [];
 const map=nameMap(),out=[],seen=new Set();
 const nodes=[root,...root.getElementsByTagName('*')];
 for(const el of nodes){
  if(!visible(el))continue;
  const r=el.getBoundingClientRect();
  if(r.left<innerWidth*.62||r.top<300||r.height>80)continue;
  const raw=clean(el.textContent);if(!raw||raw.length>60)continue;
  const p=map.get(norm(raw));if(!p)continue;
  const k=norm(p.name);if(seen.has(k))continue;
  seen.add(k);
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
  const old=new Set(histNames(d));
  const matches=picks.filter(p=>old.has(norm(p.name))).map(p=>p.name);
  if(matches.length>best.best)best={best:matches.length,matches,exact:picks.length>=6&&matches.length===picks.length&&old.size===picks.length};
 }
 return best;
}
function duplicateCandidate(name,picks){
 let max=0;
 for(const d of model.history){
  const old=new Set(histNames(d));if(!old.has(norm(name)))continue;
  let n=1;for(const p of picks)if(old.has(norm(p.name)))n++;
  max=Math.max(max,n);
 }
 return {max,label:max>=6?'FULL DUPLICATE':max===5?'DUP PATH 5/6':max===4?'DUP PATH 4/6':max===3?'DUP PATH 3/6':''};
}
function posOf(name){const p=nameMap().get(norm(name));return String(p?.pos||p?.position||'').toUpperCase()}
function buildStyleStats(){
 const defs=[['1QB / 2RB / 2WR / 1TE',{QB:1,RB:2,WR:2,TE:1}],['1QB / 1RB / 3WR / 1TE',{QB:1,RB:1,WR:3,TE:1}],['1QB / 1RB / 2WR / 2TE',{QB:1,RB:1,WR:2,TE:2}]];
 const out=defs.map(([key,want])=>({key,want,count:0}));
 for(const d of model.history){
  const c={QB:0,RB:0,WR:0,TE:0};
  for(const p of (d.players||[])){const pos=String(p.pos||p.position||posOf(p.name)||'').toUpperCase();if(c[pos]!==undefined)c[pos]++}
  for(const x of out)if(Object.keys(x.want).every(k=>c[k]===x.want[k]))x.count++;
 }
 return out;
}
function rosterState(picks){
 const counts={QB:0,RB:0,WR:0,TE:0};for(const p of picks)if(counts[p.pos]!==undefined)counts[p.pos]++;
 const qb=picks.find(p=>p.pos==='QB'),catchers=qb?picks.filter(p=>['WR','TE'].includes(p.pos)&&p.team===qb.team):[];
 let text='QB STACK · NOT STARTED',cls='open';
 if(qb){text=catchers.length?`${qb.team} STACK · ${qb.name} + ${catchers.map(x=>x.name).join(' + ')} ✓`:`${qb.team} STACK · ${qb.name} → NEED WR/TE`;cls=catchers.length?'complete':'need'}
 else{const teams=[...new Set(picks.filter(p=>['WR','TE'].includes(p.pos)).map(p=>p.team).filter(Boolean))];if(teams.length)text=`QB STACK · ${teams.join('/')} PASS CATCHER → QB AVAILABLE`}
 return {counts,text,cls,qb};
}
function visibleCandidates(picks){
 const root=findPlayerRoot();if(!root)return [];
 const map=nameMap(),seen=new Set(),out=[],picked=new Set(picks.map(p=>norm(p.name)));
 for(const el of root.getElementsByTagName('*')){
  if(!visible(el)||el.children.length)continue;
  const p=map.get(norm(clean(el.textContent)));if(!p)continue;
  const k=norm(p.name);if(seen.has(k)||picked.has(k))continue;seen.add(k);
  const pos=String(p.pos||p.position||'').toUpperCase();if(picks.some(x=>x.pos==='QB')&&pos==='QB')continue;
  const exposure=model.counts.get(k)||0,rels=picks.map(x=>({pick:x.name,count:pairCount(p.name,x.name)})).sort((a,b)=>b.count-a.count),covered=rels.filter(x=>x.count>0).length,sum=rels.reduce((s,x)=>s+x.count,0),dup=duplicateCandidate(p.name,picks),team=String(p.teamAbbr||p.team||'').toUpperCase(),sameTeamQB=picks.find(x=>x.pos==='QB'&&x.team&&x.team===team),isCatcher=['WR','TE'].includes(pos)&&sameTeamQB,score=sum*12+covered*10+(isCatcher?34:0)-Math.max(0,dup.max-3)*22-Math.round(exposure/(model.total||1)*10);
  out.push({name:p.name,pos,exposure,rels,covered,dup,score,tag:isCatcher?'QB STACK':''});
 }
 return out.sort((a,b)=>b.score-a.score||b.covered-a.covered||a.exposure-b.exposure||a.name.localeCompare(b.name)).slice(0,8);
}
function renderHtml(picks){
 const total=model.total,map=nameMap();
 if(!picks.length){
  const top=[...model.pairs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([k,n])=>{const [a,b]=k.split('|'),an=map.get(a)?.name||a,bn=map.get(b)?.name||b;return `<div class="nuke-combo-row"><span>${an} + ${bn}</span><b>${n}/${total} · ${total?Math.round(n/total*100):0}%</b></div>`}).join('');
  return `<div class="nuke-combo-head"><b>NUKE · TOP COMBOS</b><span>${total} drafts</span></div>${top}`;
 }
 const state=rosterState(picks),dupe=duplicateState(picks),styles=buildStyleStats(),build=`QB ${state.counts.QB} · RB ${state.counts.RB} · WR ${state.counts.WR} · TE ${state.counts.TE}`;
 const candidates=visibleCandidates(picks).map(x=>{
  const pct=total?Math.round(x.exposure/total*100):0;
  const rel=x.rels.filter(r=>r.count).slice(0,2).map(r=>`${r.pick} ${r.count}/${total}`).join(' · ')||'No prior combo with my picks';
  const stack=x.tag?`<em class="nuke-next-tag qb-stack">${x.tag}</em>`:'';
  const dup=x.dup.label?`<em class="nuke-next-tag duplicate">${x.dup.label}</em>`:'';
  return `<div class="nuke-next-row"><div class="nuke-next-main"><b>${x.name}</b>${stack}${dup}<span>${rel}</span></div><div class="nuke-next-metrics"><div><b>${Math.max(0,Math.min(99,x.score))}</b><span>FIT</span></div><div><b>${x.covered}/${picks.length}</b><span>WITH</span></div><div><b>${pct}%</b><span>EXP</span></div></div></div>`;
 }).join('');
 const dupeLabel=dupe.exact?'⚠ FULL LINEUP DUPLICATE':dupe.best>=4?`DUPLICATE WATCH · ${dupe.best}/${picks.length}`:dupe.best>=2?`DUPE PATH · closest ${dupe.best}/${picks.length}`:`UNIQUE BUILD · closest ${dupe.best}/${picks.length}`;
 return `<div class="nuke-combo-head"><b>NUKE · NEXT</b><span>${total} drafts</span></div><div class="nuke-roster-intel"><span>${build}</span><b class="${state.cls}">${state.text}</b></div><div class="nuke-duplicate ${dupe.exact?'danger':dupe.best>=4?'warn':'safe'}"><b>${dupeLabel}</b><span>${dupe.matches.length?dupe.matches.join(' + '):'No matching prior core'}</span></div><div class="nuke-build-mix">${styles.map(s=>`<span><b>${s.key}</b><em>${s.count}/${total} · ${total?Math.round(s.count/total*100):0}%</em></span>`).join('')}</div><div class="nuke-next-picks">MY PICKS · ${picks.map(x=>x.name).join(' + ')}</div>${candidates}`;
}
function position(el,g){
 if(!g||g.width<250){el.hidden=true;return false}
 const gap=10,edge=8,top=Math.round(g.bottom+gap),available=Math.floor(innerHeight-edge-top);
 if(available<80){el.hidden=true;return false}
 el.style.left=Math.round(g.left)+'px';el.style.width=Math.round(g.width)+'px';el.style.top=top+'px';el.style.maxHeight=Math.min(330,available)+'px';el.hidden=false;return true;
}
async function sync(forceData=false){
 if(busy)return;busy=true;
 try{
  const el=dock();
  if(!isDraftPage()){el.hidden=true;return}
  const players=findPlayerRoot();
  // The live draft board replaces the player pool. Hide NUKE immediately there.
  if(!players){el.hidden=true;playerRoot=null;rosterCache=null;return}
  await refreshData(forceData);
  const g=queueGeometry();if(!g){el.hidden=true;return}
  const picks=currentPicks();
  el.innerHTML=renderHtml(picks);
  position(el,g);
 }finally{busy=false}
}
function burst(forceData=false){
 const id=++burstId;sync(forceData);
 for(const ms of [40,120,260,520])setTimeout(()=>{if(id===burstId)sync(false)},ms);
}

document.addEventListener('click',()=>burst(false),true);
window.addEventListener('resize',()=>burst(false),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)burst(true)});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.drafts||changes.exposureScope||changes.activePageScope||changes.playerUniverse||changes.officialExposure)){lastDataAt=0;burst(true)}});

sync(true);
setInterval(()=>sync(false),900);
})();
