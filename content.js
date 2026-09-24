(() => {
'use strict';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
let alive=true, scanTimer=null, captureTimer=null, scanBusy=false, cached={drafts:[],sport:'ALL',selected:'ALL',stats:null,officialExposure:{},playerUniverse:{},entryTotals:{}};

const safe=async fn=>{if(!alive)return null;try{return await fn()}catch(e){if(String(e).includes('Extension context invalidated'))alive=false;return null}};
const norm=s=>clean(s).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,'');
const tokens=s=>norm(s).split(' ').filter(Boolean);
const aliasKeys=s=>{const a=tokens(s);if(!a.length)return [];const out=[norm(s)];if(a.length>1)out.push(a.slice(-2).join(' '));out.push(a.at(-1));if(/^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1){out.push(a.slice(-2).join(' '));out.push(a.at(-2))}return [...new Set(out)]};

const contestNorm=s=>clean(s).replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim();
const entryTotalKey=(sport,contest)=>norm(sport||'UNKNOWN')+'::'+norm(contestNorm(contest||''));
const wildcardEntryTotalKey=contest=>'*::'+norm(contestNorm(contest||''));
const officialStorageKey=(name,sport,contest)=>entryTotalKey(sport,contest)+'::'+norm(name);

function nameMatchStrength(a,b){
 const na=norm(a),nb=norm(b);if(!na||!nb)return 0;if(na===nb)return 4;
 const at=tokens(a),bt=tokens(b);
 if(at.length<bt.length&&aliasKeys(b).includes(na))return at.length===1?1:2;
 if(bt.length<at.length&&aliasKeys(a).includes(nb))return bt.length===1?1:2;
 return 0;
}
function rosterMatch(aPlayers,bPlayers){
 const a=aPlayers||[],b=bPlayers||[];if(a.length!==b.length||!a.length)return {ok:false,score:0,mapping:[]};
 const choices=a.map((p,i)=>({i,c:b.map((q,j)=>({j,s:nameMatchStrength(p?.name,q?.name)})).filter(x=>x.s>0).sort((x,y)=>y.s-x.s)}));
 if(choices.some(x=>!x.c.length))return {ok:false,score:0,mapping:[]};
 choices.sort((x,y)=>x.c.length-y.c.length);
 let bestScore=-1,bestMap=null;const used=new Set(),map=Array(a.length).fill(-1);
 const walk=(k,score)=>{
  if(k===choices.length){if(score>bestScore){bestScore=score;bestMap=[...map]}return}
  const item=choices[k];
  for(const ch of item.c){if(used.has(ch.j))continue;used.add(ch.j);map[item.i]=ch.j;walk(k+1,score+ch.s);used.delete(ch.j);map[item.i]=-1}
 };
 walk(0,0);
 return bestMap?{ok:true,score:bestScore,mapping:bestMap}:{ok:false,score:0,mapping:[]};
}
function isSyntheticDraft(d){
 const id=String(d?.draftId||'');
 return !id||id.startsWith('dom|')||id.includes('|')||d?.source==='completed-dom'||d?.source==='legacy-dom';
}
function draftQuality(d){
 const players=d?.players||[];
 return (isSyntheticDraft(d)?0:1000)+(d?.source==='structured-api'?200:0)+players.filter(p=>p?.id).length*10+players.filter(p=>tokens(p?.name).length>=2).length*2;
}
function targetForScope(sport,contest,entryTotals=cached.entryTotals){
 return Number(entryTotals?.[entryTotalKey(sport,contest)]||entryTotals?.[wildcardEntryTotalKey(contest)]||0);
}
function repairStoredDrafts(drafts,entryTotals=cached.entryTotals){
 const exact=[],byId=new Map();
 for(const d of drafts||[]){
  const id=String(d?.draftId||'');
  if(id&&byId.has(id)){
   const i=byId.get(id);if(draftQuality(d)>draftQuality(exact[i]))exact[i]=d;
  }else{if(id)byId.set(id,exact.length);exact.push(d)}
 }
 const groups=new Map();
 for(const d of exact){const k=entryTotalKey(d?.sport||'UNKNOWN',d?.contest||'');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d)}
 const repaired=[];
 for(const arr0 of groups.values()){
  const arr=[...arr0],sample=arr[0]||{},target=targetForScope(sample.sport||'UNKNOWN',sample.contest||'',entryTotals);
  while(target>0&&arr.length>target){
   let best=null;
   for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
    if(!isSyntheticDraft(arr[i])&&!isSyntheticDraft(arr[j]))continue;
    const m=rosterMatch(arr[i].players,arr[j].players);if(!m.ok)continue;
    const stableBonus=(!isSyntheticDraft(arr[i])||!isSyntheticDraft(arr[j]))?1000:0;
    const exactNames=(arr[i].players||[]).map(p=>norm(p.name)).sort().join('|')===(arr[j].players||[]).map(p=>norm(p.name)).sort().join('|')?200:0;
    const score=stableBonus+exactNames+m.score*10;
    let remove=j;
    if(!isSyntheticDraft(arr[i])&&isSyntheticDraft(arr[j]))remove=j;
    else if(isSyntheticDraft(arr[i])&&!isSyntheticDraft(arr[j]))remove=i;
    else if(draftQuality(arr[i])<draftQuality(arr[j]))remove=i;
    if(!best||score>best.score)best={score,remove};
   }
   if(!best)break;
   arr.splice(best.remove,1);
  }
  repaired.push(...arr);
 }
 return repaired;
}
function knownFullNames(drafts=cached.drafts,official=cached.officialExposure,universe=null){
 const out=new Map(),add=n=>{n=clean(n);if(tokens(n).length>=2)out.set(norm(n),n)};
 for(const d of drafts||[])for(const p of (d.players||[]))add(p?.name);
 for(const o of Object.values(official||{}))add(o?.name);
 for(const u of Object.values(universe||{}))add(u?.name);
 return [...out.values()];
}
function canonicalDisplayName(raw,drafts=cached.drafts,official=cached.officialExposure,universe=null){
 raw=clean(raw);if(!raw||tokens(raw).length>=2)return raw;
 const matches=knownFullNames(drafts,official,universe).filter(full=>nameMatchStrength(raw,full)>0);
 return matches.length===1?matches[0]:raw;
}
function enrichDraftNames(drafts,official=cached.officialExposure){
 let out=(drafts||[]).map(d=>({...d,players:(d.players||[]).map(p=>({...p}))}));
 const stableByScope=new Map();
 out.forEach((d,i)=>{if(isSyntheticDraft(d))return;const k=entryTotalKey(d.sport||'UNKNOWN',d.contest||'');if(!stableByScope.has(k))stableByScope.set(k,[]);stableByScope.get(k).push({i,d})});
 out=out.map(d=>{
  if(!isSyntheticDraft(d))return d;
  const stable=stableByScope.get(entryTotalKey(d.sport||'UNKNOWN',d.contest||''))||[];
  const matches=stable.map(x=>({x,m:rosterMatch(d.players,x.d.players)})).filter(x=>x.m.ok);
  if(matches.length!==1)return d;
  const ref=matches[0].x.d,m=matches[0].m;
  return {...d,players:(d.players||[]).map((p,i)=>{
   const rp=(ref.players||[])[m.mapping[i]]||{};
   if(tokens(rp.name).length>tokens(p.name).length)return {...p,...rp,name:clean(rp.name)};
   return p;
  })};
 });
 const pool=knownFullNames(out,official,null);
 return out.map(d=>({...d,players:(d.players||[]).map(p=>{
  if(tokens(p.name).length>=2)return p;
  const matches=pool.filter(full=>nameMatchStrength(p.name,full)>0);
  return matches.length===1?{...p,name:matches[0]}:p;
 })}));
}
function officialForName(name,total){
 const full=norm(name);if(!full)return null;
 const hits=Object.values(cached.officialExposure||{}).filter(o=>{
  if(!o||norm(o.name)!==full||Number(o.total||0)!==Number(total||0))return false;
  if(o.contest&&cached.selected!=='ALL'&&contestNorm(o.contest)!==contestNorm(cached.selected))return false;
  if(o.sport&&cached.sport!=='ALL'&&String(o.sport).toUpperCase()!==String(cached.sport).toUpperCase())return false;
  return true;
 }).sort((a,b)=>Number(b.capturedAt||0)-Number(a.capturedAt||0));
 return hits[0]||null;
}

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
function harvestOfficialExposureStructured(root){
 const out=[];const seen=new WeakSet();
 const walk=(v,depth=0,totalHint=0)=>{
  if(!v||depth>10||typeof v!=='object')return;
  if(seen.has(v))return;seen.add(v);
  if(Array.isArray(v)){for(const x of v)walk(x,depth+1,totalHint);return}
  const localTotal=Number(v.total_drafts||v.draft_count||v.drafts_count||v.total_entries||v.entry_count||totalHint||0);
  const p=v.player||v.appearance||v;
  const name=clean(p?.full_name||p?.player_name||p?.name||v.player_name||v.full_name||'');
  const pctRaw=v.drafted_percentage??v.drafted_percent??v.drafted_pct??v.exposure_percentage??v.exposure_percent??v.exposure_pct;
  const countRaw=v.drafted_count??v.times_drafted??v.exposure_count??v.count;
  let pct=Number(pctRaw),count=Number(countRaw);
  if(Number.isFinite(pct)&&pct>0&&pct<=1)pct*=100;
  if(name&&tokens(name).length>=2&&(Number.isFinite(pct)||Number.isFinite(count))){
   if(!Number.isFinite(count)&&localTotal&&Number.isFinite(pct))count=Math.round(localTotal*pct/100);
   if(!Number.isFinite(pct)&&localTotal&&Number.isFinite(count))pct=count/localTotal*100;
   if(Number.isFinite(count)&&Number.isFinite(pct))out.push({name:clean(name),count,total:localTotal,pct});
  }
  for(const x of Object.values(v))walk(x,depth+1,localTotal);
 };
 walk(root);return out;
}
async function ingestStructured(data,kind='',url=''){
 const found=(location.pathname.includes('/completed/')||/completed/i.test(String(url||'')))?harvestStructured(data):[];
 if(found.length){
  const current=(await safe(()=>chrome.storage.local.get({drafts:[],entryTotals:{},officialExposure:{}})))||{};const byId=new Map((current.drafts||[]).map(d=>[d.draftId,d]));
  for(const raw of found){const d={...raw,source:'structured-api'};if((!d.sport||d.sport==='UNKNOWN')&&cached.sport!=='ALL')d.sport=cached.sport;byId.set(d.draftId,d)}
  const totals=current.entryTotals||cached.entryTotals||{};const official=current.officialExposure||cached.officialExposure||{};
  const drafts=enrichDraftNames(repairStoredDrafts([...byId.values()],totals),official);await safe(()=>chrome.storage.local.set({drafts}));cached.drafts=drafts;computeStats();
 }
 if(/exposure/i.test(String(url||''))){
  const hits=harvestOfficialExposureStructured(data);
  if(hits.length){
   const next={...cached.officialExposure};let changed=false;
   for(const x of hits){
    const total=Number(x.total||cached.stats?.total||0);
    if(!total||x.count<0||x.count>total)continue;
    const key=officialStorageKey(x.name,cached.sport,cached.selected),val={name:x.name,count:Number(x.count),total,pct:Number(x.pct),sport:cached.sport,contest:cached.selected,capturedAt:Date.now(),source:'underdog-exposure-api'};
    const prev=next[key];
    if(!prev||prev.count!==val.count||prev.total!==val.total||prev.name!==val.name){next[key]=val;changed=true}
   }
   if(changed){cached.officialExposure=next;await safe(()=>chrome.storage.local.set({officialExposure:next}))}
  }
 }
 scheduleRender(0)
}
window.addEventListener('message',e=>{if(e.source===window&&e.data?.source==='NUKE_UD_BRIDGE'&&e.data.data)ingestStructured(e.data.data,e.data.kind,e.data.url)});
function canonicalHistoricalName(name){
 const raw=norm(name);if(!raw)return '';
 if(cached.playerUniverse[raw])return raw;
 const universe=Object.keys(cached.playerUniverse);
 // Old completed cards often stored only "Gibbs", "McCaffrey", etc.
 // Upgrade those to a full name only when that alias identifies exactly one
 // player in the entire saved slate. Ambiguous names such as Wilson stay raw.
 const matches=[...new Set(universe.filter(full=>aliasKeys(full).includes(raw)))];
 return matches.length===1?matches[0]:raw;
}
function computeStats(){
 const ds=cached.drafts.filter(d=>(cached.sport==='ALL'||(d.sport||'UNKNOWN')===cached.sport)&&(cached.selected==='ALL'||d.contest===cached.selected));
 const map=new Map(),pairs=new Map();
 for(const d of ds){
  const names=[...new Set((d.players||[]).map(x=>norm(x.name)).filter(Boolean))];
  for(const name of names)map.set(name,(map.get(name)||0)+1);
  const display=[...new Set((d.players||[]).map(x=>clean(x.name)).filter(Boolean))];
  for(let i=0;i<display.length;i++)for(let j=i+1;j<display.length;j++){
   const key=[display[i],display[j]].sort((a,b)=>a.localeCompare(b)).join(' + ');
   pairs.set(key,(pairs.get(key)||0)+1);
  }
 }
 cached.stats={total:ds.length,map,pairs};
}
async function hydrate(){
 const x=await safe(()=>chrome.storage.local.get({drafts:[],exposureScope:null,lastSelectedSport:'ALL',lastSelectedContest:'ALL',officialExposure:{},playerUniverse:{},entryTotals:{}}));if(!x)return;
 cached.sport=x.exposureScope?.sport||x.lastSelectedSport||'ALL';cached.selected=x.exposureScope?.contest||x.lastSelectedContest||'ALL';cached.officialExposure=x.officialExposure||{};cached.playerUniverse=x.playerUniverse||{};cached.entryTotals=x.entryTotals||{};
 const repaired=enrichDraftNames(repairStoredDrafts(x.drafts||[],cached.entryTotals),cached.officialExposure);
 if(JSON.stringify(repaired)!==JSON.stringify(x.drafts||[]))await safe(()=>chrome.storage.local.set({drafts:repaired}));
 cached.drafts=repaired;computeStats();scheduleRender(0);
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
function detectCompletedEntryTotal(){
 const labels=[...document.querySelectorAll('*')].filter(el=>el.childElementCount===0&&/^Your teams?$/i.test(clean(el.textContent)));
 for(const label of labels){
  let box=label.parentElement;
  for(let depth=0;depth<10&&box;depth++,box=box.parentElement){
   const lines=(box.innerText||'').split('\n').map(clean).filter(Boolean);
   const hit=lines.map(x=>x.match(/^(\d+)\s+Entr(?:y|ies)$/i)).find(Boolean);
   if(hit)return Number(hit[1]||0);
  }
 }
 const hits=(document.body.innerText||'').split('\n').map(clean).map(x=>x.match(/^(\d+)\s+Entr(?:y|ies)$/i)).filter(Boolean).map(m=>Number(m[1])).filter(n=>n>0);
 return hits.length?Math.max(...hits):0;
}
function detectSport(){
 const text=' '+clean(document.body.innerText)+' ';
 const rules=[['NFL',/\bNFL\b|\bQB\b.*\bRB\b.*\bWR\b/i],['NBA',/\bNBA\b|\bPG\b.*\bSG\b.*\bSF\b/i],['MLB',/\bMLB\b|\bP\b.*\bOF\b/i],['NHL',/\bNHL\b|\bC\b.*\bLW\b.*\bRW\b/i],['PGA',/\bPGA\b|\bGOLF\b/i],['MMA',/\bMMA\b|\bUFC\b/i],['WNBA',/\bWNBA\b/i],['CFB',/\bCFB\b|COLLEGE FOOTBALL/i],['CBB',/\bCBB\b|COLLEGE BASKETBALL/i],['SOCCER',/\bSOCCER\b|\bEPL\b|\bMLS\b/i]];
 for(const [s,re] of rules)if(re.test(text))return s;return 'UNKNOWN';
}
async function captureCompleted(){
 if(!location.pathname.includes('/completed/'))return;
 const contest=detectCompletedContest();if(!contest)return;
 let sport=detectSport();if(sport==='UNKNOWN'&&cached.sport!=='ALL')sport=cached.sport;
 const total=detectCompletedEntryTotal(),rosters=rosterStrings();
 const stored=await safe(()=>chrome.storage.local.get({drafts:[],officialExposure:{},entryTotals:{}}));if(!stored)return;
 const official=stored.officialExposure||cached.officialExposure||{},entryTotals={...(stored.entryTotals||cached.entryTotals||{})};
 if(total>0){entryTotals[entryTotalKey(sport,contest)]=total;entryTotals[wildcardEntryTotalKey(contest)]=total}
 let drafts=enrichDraftNames(repairStoredDrafts(stored.drafts||[],entryTotals),official);
 const pool=knownFullNames(drafts,official,null);
 const expand=raw=>{raw=clean(raw);if(tokens(raw).length>=2)return raw;const m=pool.filter(full=>nameMatchStrength(raw,full)>0);return m.length===1?m[0]:raw};
 for(const raw of rosters){
  const players=raw.split(',').map(clean).filter(Boolean).map(name=>({name:expand(name)}));if(players.length<2)continue;
  const matches=drafts.map((d,i)=>({d,i,m:rosterMatch(players,d.players)})).filter(x=>dScopeSame(x.d,sport,contest)&&x.m.ok);
  const stable=matches.filter(x=>!isSyntheticDraft(x.d));
  const chosen=stable.length===1?stable[0]:(matches.length===1?matches[0]:null);
  if(chosen){
   const old=chosen.d;
   const nextPlayers=players.map((p,i)=>{
    const op=(old.players||[])[chosen.m.mapping[i]]||{};
    return tokens(op.name).length>tokens(p.name).length?{...p,...op,name:clean(op.name)}:{...op,...p};
   });
   drafts[chosen.i]={...old,sport:old.sport||sport,contest:old.contest||contest,players:nextPlayers};
   continue;
  }
  const fingerprint=players.map(p=>norm(p.name)).sort().join('|');
  const draftId='dom|'+contest+'|'+fingerprint;
  if(drafts.some(d=>String(d.draftId||'')===draftId))continue;
  drafts.push({draftId,sport,format:'Daily Draft',contest,players,sourceUrl:location.href,capturedAt:new Date().toISOString(),source:'completed-dom'});
 }
 drafts=enrichDraftNames(repairStoredDrafts(drafts,entryTotals),official);
 cached.entryTotals=entryTotals;cached.drafts=drafts;
 await safe(()=>chrome.storage.local.set({drafts,entryTotals,exposureScope:{sport,contest}}));
 computeStats();
}
function dScopeSame(d,sport,contest){
 return String(d?.sport||'UNKNOWN').toUpperCase()===String(sport||'UNKNOWN').toUpperCase()&&contestNorm(d?.contest||'')===contestNorm(contest||'');
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
 const nums=[...t.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map(m=>Number(m[1])).filter(Number.isFinite);
 // Underdog player rows expose ADP before projection; keep it with the candidate
 // so early-round value can react to a player falling past his normal draft slot.
 const adp=nums.length>=2?nums[nums.length-2]:null;
 return {pos,team:game?.[1]?.toUpperCase()||'',opp:game?.[2]?.toUpperCase()||'',adp};
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
async function rememberPlayerUniverse(rows){
 let changed=false;
 for(const {name,row} of rows){
  const meta=nflRowMeta(row),key=norm(name);if(!key)continue;
  const prev=cached.playerUniverse[key]||{};
  // Monotonic enrichment: scrolling/virtualized rows may briefly omit metadata.
  // Never replace known identity fields with blanks from a recycled DOM node.
  const next={name:clean(name)||prev.name||'',pos:meta.pos||prev.pos||'',team:meta.team||prev.team||''};
  if(JSON.stringify(prev)!==JSON.stringify(next)){cached.playerUniverse[key]=next;changed=true}
 }
 // Do not trigger another render here. renderBadges already has the exact rows
 // for this frame; a second asynchronous render during scroll caused valid badges
 // to be replaced by transient 0/45 values.
 if(changed)await safe(()=>chrome.storage.local.set({playerUniverse:cached.playerUniverse}))
}
async function captureOfficialExposure(){
 if(!location.pathname.includes('/exposure/'))return;
 const bodyText=document.body.innerText||'';
 const totalMatch=bodyText.match(/(?:Showing:\s*All\s*)?(\d+)\s*drafts/i);
 const total=Number(totalMatch?.[1]||0);if(!total)return;
 const next={...cached.officialExposure};let changed=false;

 // The official Underdog Exposure page is the source of truth. Parse the
 // smallest visible row containing Name + position/team + Entry fees + Drafted.
 // Do NOT infer ownership from completed-card surnames here.
 const candidates=[...document.querySelectorAll('div')].filter(row=>{
  if(row.offsetParent===null)return false;
  const lines=(row.innerText||'').split('\n').map(clean).filter(Boolean);
  const r=row.getBoundingClientRect();
  return r.width>=220&&r.height>=35&&r.height<=120&&
   lines.some(x=>/^Drafted$/i.test(x))&&
   lines.some(x=>/^Entry fees$/i.test(x))&&
   lines.some(x=>/^\d+(?:\.\d+)?%$/.test(x))&&
   lines.some(x=>/^(QB|RB|WR|TE)\d*$/i.test(x));
 });
 const rows=candidates.filter(row=>![...row.children].some(ch=>{
  if(ch.offsetParent===null)return false;
  const l=(ch.innerText||'').split('\n').map(clean).filter(Boolean);
  return l.some(x=>/^Drafted$/i.test(x))&&l.some(x=>/^Entry fees$/i.test(x))&&l.some(x=>/^\d+(?:\.\d+)?%$/.test(x));
 }));
 for(const row of rows){
  const lines=(row.innerText||'').split('\n').map(clean).filter(Boolean);
  const pctToken=lines.find(x=>/^\d+(?:\.\d+)?%$/.test(x));
  const hit=Number(pctToken?.replace('%',''));if(!Number.isFinite(hit))continue;
  const posIndex=lines.findIndex(x=>/^(QB|RB|WR|TE)\d*$/i.test(x));
  let name='';
  if(posIndex>0){
   for(let i=posIndex-1;i>=0;i--){
    const x=lines[i];
    if(x.length>=4&&x.length<=45&&/^[A-Za-zÀ-ÿ.' -]+$/.test(x)&&
      !/^(Players?|Entry fees|Drafted|Teams?|ADP|Proj)$/i.test(x)){name=x;break}
   }
  }
  if(!name)continue;
  const key=officialStorageKey(name,cached.sport,cached.selected);
  // Require a real full name for authoritative identity. A bare surname can
  // never overwrite an exact player's record.
  if(tokens(name).length<2)continue;
  const count=Math.round(total*hit/100);
  const val={name:clean(name),count,total,pct:hit,sport:cached.sport,contest:cached.selected,capturedAt:Date.now(),source:'underdog-exposure'};
  const prev=next[key];
  if(!prev||prev.count!==count||prev.total!==total||prev.pct!==hit||prev.name!==val.name){
   next[key]=val;changed=true;
  }
 }
 if(changed){cached.officialExposure=next;await safe(()=>chrome.storage.local.set({officialExposure:next}));scheduleRender(0)}
}
function exposureCount(name,st){
 const full=norm(name);if(!full)return 0;

 // Exact Underdog exposure is authoritative and is scoped to this tournament.
 const official=officialForName(name,st.total);
 if(official&&official.count>=0)return official.count;

 // Fallback uses only stable portfolio identities. It never depends on the
 // currently visible QB/RB/WR/TE tab, so switching tabs cannot change ownership.
 const stableNames=knownFullNames(cached.drafts,cached.officialExposure,null);
 const rawMatchesFull=raw=>{
  const r=norm(raw);if(!r)return false;
  if(r===full)return true;
  if(nameMatchStrength(raw,name)<=0)return false;
  const matches=stableNames.filter(n=>nameMatchStrength(raw,n)>0);
  return matches.length===1&&norm(matches[0])===full;
 };
 let count=0;
 for(const d of cached.drafts){
  if((cached.sport!=='ALL'&&(d.sport||'UNKNOWN')!==cached.sport)||(cached.selected!=='ALL'&&d.contest!==cached.selected))continue;
  if((d.players||[]).some(p=>rawMatchesFull(p.name)))count++;
 }
 return count;
}
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
 const rows=findPlayerRows(); rememberPlayerUniverse(rows);
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
 return nameMatchStrength(a,b)>0;
}
function pairCount(a,b){
 if(!cached.stats?.pairs)return 0;
 for(const [key,n] of cached.stats.pairs){
  const parts=key.split(' + ');
  if(parts.length===2&&((namesMatch(a,parts[0])&&namesMatch(b,parts[1]))||(namesMatch(a,parts[1])&&namesMatch(b,parts[0]))))return n;
 }
 return 0;
}
function buildStyleStats(){
 // Portfolio mix only: completed entries in the selected tournament. Current
 // live picks never affect these values. Older completed captures stored names
 // without positions, so recover position from the persistent slate universe.
 const ds=cached.drafts.filter(d=>(cached.sport==='ALL'||(d.sport||'UNKNOWN')===cached.sport)&&(cached.selected==='ALL'||d.contest===cached.selected));
 const styles=[
  {key:'1QB / 2RB / 2WR / 1TE',want:{QB:1,RB:2,WR:2,TE:1}},
  {key:'1QB / 1RB / 3WR / 1TE',want:{QB:1,RB:1,WR:3,TE:1}},
  {key:'1QB / 1RB / 2WR / 2TE',want:{QB:1,RB:1,WR:2,TE:2}}
 ];
 const out=styles.map(s=>({...s,count:0}));
 const inferPos=p=>{
  let pos=String(p.pos||p.position||'').toUpperCase();
  if(!pos){
   const raw=String(p.slot||p.rosterPosition||p.position_name||'').toUpperCase();
   pos=['QB','RB','WR','TE'].find(x=>raw.includes(x))||'';
  }
  if(pos)return pos;
  const name=clean(p.name),rawName=norm(name);
  if(cached.playerUniverse[rawName]?.pos)return cached.playerUniverse[rawName].pos;
  // Historical completed cards often store ONLY a surname. Resolve that raw
  // stored value against the slate universe. Do not compare every alias from
  // both sides: that made full names collide through common surnames.
  const matches=Object.entries(cached.playerUniverse)
   .filter(([full,u])=>u?.pos&&(full===rawName||aliasKeys(full).includes(rawName)))
   .map(([,u])=>u);
  const positions=[...new Set(matches.map(u=>u.pos).filter(Boolean))];
  return matches.length===1?matches[0].pos:(positions.length===1?positions[0]:'');
 };
 for(const d of ds){
  const counts={QB:0,RB:0,WR:0,TE:0};
  for(const p of (d.players||[])){const pos=inferPos(p);if(counts[pos]!==undefined)counts[pos]++}
  for(const s of out)if(Object.keys(s.want).every(k=>counts[k]===s.want[k]))s.count++;
 }
 return {total:ds.length,styles:out};
}
function duplicateState(drafted){
 const hist=cached.drafts.filter(d=>(cached.sport==='ALL'||(d.sport||'UNKNOWN')===cached.sport)&&(cached.selected==='ALL'||d.contest===cached.selected));
 if(!drafted.length||!hist.length)return {best:0,total:drafted.length,exact:false,matches:[],draft:null};
 let best={best:0,total:drafted.length,exact:false,matches:[],draft:null};
 for(const d of hist){
  const old=(d.players||[]).map(p=>clean(p.name)).filter(Boolean);
  const matches=drafted.filter(p=>old.some(n=>namesMatch(p.name,n))).map(p=>p.name);
  if(matches.length>best.best)best={best:matches.length,total:drafted.length,exact:drafted.length>=6&&matches.length===drafted.length&&old.length===drafted.length,matches,draft:d};
 }
 return best;
}
function duplicateCandidate(name,drafted){
 if(!drafted.length)return {max:0,bonus:0,label:''};
 const hist=cached.drafts.filter(d=>(cached.sport==='ALL'||(d.sport||'UNKNOWN')===cached.sport)&&(cached.selected==='ALL'||d.contest===cached.selected));
 let max=0;
 for(const d of hist){
  const old=(d.players||[]).map(p=>clean(p.name)).filter(Boolean);
  if(!old.some(n=>namesMatch(name,n)))continue;
  let n=1;
  for(const p of drafted)if(old.some(x=>namesMatch(p.name,x)))n++;
  max=Math.max(max,n);
 }
 // As a candidate approaches an old full lineup, actively push it down.
 // 5/6 is a major warning; 4/6 is worth surfacing but not an automatic veto.
 const bonus=max>=6?-60:max===5?-34:max===4?-14:0;
 const label=max>=6?'FULL DUPLICATE':max===5?'DUP PATH 5/6':max===4?'DUP PATH 4/6':'';
 return {max,bonus,label};
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
function adpValue(meta,drafted,state){
 const adp=Number(meta.adp);if(!Number.isFinite(adp)||adp<=0)return {bonus:0,fall:0,label:''};
 const nextPick=drafted.length+1,fall=Math.max(0,nextPick-adp);
 if(drafted.length>=4||fall<1)return {bonus:0,fall,label:''};
 // Rounds 1-4: reward unusual ADP slides when the player's position is still useful.
 // This intentionally creates access to combinations that normally do not reach
 // the same drafter, while never overriding a closed QB slot.
 const open=meta.pos==='QB'?state.counts.QB===0:
  meta.pos==='RB'?state.counts.RB<2:
  meta.pos==='WR'?state.counts.WR<3:
  meta.pos==='TE'?state.counts.TE<1:true;
 if(!open)return {bonus:0,fall,label:''};
 const bonus=Math.min(38,Math.round(fall*7));
 return {bonus,fall,label:'ADP FALL +'+fall.toFixed(fall%1?1:0)};
}
function raritySignal(allRels,drafted,total){
 if(!drafted.length||!total)return {bonus:0,label:'',max:0};
 const counts=allRels.map(x=>x.count),max=Math.max(...counts,0);
 // Reward paths that have barely/never appeared in our completed drafts.
 // Strongest in the early/middle portion where unusual ADP slides create genuinely
 // hard-to-reproduce constructions; correlation still scores separately.
 const early=drafted.length<=4;
 if(max===0)return {bonus:early?18:10,label:'RARE PAIR · NEW',max};
 if(max===1)return {bonus:early?13:7,label:'RARE PAIR · 1/'+total,max};
 if(max===2&&total>=15)return {bonus:early?7:3,label:'UNCOMMON · 2/'+total,max};
 return {bonus:0,label:'',max};
}
function exposureBalance(exposure,total){
 if(!total)return {bonus:0,label:''};
 const rate=exposure/total;
 if(rate<=.08)return {bonus:5,label:'LOW EXP'};
 if(rate>=.35)return {bonus:-5,label:'HIGH EXP'};
 return {bonus:0,label:''};
}
function candidateSignals(name,meta,drafted,total,state){
 const allRels=drafted.map(p=>({pick:p.name,count:pairCount(name,p.name)})).sort((a,b)=>b.count-a.count);
 const rels=allRels.filter(x=>x.count>0),exposure=exposureCount(name,cached.stats),tag=correlationTag(meta,drafted);
 const covered=rels.length,sum=rels.reduce((s,x)=>s+x.count,0),best=rels[0]?.count||0,pickCount=Math.max(1,drafted.length);
 const avgPairRate=total?sum/(total*pickCount):0,coverageRate=covered/pickCount;
 const corrBonus=tag?.kind==='qb-stack'?34:tag?.kind==='bringback'?12:tag?.kind==='same-team'?3:0;
 const needBonus=positionNeed(meta,state),value=adpValue(meta,drafted,state),rarity=raritySignal(allRels,drafted,total),balance=exposureBalance(exposure,total),dup=duplicateCandidate(name,drafted);
 // ADP value + correlation + roster need lead. Rarity is a meaningful tiebreaker.
 // Duplicate-path penalties become aggressive only when a candidate moves us close
 // to recreating an existing full lineup in this tournament.
 const fit=Math.min(100,Math.max(0,Math.round(avgPairRate*34+coverageRate*15+corrBonus+needBonus+value.bonus+rarity.bonus+balance.bonus+dup.bonus)));
 return {name,meta,rels,allRels,exposure,total,tag,covered,sum,best,fit,needBonus,value,rarity,balance,dup};
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
 const state=rosterState(drafted),dupe=duplicateState(drafted),builds=buildStyleStats();
 const candidates=availableCandidates().sort((a,b)=>b.fit-a.fit||b.covered-a.covered||b.sum-a.sum||b.best-a.best||a.exposure-b.exposure||a.name.localeCompare(b.name)).slice(0,10);
 const picked=drafted.map(x=>x.name).join(' + ');
 const build='QB '+state.counts.QB+' · RB '+state.counts.RB+' · WR '+state.counts.WR+' · TE '+state.counts.TE;
 panel.innerHTML='<div class="nuke-combo-head"><b>NUKE · NEXT</b><span>'+total+' drafts</span></div>'+
  '<div class="nuke-roster-intel"><span>'+build+'</span><b class="'+state.stackClass+'">'+state.stackText+'</b></div>'+
  '<div class="nuke-duplicate '+(dupe.exact?'danger':dupe.best>=4?'warn':'safe')+'"><b>'+(dupe.exact?'⚠ FULL LINEUP DUPLICATE':dupe.best>=4?'DUPLICATE WATCH · '+dupe.best+'/'+drafted.length:'UNIQUE BUILD · closest '+dupe.best+'/'+drafted.length)+'</b><span>'+(dupe.matches.length?dupe.matches.join(' + '):'No matching prior core')+'</span></div>'+
  '<div class="nuke-build-mix" title="Completed tournament portfolio only — independent of current picks">'+builds.styles.map(s=>'<span><b>'+s.key+'</b><em>'+s.count+'/'+builds.total+' · '+(builds.total?Math.round(s.count/builds.total*100):0)+'%</em></span>').join('')+'</div>'+
  '<div class="nuke-next-picks">MY PICKS · '+picked+'</div>'+
  candidates.map(x=>{
   const pct=total?Math.round(x.exposure/total*100):0,rel=x.rels.slice(0,2).map(r=>r.pick+' '+r.count+'/'+total).join(' · ');
   const corr=x.tag?'<em class="nuke-next-tag '+x.tag.kind+'">'+x.tag.text+'</em>':'';
   const value=x.value?.bonus?'<em class="nuke-next-tag adp-fall">'+x.value.label+'</em>':'';
   const rare=x.rarity?.bonus?'<em class="nuke-next-tag rare">'+x.rarity.label+'</em>':'';
   const bal=x.balance?.label?'<em class="nuke-next-tag exposure">'+x.balance.label+'</em>':'';
   const dup=x.dup?.label?'<em class="nuke-next-tag duplicate">'+x.dup.label+'</em>':'',relationship=rel||'No prior combo with my picks';
   return '<div class="nuke-next-row"><div class="nuke-next-main"><b>'+x.name+'</b>'+corr+value+rare+bal+dup+'<span>'+relationship+'</span></div>'+
    '<div class="nuke-next-metrics"><div><b>'+x.fit+'</b><span>FIT</span></div><div><b>'+x.covered+'/'+drafted.length+'</b><span>WITH</span></div><div><b>'+pct+'%</b><span>EXP</span></div></div></div>';
  }).join('')+(candidates.length?'':'<div class="nuke-combo-empty">No available players detected.</div>');
}
function scheduleRender(ms=80){clearTimeout(scanTimer);scanTimer=setTimeout(()=>{if(!scanBusy){scanBusy=true;try{renderBadges();renderComboPanel()}finally{scanBusy=false}}},ms)}
const obs=new MutationObserver(m=>{if(!m.some(x=>[...x.addedNodes].some(n=>n.nodeType===1&&!n.closest?.('[data-nuke-exposure]'))))return;if(location.pathname.includes('/completed/')){clearTimeout(captureTimer);captureTimer=setTimeout(captureCompleted,350)}else if(location.pathname.includes('/exposure/')){clearTimeout(captureTimer);captureTimer=setTimeout(captureOfficialExposure,250)}else scheduleRender()});
obs.observe(document.documentElement,{childList:true,subtree:true});

chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.drafts)cached.drafts=changes.drafts.newValue||[];
 if(changes.officialExposure)cached.officialExposure=changes.officialExposure.newValue||{};
 if(changes.playerUniverse)cached.playerUniverse=changes.playerUniverse.newValue||{};
 if(changes.entryTotals)cached.entryTotals=changes.entryTotals.newValue||{};
 if(changes.lastSelectedSport)cached.sport=changes.lastSelectedSport.newValue||'ALL';
 if(changes.exposureScope){
  cached.sport=changes.exposureScope.newValue?.sport||'ALL';
  cached.selected=changes.exposureScope.newValue?.contest||'ALL';
 }
 if(changes.lastSelectedContest&&!changes.exposureScope)cached.selected=changes.lastSelectedContest.newValue||'ALL';
 const affectsExposure=!!(changes.drafts||changes.officialExposure||changes.lastSelectedSport||changes.exposureScope||changes.lastSelectedContest);
 if(affectsExposure){computeStats();scheduleRender(0)}
});
chrome.runtime.onMessage.addListener((msg,sender,send)=>{
 if(msg?.type==='NUKE_FORCE_SCAN'){(async()=>{await captureCompleted();await hydrate();send({ok:true,total:cached.drafts.length})})();return true}
});
(async()=>{await hydrate();await captureCompleted();await captureOfficialExposure();scheduleRender(0)})();
})();