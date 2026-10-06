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
  const add=raw=>{const p=player(raw);if(!p.name.includes(' '))return;const k=norm(p.name),old=m.get(k)||{};m.set(k,{...old,...p,pos:p.pos||old.pos||'',team:p.team||old.team||'',sport:p.sport||old.sport||'',ids:[...new Set([...(old.ids||[]),...p.ids])]})};
  seed.forEach(add);Object.values(universe).forEach(add);drafts.forEach(d=>(d.players||[]).forEach(p=>add({...p,sport:p.sport||d.sport})));Object.values(official).forEach(add);return [...m.values()];
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
 function resolve(raw,pool){const p=player(raw),hits=candidates(p,pool);if(hits.length!==1)return {...p,unresolved:hits.length>1||!p.name.includes(' ')};const hit=hits[0];return {...p,name:hit.name,pos:p.pos||hit.pos,team:p.team||hit.team,sport:p.sport||hit.sport,ids:[...new Set([...p.ids,...hit.ids])],id:p.id||hit.id,unresolved:false}}
 const label=p=>p.unresolved?`${p.name} (identity unconfirmed)`:p.name;
 function officialCount(entry,scope,total){return sameScope(entry?.scope,scope)&&Number(entry.total)===total&&total>0&&Number.isFinite(Number(entry.count))&&entry.count>=0&&entry.count<=total?Number(entry.count):null}
 function displayDrafts(drafts,pool){
  const out=[],byId=new Set(),synthetic=new Map();
  for(const raw of drafts){const d={...raw,players:(raw.players||[]).map(p=>resolve({...p,sport:p.sport||raw.sport},pool))};const id=String(d.draftId||'');const isSynthetic=!id||id.includes('|')||['completed-dom','legacy-dom'].includes(d.source);const fingerprint=JSON.stringify([d.sport,d.contest,...d.players.map(p=>norm(p.name)).sort()]);
   if(!isSynthetic){const k=JSON.stringify([d.sport,d.contest,id]);if(byId.has(k))continue;byId.add(k);out.push(d)}else if(!synthetic.has(fingerprint))synthetic.set(fingerprint,d);
  }
  const stable=new Set(out.map(d=>JSON.stringify([d.sport,d.contest,...d.players.map(p=>norm(p.name)).sort()])));
  for(const [k,d]of synthetic)if(!stable.has(k))out.push(d);return out;
 }
 const api={clean,norm,aliases,NONE,scopeKey,sameScope,matchesScope,player,catalog,candidates,resolve,label,officialCount,displayDrafts};
 root.NukeExposure=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
