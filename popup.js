let activeTab="players",allDrafts=[],officialExposure={};const $=id=>document.getElementById(id);const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#039;"}[c]));
function status(t,s="working"){$("syncText").textContent=t;$("syncStatus").className="sync "+s}
function sports(){return ["ALL",...[...new Set(allDrafts.map(d=>d.sport).filter(Boolean))].sort()]}
function buildFilters(prefSport,prefContest){const sport=prefSport||$("sport").value||"ALL";$("sport").innerHTML=sports().map(x=>`<option ${x===sport?"selected":""}>${esc(x==="ALL"?"ALL SPORTS":x)}</option>`).join("");const valid=allDrafts.filter(d=>sport==="ALL"||d.sport===sport);const contests=["ALL",...[...new Set(valid.map(d=>d.contest).filter(Boolean))].sort()];const contest=contests.includes(prefContest)?prefContest:(contests.includes($("contest").value)?$("contest").value:"ALL");$("contest").innerHTML=contests.map(x=>`<option ${x===contest?"selected":""}>${esc(x==="ALL"?"ALL TOURNAMENTS":x)}</option>`).join("")}
async function persist(){await chrome.storage.local.set({exposureScope:{sport:$("sport").value||"ALL",contest:$("contest").value||"ALL"},lastSelectedContest:$("contest").value||"ALL"})}
function filtered(){const s=$("sport").value,c=$("contest").value;return displayDrafts().filter(d=>(s==="ALL"||d.sport===s)&&(c==="ALL"||d.contest===c))}
let playerUniverse={};
const norm=s=>String(s||"").trim().toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,"").replace(/\s+/g," ");
const tokens=s=>norm(s).split(" ").filter(Boolean);
const aliases=s=>{const a=tokens(s);if(!a.length)return[];const out=[norm(s),a.at(-1)];if(a.length>1)out.push(a.slice(-2).join(" "));if(/^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1)out.push(a.at(-2));return[...new Set(out)]};
const validBuilds=new Set(["1|2|2|1","1|1|3|1","1|1|2|2"]);
function identityPool(){const m=new Map(),add=(name,pos="")=>{name=String(name||"").trim();if(tokens(name).length<2)return;const k=norm(name),v=m.get(k)||{name,pos:""};v.name=name;if(!v.pos&&pos)v.pos=String(pos).toUpperCase();m.set(k,v)};for(const [k,u] of Object.entries(playerUniverse||{}))add(u?.name||k,u?.pos||u?.position||"");for(const o of Object.values(officialExposure||{}))add(o?.name,"");return[...m.values()]}
function identityCandidates(raw,pool=identityPool()){const k=norm(raw);if(!k)return[];const exact=pool.filter(x=>norm(x.name)===k);return exact.length?exact:pool.filter(x=>aliases(x.name).includes(k))}
function buildKey(pos){const c={QB:0,RB:0,WR:0,TE:0};for(const p of pos)if(c[p]!==undefined)c[p]++;return[c.QB,c.RB,c.WR,c.TE].join("|")}
function resolveRoster(players){const pool=identityPool(),opts=(players||[]).map(p=>{const raw=String(p?.name||"").trim(),hits=identityCandidates(raw,pool);if(hits.length===1)return[{...p,name:hits[0].name,pos:hits[0].pos||p.pos||""}];if(hits.length>1)return hits.map(h=>({...p,name:h.name,pos:h.pos||p.pos||""}));return[{...p,name:raw,pos:p.pos||""}]});if(opts.every(x=>x.length===1))return opts.map(x=>x[0]);const sol=[],pick=[],seen=new Set();const walk=i=>{if(sol.length>1)return;if(i===opts.length){const pos=pick.map(x=>String(x.pos||"").toUpperCase());if(pos.every(x=>["QB","RB","WR","TE"].includes(x))&&validBuilds.has(buildKey(pos)))sol.push(pick.map(x=>({...x})));return}for(const o of opts[i]){const k=norm(o.name);if(k&&seen.has(k))continue;if(k)seen.add(k);pick.push(o);walk(i+1);pick.pop();if(k)seen.delete(k)}};walk(0);return sol.length===1?sol[0]:opts.map((x,i)=>x.length===1?x[0]:{...(players[i]||{}),name:String(players[i]?.name||"").trim()})}
function syntheticDraft(d){const id=String(d?.draftId||"");return!id||id.startsWith("dom|")||id.includes("|")||d?.source==="completed-dom"||d?.source==="legacy-dom"}
function displayDrafts(){const groups=new Map(),out=[];for(const raw of allDrafts||[]){const d={...raw,players:resolveRoster(raw.players||[])},names=(d.players||[]).map(p=>norm(p.name)).filter(Boolean).sort();if(!names.length){out.push(d);continue}const k=[String(d.sport||"UNKNOWN"),String(d.contest||""),...names].join("|");if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d)}for(const g of groups.values()){const stable=g.filter(d=>!syntheticDraft(d));if(stable.length)out.push(...stable);else out.push(g[0])}return out}
function fullName(raw){
 const key=norm(raw);if(!key)return String(raw||"");
 const candidates=identityCandidates(raw);
 return candidates.length===1?candidates[0].name:String(raw);
}
function playerStats(ds){
 const m=new Map();
 ds.forEach(d=>{const seen=new Set();(d.players||[]).forEach(p=>{const name=fullName(p.name),key=norm(name);if(!key||seen.has(key))return;seen.add(key);const cur=m.get(key)||{name,count:0};cur.name=name;cur.count++;m.set(key,cur)})});
 // Exact Underdog Exposure-page values are authoritative for player ownership.
 // Merge them into the popup so popup and live badges use the same source.
 for(const [key,o] of Object.entries(officialExposure||{})){
  if(!o||!Number.isFinite(Number(o.count)))continue;
  if(Number(o.total||0)!==Number(ds.length||0))continue;
  const name=o.name||playerUniverse[key]?.name||m.get(key)?.name||key.replace(/\b\w/g,x=>x.toUpperCase());
  m.set(key,{name,count:Number(o.count),official:true});
 }
 return [...m.values()].map(x=>({...x,pct:ds.length?100*x.count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))
}
function comboStats(ds){const m=new Map();ds.forEach(d=>{const n=[...new Set((d.players||[]).map(p=>fullName(p.name)).filter(Boolean))].sort();for(let i=0;i<n.length;i++)for(let j=i+1;j<n.length;j++){const k=n[i]+" + "+n[j];m.set(k,(m.get(k)||0)+1)}});return [...m].map(([name,count])=>({name,count,pct:ds.length?100*count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))}
function empty(){return '<div class="empty">No completed drafts captured for this scope yet.</div>'}
function render(){const ds=filtered(),ps=playerStats(ds),cs=comboStats(ds);$("draftCount").textContent=ds.length;$("playerCount").textContent=ps.length;$("comboCount").textContent=cs.length;const q=$("search").value.toLowerCase();if(activeTab==="drafts"){$("view").innerHTML=ds.length?ds.map(d=>`<div class="row"><div><b>${esc(d.contest)}</b><br><small>${esc((d.players||[]).map(p=>fullName(p.name)).join(", "))}</small></div><div></div><div class="num">${new Date(d.capturedAt).toLocaleDateString()}</div></div>`).join(""):empty();return}const rows=(activeTab==="players"?ps:cs).filter(x=>x.name.toLowerCase().includes(q));$("view").innerHTML=rows.length?rows.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="bar"><i style="width:${Math.min(100,x.pct)}%"></i></div></div><div class="num">${x.count}/${ds.length}</div><div class="pct">${x.pct.toFixed(1)}%</div></div>`).join(""):empty()}
async function readStorage(scopeOverride=null){
 const d=await chrome.storage.local.get({drafts:[],exposureScope:{sport:"ALL",contest:"ALL"},lastSelectedContest:"ALL",playerUniverse:{},officialExposure:{}});
 allDrafts=d.drafts||[];playerUniverse=d.playerUniverse||{};officialExposure=d.officialExposure||{};
 const scope=scopeOverride||d.exposureScope||{sport:"ALL",contest:d.lastSelectedContest||"ALL"};buildFilters(scope.sport,scope.contest);render();
 const n=filtered().length;status(n?"Ready · "+n+" drafts tracked":"No drafts captured yet","ok");return d;
}
async function load(){const first=await readStorage(),scope=first.exposureScope||{sport:"ALL",contest:first.lastSelectedContest||"ALL"};try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id){await chrome.tabs.sendMessage(tab.id,{type:"NUKE_FORCE_SCAN"});await readStorage(scope)}}catch{}}
$("sport").addEventListener("change",async()=>{buildFilters($("sport").value,"ALL");await persist();render();status("Ready · "+filtered().length+" drafts tracked","ok")});
$("contest").addEventListener("change",async()=>{await persist();render();status("Ready · "+filtered().length+" drafts tracked","ok")});
$("search").addEventListener("input",render);$("refresh").addEventListener("click",load);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeTab=b.dataset.tab;render()}));
chrome.storage.onChanged.addListener(async(ch,a)=>{if(a!=="local")return;if(ch.drafts||ch.officialExposure||ch.playerUniverse)await readStorage()});
load();