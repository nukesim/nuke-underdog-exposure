(() => {
'use strict';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
let alive=true, scanTimer=null, scanBusy=false, cached={drafts:[],selected:'',stats:null};

const safe=async fn=>{if(!alive)return null;try{return await fn()}catch(e){if(String(e).includes('Extension context invalidated'))alive=false;return null}};
const norm=s=>clean(s).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,'');
const contestNorm=s=>clean(s).replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim();

function computeStats(){
 const ds=cached.drafts.filter(d=>cached.selected==='ALL'||d.contest===cached.selected);
 const map=new Map();
 for(const d of ds) for(const p of new Set((d.players||[]).map(x=>norm(x.name)).filter(Boolean))) map.set(p,(map.get(p)||0)+1);
 cached.stats={total:ds.length,map};
}
async function hydrate(){
 const x=await safe(()=>chrome.storage.local.get({drafts:[],lastSelectedContest:'ALL'})); if(!x)return;
 cached.drafts=x.drafts||[]; cached.selected=x.lastSelectedContest||'ALL'; computeStats(); scheduleRender(0);
}
function rosterStrings(){
 const out=[];
 for(const el of document.querySelectorAll('*')){
  if(el.children.length>4)continue;
  const lines=(el.innerText||'').split('\n').map(clean).filter(Boolean);
  for(let i=0;i<lines.length;i++) if(/^\d+(?:\.\d+)?\s*Projected$/i.test(lines[i])){
   const n=lines[i+1]||''; if((n.match(/,/g)||[]).length===5)out.push(n);
  }
 }
 return [...new Set(out)];
}
function detectCompletedContest(){
 const text=document.body.innerText||'';
 const known=[...new Set(cached.drafts.map(d=>d.contest).filter(Boolean))];
 for(const k of known) if(text.includes(k)) return k;
 const m=text.match(/Battle Royale\s*-\s*Week\s*\d+|The Hurry Up|Prime Time Da Bomb|The PTP Playbook/i);
 return m?contestNorm(m[0]):'';
}
async function captureCompleted(){
 if(!location.pathname.includes('/completed/'))return;
 const rosters=rosterStrings(); if(!rosters.length)return;
 const contest=detectCompletedContest(); if(!contest)return;
 const current=(await safe(()=>chrome.storage.local.get({drafts:[]})))?.drafts||[];
 const byId=new Map(current.map(d=>[d.draftId,d]));
 for(const r of rosters){
  const players=r.split(',').map(clean).filter(Boolean).slice(0,6).map(name=>({name}));
  if(players.length!==6)continue;
  const draftId=[contest,...players.map(p=>norm(p.name)).sort()].join('|');
  byId.set(draftId,{draftId,sport:'NFL',format:'Daily Draft',contest,players,sourceUrl:location.href,capturedAt:new Date().toISOString()});
 }
 const drafts=[...byId.values()];
 await safe(()=>chrome.storage.local.set({drafts}));
 cached.drafts=drafts; computeStats();
}
function leafTextElements(){
 const root=document.querySelector('[class*="players" i]')||document.body;
 return [...root.querySelectorAll('span,div,p')].filter(el=>el.childElementCount===0&&el.offsetParent!==null);
}
function findPlayerRows(){
 const rows=[]; const seen=new Set();
 for(const el of leafTextElements()){
  const name=clean(el.textContent); if(name.length<4||name.length>32||!/^[A-Za-zÀ-ÿ.' -]+$/.test(name))continue;
  let row=el;
  for(let i=0;i<5&&row;i++,row=row.parentElement){
   const t=clean(row.innerText);
   if(/\b(QB|RB|WR|TE)\d?\b/.test(t)&&(/\bvs\b/i.test(t)||/\s@\s/.test(t))&&(/ADP/i.test(t)||/Proj/i.test(t)||/\d+\.\d+/.test(t))){
    const key=norm(name)+'|'+Math.round(row.getBoundingClientRect().top);
    if(!seen.has(key)){seen.add(key);rows.push({name,el,row})} break;
   }
  }
 }
 return rows;
}
function badge(count,total){
 const b=document.createElement('span'); b.dataset.nukeExposure='1'; b.className='nuke-exposure-badge';
 b.textContent=total?`${Math.round(count/total*100)}% · ${count}/${total}`:'0% · 0/0'; b.title='NUKE exposure for '+cached.selected; return b;
}
function renderBadges(){
 if(!location.pathname.includes('/draft/'))return;
 const st=cached.stats;if(!st)return;
 const rows=findPlayerRows();
 for(const {name,el,row} of rows){
  const key=norm(name),count=st.map.get(key)||0;
  let b=row.querySelector(':scope > [data-nuke-exposure]');
  if(!b){b=badge(count,st.total);row.appendChild(b)}
  else b.textContent=st.total?`${Math.round(count/st.total*100)}% · ${count}/${st.total}`:'0% · 0/0';
 }
}
function scheduleRender(ms=80){clearTimeout(scanTimer);scanTimer=setTimeout(()=>{if(!scanBusy){scanBusy=true;try{renderBadges()}finally{scanBusy=false}}},ms)}
const obs=new MutationObserver(m=>{if(m.some(x=>[...x.addedNodes].some(n=>n.nodeType===1&&!n.closest?.('[data-nuke-exposure]'))))scheduleRender()});
obs.observe(document.documentElement,{childList:true,subtree:true});

chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.drafts)cached.drafts=changes.drafts.newValue||[];
 if(changes.lastSelectedContest)cached.selected=changes.lastSelectedContest.newValue||'ALL';
 computeStats();scheduleRender(0);
});
chrome.runtime.onMessage.addListener((msg,sender,send)=>{
 if(msg?.type==='NUKE_FORCE_SCAN'){(async()=>{await captureCompleted();await hydrate();send({ok:true,total:cached.drafts.length})})();return true}
});
(async()=>{await hydrate();await captureCompleted();scheduleRender(0)})();
})();