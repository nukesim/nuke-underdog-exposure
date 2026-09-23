(() => {
'use strict';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
let alive=true, scanTimer=null, captureTimer=null, scanBusy=false, cached={drafts:[],sport:'ALL',selected:'ALL',stats:null};

const safe=async fn=>{if(!alive)return null;try{return await fn()}catch(e){if(String(e).includes('Extension context invalidated'))alive=false;return null}};
const norm=s=>clean(s).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,'');
const tokens=s=>norm(s).split(/\\s+/).filter(Boolean);
const contestNorm=s=>clean(s).replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim();

function computeStats(){
 const ds=cached.drafts.filter(d=>(cached.sport==='ALL'||(d.sport||'UNKNOWN')===cached.sport)&&(cached.selected==='ALL'||d.contest===cached.selected));
 const map=new Map();
 for(const d of ds) for(const p of new Set((d.players||[]).map(x=>norm(x.name)).filter(Boolean))) map.set(p,(map.get(p)||0)+1);
 cached.stats={total:ds.length,map};
}
async function hydrate(){
 const x=await safe(()=>chrome.storage.local.get({drafts:[],lastSelectedSport:'ALL',lastSelectedContest:'ALL'})); if(!x)return;
 cached.drafts=x.drafts||[]; cached.sport=x.lastSelectedSport||'ALL'; cached.selected=x.lastSelectedContest||'ALL'; computeStats(); scheduleRender(0);
}
function rosterStrings(){
 const out=[];
 for(const el of document.querySelectorAll('*')){
  if(el.children.length>8)continue;
  const lines=(el.innerText||'').split('\n').map(clean).filter(Boolean);
  for(let i=0;i<lines.length;i++)if(/^\d+(?:\.\d+)?\s*Projected$/i.test(lines[i])){
   const n=lines[i+1]||'';const ps=n.split(',').map(clean).filter(Boolean);
   if(ps.length>=2&&ps.length<=12)out.push(n);
  }
 }
 return [...new Set(out)];
}
function detectCompletedContest(){
 const projected=[...document.querySelectorAll('*')].find(el=>/^\d+(?:\.\d+)?\s*Projected$/i.test(clean(el.textContent)));
 if(projected){let box=projected;for(let i=0;i<12&&box;i++,box=box.parentElement){const lines=(box.innerText||'').split('\n').map(clean).filter(Boolean);const title=lines.find(x=>x.length>2&&x.length<90&&!/Projected|Entry|Prizes?|Your teams?|Completed|Upcoming|Live/i.test(x)&&!/^\$|^\d/.test(x));if(title)return contestNorm(title)}}
 return '';
}
function detectSport(){
 const text=' '+clean(document.body.innerText)+' ';
 const rules=[['NFL',/\bNFL\b|\bQB\b.*\bRB\b.*\bWR\b/i],['NBA',/\bNBA\b|\bPG\b.*\bSG\b.*\bSF\b/i],['MLB',/\bMLB\b|\bP\b.*\bOF\b/i],['NHL',/\bNHL\b|\bC\b.*\bLW\b.*\bRW\b/i],['PGA',/\bPGA\b|\bGOLF\b/i],['MMA',/\bMMA\b|\bUFC\b/i],['WNBA',/\bWNBA\b/i],['CFB',/\bCFB\b|COLLEGE FOOTBALL/i],['CBB',/\bCBB\b|COLLEGE BASKETBALL/i],['SOCCER',/\bSOCCER\b|\bEPL\b|\bMLS\b/i]];
 for(const [s,re] of rules)if(re.test(text))return s;return 'UNKNOWN';
}
async function captureCompleted(){
 if(!location.pathname.includes('/completed/'))return;
 const rosters=rosterStrings(); if(!rosters.length)return;
 const contest=detectCompletedContest(); if(!contest)return; const sport=detectSport();
 const current=(await safe(()=>chrome.storage.local.get({drafts:[]})))?.drafts||[];
 const byId=new Map(current.map(d=>[d.draftId,d]));
 for(const r of rosters){
  const players=r.split(',').map(clean).filter(Boolean).map(name=>({name}));
  if(players.length<2)continue;
  const draftId=[contest,...players.map(p=>norm(p.name)).sort()].join('|');
  byId.set(draftId,{draftId,sport,format:'Daily Draft',contest,players,sourceUrl:location.href,capturedAt:new Date().toISOString()});
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
function exposureCount(name,map){const k=norm(name);if(map.has(k))return map.get(k);const a=tokens(name);if(!a.length)return 0;let hits=[];for(const [stored,count] of map){const b=tokens(stored);const short=a.length<=b.length?a:b,long=a.length<=b.length?b:a;if(short.length&&short.every((x,i)=>x===long[long.length-short.length+i]))hits.push(count)}return hits.length===1?hits[0]:0}
function badge(count,total){
 const b=document.createElement('span'); b.dataset.nukeExposure='1'; b.className='nuke-exposure-badge';
 b.textContent=total?`${Math.round(count/total*100)}% · ${count}/${total}`:'0% · 0/0'; b.title='NUKE exposure · '+cached.sport+' · '+cached.selected; return b;
}
function renderBadges(){
 if(!location.pathname.includes('/draft/'))return;
 const st=cached.stats;if(!st)return;
 const rows=findPlayerRows();
 for(const {name,el,row} of rows){
  const count=exposureCount(name,st.map);
  let b=row.querySelector(':scope > [data-nuke-exposure]');
  if(!b){b=badge(count,st.total);row.appendChild(b)}
  else b.textContent=st.total?`${Math.round(count/st.total*100)}% · ${count}/${st.total}`:'0% · 0/0';
 }
}
function scheduleRender(ms=80){clearTimeout(scanTimer);scanTimer=setTimeout(()=>{if(!scanBusy){scanBusy=true;try{renderBadges()}finally{scanBusy=false}}},ms)}
const obs=new MutationObserver(m=>{if(!m.some(x=>[...x.addedNodes].some(n=>n.nodeType===1&&!n.closest?.('[data-nuke-exposure]'))))return;if(location.pathname.includes('/completed/')){clearTimeout(captureTimer);captureTimer=setTimeout(captureCompleted,350)}else scheduleRender()});
obs.observe(document.documentElement,{childList:true,subtree:true});

chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.drafts)cached.drafts=changes.drafts.newValue||[];
 if(changes.lastSelectedSport)cached.sport=changes.lastSelectedSport.newValue||'ALL';\n if(changes.exposureScope)cached.scope=changes.exposureScope.newValue||{sport:'ALL',contest:'ALL'};\n if(changes.lastSelectedContest&&!changes.exposureScope)cached.scope.contest=changes.lastSelectedContest.newValue||'ALL';
 computeStats();scheduleRender(0);
});
chrome.runtime.onMessage.addListener((msg,sender,send)=>{
 if(msg?.type==='NUKE_FORCE_SCAN'){(async()=>{await captureCompleted();await hydrate();send({ok:true,total:cached.drafts.length})})();return true}
});
(async()=>{await hydrate();await captureCompleted();scheduleRender(0)})();
})();