const Core=globalThis.NukeExposure;
let knownTournaments=[],activePageScope=null;
let activeTab="players",allDrafts=[],officialExposure={};const $=id=>document.getElementById(id);const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function status(t,s="working"){$("syncText").textContent=t;$("syncStatus").className="sync "+s}
const cleanContest=s=>String(s??"").replace(/\s+/g," ").trim();
function validContestName(name){
 const x=cleanContest(name);if(!x||x===Core.NONE||x==="ALL"||x.length>100)return false;
 if(/^waiting(?:\s+for)?(?:\s+\d+)?(?:\s+more)?(?:\s+(?:people|person|players?|spots?))?$/i.test(x))return false;
 if(/^(?:filled|draft full|starting soon|on the clock|your turn)$/i.test(x))return false;
 if(/^\$[\d,.]+\s+drafts?$/i.test(x))return false;
 if(/^\d+\s+picks?\s+away$/i.test(x))return false;
 if(/^\d+(?:\.\d+)?%\s+.+\bboost$/i.test(x)||/\bboost$/i.test(x))return false;
 if(/^draft starts in\b/i.test(x))return false;
 if(/^(?:battle royales?|best ball|completed drafts?|underdog|qb|rb|wr|te)$/i.test(x))return false;
 if(/^(?:active drafts?|add picks?|basic tournament info|daily|slates?|lobby|active|completed|players|drafts|your teams?|your picks|home|rankings|exposure|entry|entries|prizes?|games|entrants|enter|draft now)$/i.test(x))return false;
 if(/^(?:NFL|NBA|MLB|NHL|PGA|MMA|WNBA|CFB|CBB|Soccer)\b.*(?:slate|drafts?|picks?)\b/i.test(x))return false;
 return true;
}
const validContestChoice=x=>x===Core.NONE||x==="ALL"||validContestName(x);
const norm=s=>String(s||"").trim().toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,"").replace(/\s+/g," ");
const tokens=s=>norm(s).split(" ").filter(Boolean);
function sports(){return ["ALL",...[...new Set(allDrafts.map(d=>d.sport).filter(Boolean))].sort()]}
function buildFilters(prefSport,prefContest){
 const availableSports=sports();
 const wantedSport=prefSport||$("sport").value||"ALL";
 const sport=availableSports.includes(wantedSport)?wantedSport:(availableSports.includes("NFL")?"NFL":"ALL");
 $("sport").innerHTML=availableSports.map(x=>`<option value="${esc(x)}" ${x===sport?"selected":""}>${esc(x==="ALL"?"ALL SPORTS":x)}</option>`).join("");
 // Tournament choices come ONLY from actual captured completed drafts. Never from
 // arbitrary Underdog headings/API labels. This permanently prevents QB/RB/WR,
 // countdowns, lobby categories, boosts, etc. from appearing in this dropdown.
 const valid=allDrafts.filter(d=>validContestName(d?.contest)&&(sport==="ALL"||d.sport===sport));
 const contests=[Core.NONE,"ALL",...[...new Set(valid.map(d=>d.contest))].sort()];
 const current=$("contest").value;
 const requested=contests.includes(prefContest)?prefContest:contests.includes(current)?current:contests.length===3?contests[2]:Core.NONE;
 $("contest").innerHTML=contests.map(x=>`<option value="${esc(x)}" ${x===requested?"selected":""}>${esc(x===Core.NONE?"CHOOSE TOURNAMENT":x==="ALL"?"ALL TOURNAMENTS":x)}</option>`).join("");
}
async function persist(){await chrome.storage.local.set({exposureScope:{sport:$("sport").value||"ALL",contest:$("contest").value||Core.NONE},lastSelectedContest:$("contest").value||Core.NONE})}
let playerUniverse={};
function identityPool(){return Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],playerUniverse,allDrafts,officialExposure)}
function displayDrafts(){return Core.displayDrafts(allDrafts,identityPool())}
function filtered(){const s=$("sport").value,c=$("contest").value;return displayDrafts().filter(d=>(s==="ALL"||d.sport===s)&&(c==="ALL"||c===Core.NONE?c!==Core.NONE:d.contest===c))}
function scopedNameMap(ds){
 const bySurname=new Map();
 for(const d of ds)for(const p of (d.players||[])){
  if(p?.unresolved||tokens(p?.name).length<2)continue;
  const surname=tokens(p.name).at(-1);if(!surname)continue;
  if(!bySurname.has(surname))bySurname.set(surname,p.name);
  else if(bySurname.get(surname)!==p.name)bySurname.set(surname,null);
 }
 return bySurname;
}
function displayName(p,bySurname){
 const resolved=Core.resolve(typeof p==="string"?{name:p}:p,identityPool());
 if(!resolved.unresolved)return resolved.name;
 const parts=tokens(resolved.name);
 if(parts.length===1){const full=bySurname.get(parts[0]);if(full)return full}
 return Core.label(resolved);
}
function playerStats(ds){
 const m=new Map(),scope={sport:$("sport").value,contest:$("contest").value},bySurname=scopedNameMap(ds);
 ds.forEach(d=>{const seen=new Set();(d.players||[]).forEach(p=>{const name=displayName(p,bySurname),key=norm(name);if(!key||seen.has(key))return;seen.add(key);const cur=m.get(key)||{name,count:0};cur.count++;m.set(key,cur)})});
 for(const o of Object.values(officialExposure||{})){
  const count=Core.officialCount(o,scope,ds.length);if(count===null)continue;
  const p=Core.resolve(o,identityPool()),name=displayName(p,bySurname),key=norm(name);m.set(key,{name,count,official:true});
 }
 return [...m.values()].map(x=>({...x,pct:ds.length?100*x.count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))
}
function comboStats(ds){const m=new Map(),bySurname=scopedNameMap(ds);ds.forEach(d=>{const n=[...new Set((d.players||[]).map(p=>displayName(p,bySurname)).filter(Boolean))].sort();for(let i=0;i<n.length;i++)for(let j=i+1;j<n.length;j++){const k=n[i]+" + "+n[j];m.set(k,(m.get(k)||0)+1)}});return [...m].map(([name,count])=>({name,count,pct:ds.length?100*count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))}
function empty(){return '<div class="empty">No completed drafts captured for this scope yet.</div>'}
function render(){
 const ds=filtered(),ps=playerStats(ds),cs=comboStats(ds),bySurname=scopedNameMap(ds);$("draftCount").textContent=ds.length;$("playerCount").textContent=ps.length;$("comboCount").textContent=cs.length;const q=$("search").value.toLowerCase();
 if(activeTab==="drafts"){$("view").innerHTML=ds.length?ds.map(d=>`<div class="row"><div><b>${esc(d.contest)}</b><br><small>${esc((d.players||[]).map(p=>displayName(p,bySurname)).join(", "))}</small></div><div></div><div class="num">${new Date(d.capturedAt).toLocaleDateString()}</div></div>`).join(""):empty();return}
 const rows=(activeTab==="players"?ps:cs).filter(x=>x.name.toLowerCase().includes(q));$("view").innerHTML=rows.length?rows.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="bar"><i style="width:${Math.min(100,x.pct)}%"></i></div></div><div class="num">${x.count}/${ds.length}</div><div class="pct">${x.pct.toFixed(1)}%</div></div>`).join(""):empty()
}
async function readStorage(scopeOverride=null){
 const d=await chrome.storage.local.get({drafts:[],exposureScope:{sport:"ALL",contest:Core.NONE},lastSelectedContest:Core.NONE,playerUniverse:{},officialExposure:{},knownTournaments:[],activePageScope:null});
 allDrafts=(d.drafts||[]).filter(x=>validContestName(x?.contest));playerUniverse=d.playerUniverse||{};officialExposure=d.officialExposure||{};
 // Keep the legacy knownTournaments key clean, but never use it to build UI choices.
 knownTournaments=[...new Map(allDrafts.map(x=>[JSON.stringify([x.sport,x.contest]),{sport:x.sport,contest:x.contest}])).values()];
 activePageScope=validContestName(d.activePageScope?.contest)?d.activePageScope:null;
 const raw=scopeOverride||d.exposureScope||{sport:"ALL",contest:d.lastSelectedContest||Core.NONE};
 buildFilters(raw?.sport||"ALL",raw?.contest||Core.NONE);render();
 const updates={};
 if(JSON.stringify(d.knownTournaments||[])!==JSON.stringify(knownTournaments))updates.knownTournaments=knownTournaments;
 const chosen={sport:$("sport").value||"ALL",contest:$("contest").value||Core.NONE};
 if(!d.exposureScope||d.exposureScope.sport!==chosen.sport||d.exposureScope.contest!==chosen.contest)updates.exposureScope=chosen;
 if(d.lastSelectedContest!==chosen.contest)updates.lastSelectedContest=chosen.contest;
 if(Object.keys(updates).length)await chrome.storage.local.set(updates);
 const n=filtered().length;status(n?"Ready · "+n+" drafts tracked":"No drafts captured yet","ok");return d;
}
async function load(){
 await readStorage();
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id){const result=await chrome.tabs.sendMessage(tab.id,{type:"NUKE_FORCE_SCAN"});await readStorage(result?.scope||null)}}catch{}
}
$("sport").addEventListener("change",async()=>{buildFilters($("sport").value,"ALL");await persist();render();status("Ready · "+filtered().length+" drafts tracked","ok")});
$("contest").addEventListener("change",async()=>{await persist();render();status("Ready · "+filtered().length+" drafts tracked","ok")});
$("search").addEventListener("input",render);$("refresh").addEventListener("click",load);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeTab=b.dataset.tab;render()}));
chrome.storage.onChanged.addListener(async(ch,a)=>{if(a!=="local")return;if(ch.drafts||ch.officialExposure||ch.playerUniverse)await readStorage()});
load();
