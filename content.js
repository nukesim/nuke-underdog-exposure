(() => {
'use strict';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
let alive=true, scanTimer=null, captureTimer=null, scanBusy=false, cached={drafts:[],sport:'ALL',selected:'ALL',stats:null};

const safe=async fn=>{if(!alive)return null;try{return await fn()}catch(e){if(String(e).includes('Extension context invalidated'))alive=false;return null}};
const norm=s=>clean(s).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,'');
const tokens=s=>norm(s).split(' ').filter(Boolean);
const surnameKey=s=>{const a=tokens(s);if(!a.length)return '';return /^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1?a.at(-2):a.at(-1)};
const contestNorm=s=>clean(s).replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim();

function harvestStructured(root){
 const found=[];const seen=new WeakSet();
 const walk=(v,depth=0)=>{if(!v||depth>9)return;if(typeof v!=='object')return;if(seen.has(v))return;seen.add(v);
  if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}
  const contest=clean(v.tournament_name||v.contest_name||v.title||v.name||'');
  const sport=clean(v.sport_name||v.sport||v.sport_id||'').toUpperCase();
  const roster=v.players||v.roster||v.draft_picks||v.picks;
  const draftId=String(v.draft_id||v.draftId||v.entry_id||v.id||'');
  if(contest&&Array.isArray(roster)&&roster.length>=2){
   const players=roster.map(p=>({id:String(p?.player_id||p?.id||''),name:clean(p?.player_name||p?.name||p?.full_name||p?.appearance?.name||'')})).filter(p=>p.name);
   if(players.length>=2)found.push({draftId:draftId||[contest,...players.map(p=>norm(p.name)).sort()].join('|'),sport:sport||'UNKNOWN',format:'Daily Draft',contest:contestNorm(contest),players,sourceUrl:location.href,capturedAt:new Date().toISOString()});
  }
  for(const x of Object.values(v))walk(x,depth+1);
 };walk(root);return found
}
async function ingestStructured(data){
 const found=harvestStructured(data);if(!found.length)return;
 const current=(await safe(()=>chrome.storage.local.get({drafts:[]})))?.drafts||[];const byId=new Map(current.map(d=>[d.draftId,d]));
 for(const d of found)byId.set(d.draftId,d);const drafts=[...byId.values()];await safe(()=>chrome.storage.local.set({drafts}));cached.drafts=drafts;computeStats();scheduleRender(0)
}
window.addEventListener('message',e=>{if(e.source===window&&e.data?.source==='NUKE_UD_BRIDGE'&&e.data.data)ingestStructured(e.data.data)});
function computeStats(){
 const ds=cached.drafts.filter(d=>(cached.sport==='ALL'||(d.sport||'UNKNOWN')===cached.sport)&&(cached.selected==='ALL'||d.contest===cached.selected));
 const map=new Map();
 for(const d of ds) for(const p of new Set((d.players||[]).map(x=>norm(x.name)).filter(Boolean))) map.set(p,(map.get(p)||0)+1);
 const surname=new Map();
 for(const [name,count] of map){const key=surnameKey(name);if(!key)continue;const prev=surname.get(key);surname.set(key,prev===undefined?count:null)}
 cached.stats={total:ds.length,map,surname};
}
async function hydrate(){
 const x=await safe(()=>chrome.storage.local.get({drafts:[],exposureScope:null,lastSelectedSport:'ALL',lastSelectedContest:'ALL'})); if(!x)return;
 cached.drafts=x.drafts||[]; cached.sport=x.exposureScope?.sport||x.lastSelectedSport||'ALL'; cached.selected=x.exposureScope?.contest||x.lastSelectedContest||'ALL'; computeStats(); scheduleRender(0);
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
 const labels=[...document.querySelectorAll('*')].filter(el=>el.childElementCount===0&&/^Your teams?$/i.test(clean(el.textContent)));
 for(const label of labels){
  let box=label.parentElement;
  for(let depth=0;depth<10&&box;depth++,box=box.parentElement){
   const raw=(box.innerText||'').split('\n').map(clean).filter(Boolean);
   if(!raw.some(x=>/Projected$/i.test(x)))continue;
   const yi=raw.findIndex(x=>/^Your teams?$/i.test(x));
   if(yi<0)continue;
   const before=raw.slice(0,yi);
   const candidates=before.filter(x=>
    x.length>=3&&x.length<=80&&
    !x.includes(',')&&
    !/Projected|Entry|Entries|Prizes?|entry max|to first|Exposure|Email|Completed|Upcoming|Live/i.test(x)&&
    !/^\$/.test(x)&&!/^\d+(?:\.\d+)?$/.test(x)&&
    !/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}/.test(x)
   );
   if(candidates.length)return contestNorm(candidates[0]);
  }
 }
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
 await safe(()=>chrome.storage.local.set({drafts,exposureScope:{sport,contest}}));
 cached.drafts=drafts; computeStats();
}
function leafTextElements(){
 const root=document.querySelector('[class*="players" i]')||document.body;
 return [...root.querySelectorAll('span,div,p')].filter(el=>el.childElementCount===0&&el.offsetParent!==null);
}
function findPlayerRows(){
 const rows=[];const seen=new Set();
 for(const el of leafTextElements()){
  const name=clean(el.textContent);if(name.length<4||name.length>40||!/^[A-Za-zÀ-ÿ.' -]+$/.test(name))continue;
  let row=el;
  for(let i=0;i<4&&row;i++,row=row.parentElement){
   const t=clean(row.innerText);
   const playerLike=/\b(QB|RB|WR|TE|PG|SG|SF|PF|C|P|OF|LW|RW|G|F)\d*\b/i.test(t)&&(/\bvs\b|\s@\s/i.test(t));
   if(playerLike){
    const rect=row.getBoundingClientRect();if(rect.width<250||rect.height<35||rect.height>100)break;
    const key=norm(name)+'|'+Math.round(rect.top);if(!seen.has(key)){seen.add(key);rows.push({name,el,row})}break;
   }
  }
 }
 return rows;
}
function exposureCount(name,st){const k=norm(name);if(st.map.has(k))return st.map.get(k);const v=st.surname.get(surnameKey(name));return Number.isFinite(v)?v:0}
function badge(count,total){
 const b=document.createElement('span'); b.dataset.nukeExposure='1'; b.className='nuke-exposure-badge';
 b.textContent=total?`${Math.round(count/total*100)}% · ${count}/${total}`:'0% · 0/0'; b.title='NUKE exposure · '+cached.sport+' · '+cached.selected; return b;
}
function renderBadges(){
 if(!location.pathname.includes('/draft/'))return;
 const st=cached.stats;if(!st)return;
 const rows=findPlayerRows();
 for(const {name,el,row} of rows){
  const count=exposureCount(name,st);
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
 if(changes.lastSelectedSport)cached.sport=changes.lastSelectedSport.newValue||'ALL';
 if(changes.exposureScope)cached.sport=changes.exposureScope.newValue?.sport||'ALL';cached.selected=changes.exposureScope.newValue?.contest||'ALL';
 if(changes.lastSelectedContest&&!changes.exposureScope)cached.selected=changes.lastSelectedContest.newValue||'ALL';
 computeStats();scheduleRender(0);
});
chrome.runtime.onMessage.addListener((msg,sender,send)=>{
 if(msg?.type==='NUKE_FORCE_SCAN'){(async()=>{await captureCompleted();await hydrate();send({ok:true,total:cached.drafts.length})})();return true}
});
(async()=>{await hydrate();await captureCompleted();scheduleRender(0)})();
})();