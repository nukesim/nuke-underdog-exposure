// Shared by the popup and live content script. No browser dependencies.
(function(root){
 'use strict';
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const norm=s=>clean(s).toLowerCase().replace(/’/g,"'").replace(/[^a-z0-9'. -]/g,'');
 const aliases=name=>{const a=norm(name).split(' ').filter(Boolean),out=[norm(name)];for(let i=1;i<a.length;i++)out.push(a.slice(i).join(' '));if(/^(ii|iii|iv|jr\.?|sr\.?)$/.test(a.at(-1)))out.push(a.slice(1,-1).join(' '));return [...new Set(out.filter(Boolean))]};
 const NONE='__NO_TOURNAMENT__';
 const scopeKey=s=>JSON.stringify([s?.sport||'ALL',s?.contest||NONE]);
 const sameScope=(a,b)=>!!a&&!!b&&scopeKey(a)===scopeKey(b);
 const matchesScope=(d,s)=>(s.sport==='ALL'||d.sport===s.sport)&&(s.contest==='ALL'||d.contest===s.contest);
 function player(raw){
  const p=raw?.player||raw?.appearance?.player||raw?.appearance||raw||{};
  const name=clean(p.full_name||p.fullName||p.player_name||[p.first_name||p.firstName,p.last_name||p.lastName].filter(Boolean).join(' ')||p.name||raw?.player_name||raw?.name);
  const ids=[p.player_id,p.playerId,p.id,raw?.player_id,raw?.playerId,raw?.appearance_id,raw?.appearanceId,raw?.id,...(p.ids||[])].filter(Boolean).map(String);
  return {...raw,name,ids:[...new Set(ids)],id:String(p.player_id||p.playerId||raw?.player_id||raw?.playerId||p.id||raw?.id||''),pos:clean(p.slotName||p.position||p.pos||raw?.pos).toUpperCase(),team:clean(p.teamName||p.team_name||p.team?.name||p.team?.abbr||p.team||raw?.team),sport:clean(p.sport||raw?.sport).toUpperCase()};
 }
 function catalog(seed=[],universe={},drafts=[],official={}){
  const m=new Map();
  const add=(raw,rank=Infinity)=>{const p=player(raw);if(!p.name.includes(' '))return;const k=norm(p.name),old=m.get(k)||{};const oldRank=Number.isFinite(Number(old._rank))?Number(old._rank):Infinity,rawRank=Number.isFinite(Number(p._rank))?Number(p._rank):Infinity,nextRank=Math.min(oldRank,rawRank,rank);m.set(k,{...old,...p,pos:p.pos||old.pos||'',team:p.team||old.team||'',sport:p.sport||old.sport||'',ids:[...new Set([...(old.ids||[]),...p.ids])],_rank:nextRank})};
  seed.forEach((x,i)=>add(x,i+1));Object.values(universe).forEach(x=>add(x));drafts.forEach(d=>(d.players||[]).forEach(p=>add({...p,sport:p.sport||d.sport})));Object.values(official).forEach(x=>add(x));return [...m.values()];
 }
 function candidates(raw,pool){
  const p=player(raw),ids=p.ids;
  const byId=pool.filter(x=>x.ids.some(id=>ids.includes(id)));if(byId.length)return byId;
  const key=norm(p.name);if(!key)return [];
  const exact=pool.filter(x=>norm(x.name)===key);if(exact.length)return exact;
  let hits=pool.filter(x=>aliases(x.name).includes(key));
  if(p.sport&&p.sport!=='UNKNOWN')hits=hits.filter(x=>!x.sport||x.sport===p.sport);
  if(p.pos)hits=hits.filter(x=>!x.pos||x.pos===p.pos);
  if(p.team)hits=hits.filter(x=>norm(x.team)===norm(p.team)||norm(x.teamAbbr)===norm(p.team));
  return hits;
 }
 function merged(p,hit){return {...p,name:hit.name,pos:p.pos||hit.pos,team:p.team||hit.team,sport:p.sport||hit.sport,ids:[...new Set([...p.ids,...(hit.ids||[])])],id:p.id||hit.id,unresolved:false}}
 function resolve(raw,pool){const p=player(raw),hits=candidates(p,pool);if(hits.length!==1)return {...p,unresolved:hits.length>1||!p.name.includes(' ')};return merged(p,hits[0])}
 function resolveRoster(players,pool,sport=''){
  const src=players||[],sportName=clean(sport||src.find(x=>x?.sport)?.sport||'').toUpperCase();
  const base=src.map(p=>resolve({...p,sport:p.sport||sportName},pool));
  if(sportName!=='NFL'||src.length!==6)return base;
  const need={QB:1,RB:2,WR:2,TE:1},positions=new Set(Object.keys(need));
  const options=src.map((raw,i)=>{
   if(!base[i].unresolved&&positions.has(base[i].pos))return [base[i]];
   const hits=candidates({...raw,sport:raw.sport||sportName},pool).filter(x=>positions.has(x.pos));
   const seen=new Set(),out=[];
   for(const hit of hits){const k=norm(hit.name);if(seen.has(k))continue;seen.add(k);out.push(merged(player({...raw,sport:raw.sport||sportName}),hit))}
   return out;
  });
  if(options.some(x=>!x.length))return base;
  const order=[0,1,2,3,4,5].sort((a,b)=>options[a].length-options[b].length),solutions=[],chosen=Array(6),counts={QB:0,RB:0,WR:0,TE:0},used=new Set();
  const walk=depth=>{
   if(solutions.length>=256)return;
   if(depth===order.length){if(Object.keys(need).every(p=>counts[p]===need[p]))solutions.push(chosen.slice());return}
   const idx=order[depth];
   for(const pick of options[idx]){
    const pos=pick.pos,key=norm(pick.name);if(!positions.has(pos)||counts[pos]>=need[pos]||used.has(key))continue;
    counts[pos]++;used.add(key);chosen[idx]=pick;walk(depth+1);used.delete(key);counts[pos]--;
   }
  };
  walk(0);if(!solutions.length)return base;
  const rank=p=>Number.isFinite(Number(p?._rank))?Number(p._rank):10000;
  const score=sol=>{let s=sol.reduce((n,p)=>n+rank(p),0);const qb=sol.find(p=>p.pos==='QB');if(qb?.team)for(const p of sol)if(['WR','TE'].includes(p.pos)&&norm(p.team)===norm(qb.team))s-=25;return s};
  const scored=solutions.map(sol=>({sol,score:score(sol)})).sort((a,b)=>a.score-b.score);
  return base.map((fallback,i)=>{
   const groups=new Map();
   for(const x of scored){const pick=x.sol[i],k=norm(pick.name),old=groups.get(k);if(!old||x.score<old.score)groups.set(k,{pick,score:x.score})}
   const choices=[...groups.values()].sort((a,b)=>a.score-b.score);
   if(choices.length===1)return choices[0].pick;
   // Only break a surname tie when roster legality + ranking context gives a large margin.
   // This fixes completed-card labels such as McCaffrey/Jefferson/Love/Johnson without
   // turning ordinary close surname collisions into false exact identities.
   if(choices[1].score-choices[0].score>=35)return choices[0].pick;
   return fallback;
  });
 }
 const label=p=>p.unresolved?`${p.name} (identity unconfirmed)`:p.name;
 function officialCount(entry,scope,total){return sameScope(entry?.scope,scope)&&Number(entry.total)===total&&total>0&&Number.isFinite(Number(entry.count))&&entry.count>=0&&entry.count<=total?Number(entry.count):null}
 function displayDrafts(drafts,pool){
  const out=[],byId=new Set(),synthetic=new Map();
  for(const raw of drafts){const d={...raw,players:resolveRoster(raw.players||[],pool,raw.sport)};const id=String(d.draftId||'');const isSynthetic=!id||id.includes('|')||['completed-dom','legacy-dom'].includes(d.source);const fingerprint=JSON.stringify([d.sport,d.contest,...d.players.map(p=>norm(p.name)).sort()]);
   if(!isSynthetic){const k=JSON.stringify([d.sport,d.contest,id]);if(byId.has(k))continue;byId.add(k);out.push(d)}else if(!synthetic.has(fingerprint))synthetic.set(fingerprint,d);
  }
  const stable=new Set(out.map(d=>JSON.stringify([d.sport,d.contest,...d.players.map(p=>norm(p.name)).sort()])));
  for(const [k,d]of synthetic)if(!stable.has(k))out.push(d);return out;
 }
 const api={clean,norm,aliases,NONE,scopeKey,sameScope,matchesScope,player,catalog,candidates,resolve,resolveRoster,label,officialCount,displayDrafts};
 root.NukeExposure=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
