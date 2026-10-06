const Core=globalThis.NukeExposure;
let knownTournaments=[],activePageScope=null;
let activeTab="players",allDrafts=[],officialExposure={};const $=id=>document.getElementById(id);const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function status(t,s="working"){$("syncText").textContent=t;$("syncStatus").className="sync "+s}
const cleanContest=s=>String(s??"").replace(/\s+/g," ").trim();
function validContestName(name){
 const x=cleanContest(name);if(!x||x===Core.NONE||x==="ALL"||x.length>100)return false;
 // Only real contest/tournament names belong here. Lobby categories, countdowns,
 // promo labels and draft-room statuses must never become scope choices.
 if(/^waiting(?:\s+for)?(?:\s+\d+)?(?:\s+more)?(?:\s+(?:people|person|players?|spots?))?$/i.test(x))return false;
 if(/^(?:filled|draft full|starting soon|on the clock|your turn)$/i.test(x))return false;
 if(/^\$[\d,.]+\s+drafts?$/i.test(x))return false;
 if(/^\d+\s+picks?\s+away$/i.test(x))return false;
 if(/^\d+(?:\.\d+)?%\s+.+\bboost$/i.test(x)||/\bboost$/i.test(x))return false;
 if(/^draft starts in\b/i.test(x))return false;
 if(/^(?:battle royales?|best ball|completed drafts?)$/i.test(x))return false;
 if(/^(?:active drafts?|add picks?|basic tournament info|daily|slates?|lobby|active|completed|players|drafts|your teams?|your picks|home|rankings|exposure|entry|entries|prizes?|games|entrants|enter|draft now)$/i.test(x))return false;
 if(/^(?:NFL|NBA|MLB|NHL|PGA|MMA|WNBA|CFB|CBB|Soccer)\b.*(?:slate|drafts?|picks?)\b/i.test(x))return false;
 return true;
}
const validContestChoice=x=>x===Core.NONE||x==="ALL"||validContestName(x);
function sports(){return ["ALL",...[...new Set([...allDrafts.map(d=>d.sport),...knownTournaments.map(d=>d.sport),activePageScope?.sport].filter(Boolean))].sort()]}
function buildFilters(prefSport,prefContest){
 const sport=prefSport||$("sport").value||"ALL";
 $("sport").innerHTML=sports().map(x=>`<option value="${esc(x)}" ${x===sport?"selected":""}>${esc(x==="ALL"?"ALL SPORTS":x)}</option>`).join("");
 const valid=[...allDrafts,...knownTournaments,activePageScope||{}].filter(d=>validContestName(d?.contest)&&(sport==="ALL"||d.sport===sport));
 const contests=[Core.NONE,"ALL",...[...new Set(valid.map(d=>d.contest))].sort()];
 if(validContestName(prefContest)&&!contests.includes(prefContest))contests.push(prefContest);
 const requested=validContestChoice(prefContest)?prefContest:validContestChoice($("contest").value)?$("contest").value:Core.NONE;
 const contest=contests.includes(requested)?requested:Core.NONE;
 $("contest").innerHTML=contests.map(x=>`<option value="${esc(x)}" ${x===contest?"selected":""}>${esc(x===Core.NONE?"CHOOSE TOURNAMENT":x==="ALL"?"ALL TOURNAMENTS":x)}</option>`).join("");
}
async function persist(){await chrome.storage.local.set({exposureScope:{sport:$("sport").value||"ALL",contest:$("contest").value||"ALL"},lastSelectedContest:$("contest").value||"ALL"})}
function filtered(){const s=$("sport").value,c=$("contest").value;return displayDrafts().filter(d=>(s==="ALL"||d.sport===s)&&(c==="ALL"||d.contest===c))}
let playerUniverse={};
const norm=s=>String(s||"").trim().toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,"").replace(/\s+/g," ");
const tokens=s=>norm(s).split(" ").filter(Boolean);
const aliases=s=>{const a=tokens(s);if(!a.length)return[];const out=[norm(s),a.at(-1)];if(a.length>1)out.push(a.slice(-2).join(" "));if(/^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1)out.push(a.at(-2));return[...new Set(out)]};
const validBuilds=new Set(["1|2|2|1","1|1|3|1","1|1|2|2"]);
function identityPool(){return Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],playerUniverse,allDrafts,officialExposure)}
function identityCandidates(raw,pool=identityPool()){return Core.candidates(typeof raw==="string"?{name:raw}:raw,pool)}
function resolveRoster(players){return Core.resolveRoster?Core.resolveRoster(players,identityPool(),$("sport")?.value||""):(players||[]).map(p=>Core.resolve(p,identityPool()))}
function syntheticDraft(d){const id=String(d?.draftId||"");return!id||id.startsWith("dom|")||id.includes("|")||d?.source==="completed-dom"||d?.source==="legacy-dom"}
function displayDrafts(){return Core.displayDrafts(allDrafts,identityPool())}
function fullName(raw){return Core.label(Core.resolve(typeof raw==="string"?{name:raw}:raw,identityPool()))}
function playerStats(ds){
 const m=new Map(),scope={sport:$("sport").value,contest:$("contest").value};
 ds.forEach(d=>{const seen=new Set();(d.players||[]).forEach(p=>{const name=fullName(p),key=norm(p.name);if(!key||seen.has(key))return;seen.add(key);const cur=m.get(key)||{name,count:0};cur.count++;m.set(key,cur)})});
 for(const [key,o] of Object.entries(officialExposure||{})){
  const count=Core.officialCount(o,scope,ds.length);if(count===null)continue;
  const p=Core.resolve(o,identityPool());m.set(norm(p.name)||key,{name:Core.label(p),count,official:true});
 }
 return [...m.values()].map(x=>({...x,pct:ds.length?100*x.count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))
}
function comboStats(ds){const m=new Map();ds.forEach(d=>{const n=[...new Set((d.players||[]).map(p=>fullName(p)).filter(Boolean))].sort();for(let i=0;i<n.length;i++)for(let j=i+1;j<n.length;j++){const k=n[i]+" + "+n[j];m.set(k,(m.get(k)||0)+1)}});return [...m].map(([name,count])=>({name,count,pct:ds.length?100*count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))}
function empty(){return '<div class="empty">No completed drafts captured for this scope yet.</div>'}
function render(){const ds=filtered(),ps=playerStats(ds),cs=comboStats(ds);$("draftCount").textContent=ds.length;$("playerCount").textContent=ps.length;$("comboCount").textContent=cs.length;const q=$("search").value.toLowerCase();if(activeTab==="drafts"){$("view").innerHTML=ds.length?ds.map(d=>`<div class="row"><div><b>${esc(d.contest)}</b><br><small>${esc((d.players||[]).map(p=>fullName(p)).join(", "))}</small></div><div></div><div class="num">${new Date(d.capturedAt).toLocaleDateString()}</div></div>`).join(""):empty();return}const rows=(activeTab==="players"?ps:cs).filter(x=>x.name.toLowerCase().includes(q));$("view").innerHTML=rows.length?rows.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="bar"><i style="width:${Math.min(100,x.pct)}%"></i></div></div><div class="num">${x.count}/${ds.length}</div><div class="pct">${x.pct.toFixed(1)}%</div></div>`).join(""):empty()}
async function readStorage(scopeOverride=null){
 const d=await chrome.storage.local.get({drafts:[],exposureScope:{sport:"ALL",contest:"ALL"},lastSelectedContest:"ALL",playerUniverse:{},officialExposure:{},knownTournaments:[],activePageScope:null});
 const rawKnown=d.knownTournaments||[];
 knownTournaments=rawKnown.filter(x=>validContestName(x?.contest));
 activePageScope=validContestName(d.activePageScope?.contest)?d.activePageScope:null;
 // Ignore any false draft records whose "contest" was actually a live draft-room status.
 allDrafts=(d.drafts||[]).filter(x=>validContestName(x?.contest));
 playerUniverse=d.playerUniverse||{};officialExposure=d.officialExposure||{};
 const rawScope=scopeOverride||d.exposureScope||{sport:"ALL",contest:d.lastSelectedContest||"ALL"};
 const fallback=activePageScope||{sport:rawScope?.sport||"ALL",contest:Core.NONE};
 const scope=validContestChoice(rawScope?.contest)?{sport:rawScope?.sport||"ALL",contest:rawScope.contest}:fallback;
 buildFilters(scope.sport,scope.contest);render();
 const updates={};
 if(knownTournaments.length!==rawKnown.length)updates.knownTournaments=knownTournaments;
 if(d.exposureScope&&!validContestChoice(d.exposureScope.contest))updates.exposureScope=scope;
 if(d.lastSelectedContest&&!validContestChoice(d.lastSelectedContest))updates.lastSelectedContest=scope.contest;
 if(Object.keys(updates).length)await chrome.storage.local.set(updates);
 const n=filtered().length;status(n?"Ready · "+n+" drafts tracked":"No drafts captured yet","ok");return d;
}
async function load(){
 await readStorage();
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id){const result=await chrome.tabs.sendMessage(tab.id,{type:"NUKE_FORCE_SCAN"});await readStorage(validContestName(result?.scope?.contest)?result.scope:null)}}catch{}
}
$("sport").addEventListener("change",async()=>{buildFilters($("sport").value,"ALL");await persist();render();status("Ready · "+filtered().length+" drafts tracked","ok")});
$("contest").addEventListener("change",async()=>{await persist();render();status("Ready · "+filtered().length+" drafts tracked","ok")});
$("search").addEventListener("input",render);$("refresh").addEventListener("click",load);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeTab=b.dataset.tab;render()}));
chrome.storage.onChanged.addListener(async(ch,a)=>{if(a!=="local")return;if(ch.drafts||ch.officialExposure||ch.playerUniverse||ch.exposureScope||ch.knownTournaments||ch.activePageScope)await readStorage()});
load();
