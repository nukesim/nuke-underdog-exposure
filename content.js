(() => {
'use strict';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
let alive=true, scanTimer=null, captureTimer=null, scanBusy=false, cached={drafts:[],sport:'ALL',selected:'ALL',stats:null};

const safe=async fn=>{if(!alive)return null;try{return await fn()}catch(e){if(String(e).includes('Extension context invalidated'))alive=false;return null}};
const norm=s=>clean(s).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,'');
const tokens=s=>norm(s).split(' ').filter(Boolean);
const aliasKeys=s=>{const a=tokens(s);if(!a.length)return [];const out=[norm(s)];if(a.length>1)out.push(a.slice(-2).join(' '));out.push(a.at(-1));if(/^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1){out.push(a.slice(-2).join(' '));out.push(a.at(-2))}return [...new Set(out)]};
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
 const pairs=new Map();
 for(const d of ds){const names=[...new Set((d.players||[]).map(x=>clean(x.name)).filter(Boolean))];for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const key=[names[i],names[j]].sort((a,b)=>a.localeCompare(b)).join(' + ');pairs.set(key,(pairs.get(key)||0)+1)}}
 cached.stats={total:ds.length,map,pairs};
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
function playerPoolRoot(){
 const labels=[...document.querySelectorAll('*')].filter(el=>el.childElementCount===0&&/^Players$/i.test(clean(el.textContent))&&el.offsetParent!==null);
 for(const label of labels){let p=label.parentElement;for(let i=0;i<6&&p;i++,p=p.parentElement){const t=clean(p.innerText);if(/\bADP\b/i.test(t)&&/\bProj\b/i.test(t)&&p.getBoundingClientRect().width<900)return p}}
 return null;
}
function findPlayerRows(){
 const root=playerPoolRoot();if(!root)return [];
 const rows=[];const seen=new Set();
 for(const el of root.querySelectorAll('span,div,p')){
  if(el.childElementCount||el.offsetParent===null)continue;
  const name=clean(el.textContent);if(name.length<4||name.length>40||!/^[A-Za-zÀ-ÿ.' -]+$/.test(name))continue;
  let row=el;
  for(let i=0;i<4&&row&&root.contains(row);i++,row=row.parentElement){
   const t=clean(row.innerText),rect=row.getBoundingClientRect();
   const playerLike=/\b(QB|RB|WR|TE|PG|SG|SF|PF|C|P|OF|LW|RW|G|F)\d*\b/i.test(t)&&(/\bvs\b|\s@\s/i.test(t))&&/\d+(?:\.\d+)?/.test(t);
   if(playerLike&&rect.width>300&&rect.height>=35&&rect.height<=85){const key=norm(name)+'|'+Math.round(rect.top);if(!seen.has(key)){seen.add(key);rows.push({name,el,row})}break}
  }
 }
 return rows;
}
function nflRowMeta(row){
 const t=clean(row.innerText);
 const pos=t.match(/\b(QB|RB|WR|TE)\d*\b/i)?.[1]?.toUpperCase()||'';
 const game=t.match(/\b([A-Z]{2,3})\s+(?:vs|@)\s+([A-Z]{2,3})\b/i);
 return {pos,team:game?.[1]?.toUpperCase()||'',opp:game?.[2]?.toUpperCase()||''};
}
function draftedNFL(){
 const root=playerPoolRoot(),out=[],seen=new Set();
 // Find the FULL roster panel, not a nested QB/RB/WR/TE subsection. Nested
 // sections were causing NUKE NEXT to see only the currently visible position(s).
 const boxes=[...document.querySelectorAll('div')].filter(el=>{
  if(el.offsetParent===null||root?.contains(el))return false;
  const r=el.getBoundingClientRect(),t=el.innerText||'';
  if(r.left<innerWidth*.68||r.width<240||r.width>520||r.height<180)return false;
  const games=t.match(/\b[A-Z]{2,3}\s+(?:vs|@)\s+[A-Z]{2,3}\b/gi)||[];
  return games.length>0&&/\b(QB|RB|WR|TE)\b/.test(t);
 }).map(el=>{
  const t=el.innerText||'';
  const games=(t.match(/\b[A-Z]{2,3}\s+(?:vs|@)\s+[A-Z]{2,3}\b/gi)||[]).length;
  const heads=(t.match(/(?:^|\n)(QB|RB|WR|TE)(?:\n|$)/g)||[]).length;
  return {el,score:games*20+heads*5+Math.min(10,(el.innerText||'').split('\n').length/10)};
 }).sort((a,b)=>b.score-a.score||b.el.getBoundingClientRect().height-a.el.getBoundingClientRect().height);
 const box=boxes[0]?.el;if(!box)return out;
 const lines=(box.innerText||'').split('\n').map(clean).filter(Boolean);
 let pos='';
 for(let i=0;i<lines.length;i++){
  if(/^(QB|RB|WR|TE)$/i.test(lines[i])){pos=lines[i].toUpperCase();continue}
  const m=lines[i].match(/^([A-Z]{2,3})\s+(?:vs|@)\s+([A-Z]{2,3})$/i);if(!m||!pos)continue;
  let name='';
  for(let j=i-1;j>=Math.max(0,i-5);j--){
   const x=lines[j];
   if(/^(QB|RB|WR|TE)$/i.test(x))break;
   if(x.length>=4&&x.length<=45&&/^[A-Za-zÀ-ÿ.' -]+$/.test(x)&&!/^(ADP|Pick|Projected)$/i.test(x)){name=x;break}
  }
  if(!name)continue;
  const item={pos,team:m[1].toUpperCase(),opp:m[2].toUpperCase(),name};
  const key=pos+'|'+item.team+'|'+norm(name);if(!seen.has(key)){seen.add(key);out.push(item)}
 }
 return out;
}
function correlationTag(meta,drafted){
 const qbs=new Set(drafted.filter(x=>x.pos==='QB').map(x=>x.team));
 const qbOpps=new Set(drafted.filter(x=>x.pos==='QB').map(x=>x.opp));
 const passCatchTeams=new Set(drafted.filter(x=>['WR','TE'].includes(x.pos)).map(x=>x.team));
 const teams=new Set(drafted.map(x=>x.team));
 // Forward stack: after drafting a QB, visually prioritize his WR/TE.
 if(['WR','TE'].includes(meta.pos)&&qbs.has(meta.team))return {kind:'qb-stack',text:'QB STACK'};
 // Reverse stack: after drafting a WR/TE, visually prioritize that team's QB.
 if(meta.pos==='QB'&&passCatchTeams.has(meta.team))return {kind:'qb-stack',text:'STACK QB'};
 if(qbOpps.has(meta.team)&&['WR','TE','RB'].includes(meta.pos))return {kind:'bringback',text:'BRING-BACK'};
 if(teams.has(meta.team)&&!qbs.has(meta.team)&&['WR','TE','RB'].includes(meta.pos))return {kind:'same-team',text:'SAME TEAM'};
 return null;
}
function exposureCount(name,st){for(const key of aliasKeys(name))if(st.map.has(key))return st.map.get(key);return 0}
function exposureTier(count,total,maxCount){
 const pct=total?count/total:0, rel=maxCount?count/maxCount:0;
 if(count>0&&rel>=.75)return 'nuke-exposure-green';
 if(count>0&&rel>=.50)return 'nuke-exposure-yellow';
 if(count>0&&rel>=.25)return 'nuke-exposure-orange';
 return 'nuke-exposure-red';
}
function badge(count,total,maxCount){
 const b=document.createElement('span'); b.dataset.nukeExposure='1'; b.className='nuke-exposure-badge '+exposureTier(count,total,maxCount);
 b.textContent=total?`${Math.round(count/total*100)}% · ${count}/${total}`:'0% · 0/0'; b.title='NUKE exposure · '+cached.sport+' · '+cached.selected; return b;
}
function renderBadges(){
 if(!location.pathname.includes('/draft/'))return;
 const st=cached.stats;if(!st)return;
 document.querySelectorAll('[data-nuke-exposure],[data-nuke-correlation]').forEach(b=>b.remove()); document.querySelectorAll('.nuke-qb-stack,.nuke-bringback,.nuke-same-team').forEach(el=>el.classList.remove('nuke-qb-stack','nuke-bringback','nuke-same-team')); document.querySelectorAll('[data-nuke-stack]').forEach(el=>{el.classList.remove('nuke-stack-row');delete el.dataset.nukeStack});
 const rows=findPlayerRows();
 const drafted=cached.sport==='NFL'?draftedNFL():[];
 const counts=rows.map(({name})=>exposureCount(name,st));
 const maxCount=Math.max(0,...counts);
 for(let i=0;i<rows.length;i++){
  const {name,el,row}=rows[i];
  const count=counts[i];
  const b=badge(count,st.total,maxCount);
  b.style.marginLeft='5px';
  b.style.position='static';
  b.style.width='auto';
  b.style.height='auto';
  b.style.flex='0 0 auto';
  // Keep exposure on the player-name line instead of between name and team/game metadata.
  // Attach immediately after the leaf name node so Underdog's second line stays untouched.
  el.insertAdjacentElement('afterend',b);
  if(cached.sport==='NFL'){const tag=correlationTag(nflRowMeta(row),drafted);if(tag){const cls=tag.kind==='qb-stack'?'nuke-qb-stack':tag.kind==='bringback'?'nuke-bringback':'nuke-same-team';el.classList.add(cls);if(tag.kind==='qb-stack'){row.classList.add('nuke-stack-row');row.dataset.nukeStack='1'}el.title=tag.text+' · NUKE stacking correlation'}}
 }
}
function draftedNames(){return [...new Set(draftedNFL().map(x=>x.name).filter(Boolean))]}
function namesMatch(a,b){
 const ak=aliasKeys(a),bk=aliasKeys(b);
 return ak.some(x=>bk.includes(x))||bk.some(x=>ak.includes(x));
}
function pairCount(a,b){
 if(!cached.stats?.pairs)return 0;
 for(const [key,n] of cached.stats.pairs){
  const parts=key.split(' + ');
  if(parts.length===2&&((namesMatch(a,parts[0])&&namesMatch(b,parts[1]))||(namesMatch(a,parts[1])&&namesMatch(b,parts[0]))))return n;
 }
 return 0;
}
function rosterState(drafted){
 const counts={QB:0,RB:0,WR:0,TE:0};for(const p of drafted)if(counts[p.pos]!==undefined)counts[p.pos]++;
 const qb=drafted.find(p=>p.pos==='QB')||null;
 const qbCatches=qb?drafted.filter(p=>['WR','TE'].includes(p.pos)&&p.team===qb.team):[];
 const reverseTeams=[...new Set(drafted.filter(p=>['WR','TE'].includes(p.pos)).map(p=>p.team))];
 let stackText='QB STACK · NOT STARTED',stackClass='open';
 if(qb){stackText=qbCatches.length?qb.team+' STACK · '+qb.name+' + '+qbCatches.map(p=>p.name).join(' + ')+' ✓':qb.team+' STACK · '+qb.name+' → NEED WR/TE';stackClass=qbCatches.length?'complete':'need'}
 else if(reverseTeams.length) stackText='QB STACK · '+reverseTeams.join('/')+' PASS CATCHER → QB AVAILABLE';
 return {counts,qb,qbCatches,reverseTeams,stackText,stackClass};
}
function positionNeed(meta,state){
 const total=Object.values(state.counts).reduce((a,b)=>a+b,0);
 if(meta.pos==='QB')return state.counts.QB?0:(total>=3?14:8);
 if(meta.pos==='WR')return state.counts.WR<2?10:state.counts.WR<3?5:0;
 if(meta.pos==='TE')return state.counts.TE<1?8:2;
 if(meta.pos==='RB')return state.counts.RB<2?7:state.counts.RB<3?2:-3;
 return 0;
}
function candidateSignals(name,meta,drafted,total,state){
 const allRels=drafted.map(p=>({pick:p.name,count:pairCount(name,p.name)})).sort((a,b)=>b.count-a.count);
 const rels=allRels.filter(x=>x.count>0),exposure=exposureCount(name,cached.stats),tag=correlationTag(meta,drafted);
 const covered=rels.length,sum=rels.reduce((s,x)=>s+x.count,0),best=rels[0]?.count||0,pickCount=Math.max(1,drafted.length);
 const avgPairRate=total?sum/(total*pickCount):0,coverageRate=covered/pickCount;
 // Correlation and actual roster need now lead the score; historical pairing remains useful
 // but cannot bury an obvious QB-stack requirement.
 const corrBonus=tag?.kind==='qb-stack'?34:tag?.kind==='bringback'?12:tag?.kind==='same-team'?3:0;
 const needBonus=positionNeed(meta,state);
 const fit=Math.min(100,Math.max(0,Math.round(avgPairRate*48+coverageRate*20+corrBonus+needBonus)));
 return {name,meta,rels,allRels,exposure,total,tag,covered,sum,best,fit,needBonus};
}
function availableCandidates(){
 const drafted=draftedNFL(),state=rosterState(drafted),hasQB=!!state.qb;
 return findPlayerRows().map(({name,row})=>candidateSignals(name,nflRowMeta(row),drafted,cached.stats?.total||0,state))
  .filter(x=>!drafted.some(p=>namesMatch(p.name,x.name)))
  .filter(x=>!(hasQB&&x.meta.pos==='QB'));
}
function renderComboPanel(){
 if(!location.pathname.includes('/draft/')||!cached.stats)return;
 let panel=document.getElementById('nuke-combo-panel');
 const queueTitle=[...document.querySelectorAll('*')].find(el=>el.childElementCount===0&&/^Queue(?:\s*\d+)?$/i.test(clean(el.textContent))&&el.offsetParent!==null);
 if(!queueTitle)return;
 let host=queueTitle.parentElement;for(let i=0;i<3&&host;i++){const r=host.getBoundingClientRect();if(r.width>350&&r.width<800)break;host=host.parentElement}
 if(!host)return;if(!panel){panel=document.createElement('section');panel.id='nuke-combo-panel';host.insertAdjacentElement('afterend',panel)}
 const total=cached.stats.total||0,drafted=draftedNFL();
 if(!drafted.length){
  const top=[...cached.stats.pairs.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8);
  panel.innerHTML='<div class="nuke-combo-head"><b>NUKE · TOP COMBOS</b><span>'+total+' drafts</span></div>'+top.map(([k,n])=>'<div class="nuke-combo-row"><span>'+k+'</span><b>'+n+'/'+total+' · '+(total?Math.round(n/total*100):0)+'%</b></div>').join('');
  return;
 }
 const state=rosterState(drafted);
 const candidates=availableCandidates().sort((a,b)=>b.fit-a.fit||b.covered-a.covered||b.sum-a.sum||b.best-a.best||a.exposure-b.exposure||a.name.localeCompare(b.name)).slice(0,10);
 const picked=drafted.map(x=>x.name).join(' + ');
 const build='QB '+state.counts.QB+' · RB '+state.counts.RB+' · WR '+state.counts.WR+' · TE '+state.counts.TE;
 panel.innerHTML='<div class="nuke-combo-head"><b>NUKE · NEXT</b><span>'+total+' drafts</span></div>'+
  '<div class="nuke-roster-intel"><span>'+build+'</span><b class="'+state.stackClass+'">'+state.stackText+'</b></div>'+
  '<div class="nuke-next-picks">MY PICKS · '+picked+'</div>'+
  candidates.map(x=>{
   const pct=total?Math.round(x.exposure/total*100):0,rel=x.rels.slice(0,2).map(r=>r.pick+' '+r.count+'/'+total).join(' · ');
   const corr=x.tag?'<em class="nuke-next-tag '+x.tag.kind+'">'+x.tag.text+'</em>':'',relationship=rel||'No prior combo with my picks';
   return '<div class="nuke-next-row"><div class="nuke-next-main"><b>'+x.name+'</b>'+corr+'<span>'+relationship+'</span></div>'+
    '<div class="nuke-next-metrics"><div><b>'+x.fit+'</b><span>FIT</span></div><div><b>'+x.covered+'/'+drafted.length+'</b><span>WITH</span></div><div><b>'+pct+'%</b><span>EXP</span></div></div></div>';
  }).join('')+(candidates.length?'':'<div class="nuke-combo-empty">No available players detected.</div>');
}
function scheduleRender(ms=80){clearTimeout(scanTimer);scanTimer=setTimeout(()=>{if(!scanBusy){scanBusy=true;try{renderBadges();renderComboPanel()}finally{scanBusy=false}}},ms)}
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