let activeTab="players",allDrafts=[],officialExposure={},entryTotals={};const $=id=>document.getElementById(id);const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#039;"}[c]));
function status(t,s="working"){$("syncText").textContent=t;$("syncStatus").className="sync "+s}
function sports(){return ["ALL",...[...new Set(allDrafts.map(d=>d.sport).filter(Boolean))].sort()]}
function buildFilters(prefSport,prefContest){const sport=prefSport||$("sport").value||"ALL";$("sport").innerHTML=sports().map(x=>`<option ${x===sport?"selected":""}>${esc(x==="ALL"?"ALL SPORTS":x)}</option>`).join("");const valid=allDrafts.filter(d=>sport==="ALL"||d.sport===sport);const contests=["ALL",...[...new Set(valid.map(d=>d.contest).filter(Boolean))].sort()];const contest=contests.includes(prefContest)?prefContest:(contests.includes($("contest").value)?$("contest").value:"ALL");$("contest").innerHTML=contests.map(x=>`<option ${x===contest?"selected":""}>${esc(x==="ALL"?"ALL TOURNAMENTS":x)}</option>`).join("")}
async function persist(){await chrome.storage.local.set({exposureScope:{sport:$("sport").value||"ALL",contest:$("contest").value||"ALL"},lastSelectedContest:$("contest").value||"ALL"})}
function filtered(){const s=$("sport").value,c=$("contest").value;return allDrafts.filter(d=>(s==="ALL"||d.sport===s)&&(c==="ALL"||d.contest===c))}
let playerUniverse={};
const norm=s=>String(s||"").trim().toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,"").replace(/\s+/g," ");
const tokens=s=>norm(s).split(" ").filter(Boolean);
const aliases=s=>{const a=tokens(s);if(!a.length)return[];const out=[norm(s),a.at(-1)];if(a.length>1)out.push(a.slice(-2).join(" "));if(/^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1)out.push(a.at(-2));return[...new Set(out)]};
const contestNorm=s=>String(s||"").trim().replace(/\s*-\s*/g," - ").replace(/\s+/g," ");
const entryTotalKey=(sport,contest)=>norm(sport||"UNKNOWN")+"::"+norm(contestNorm(contest||""));
const wildcardEntryTotalKey=contest=>"*::"+norm(contestNorm(contest||""));
function nameMatchStrength(a,b){const na=norm(a),nb=norm(b);if(!na||!nb)return 0;if(na===nb)return 4;const at=tokens(a),bt=tokens(b);if(at.length<bt.length&&aliases(b).includes(na))return at.length===1?1:2;if(bt.length<at.length&&aliases(a).includes(nb))return bt.length===1?1:2;return 0}
function knownFullNames(){const m=new Map(),add=n=>{n=String(n||"").trim();if(tokens(n).length>=2)m.set(norm(n),n)};Object.values(playerUniverse||{}).forEach(x=>add(x?.name));Object.values(officialExposure||{}).forEach(x=>add(x?.name));allDrafts.forEach(d=>(d.players||[]).forEach(p=>add(p?.name)));return[...m.values()]}
function scopedOfficial(ds){const s=$("sport").value||"ALL",c=$("contest").value||"ALL",m=new Map();for(const o of Object.values(officialExposure||{})){if(!o||!Number.isFinite(Number(o.count))||Number(o.total||0)!==Number(ds.length||0))continue;if(o.sport&&s!=="ALL"&&String(o.sport).toUpperCase()!==String(s).toUpperCase())continue;if(o.contest&&c!=="ALL"&&contestNorm(o.contest)!==contestNorm(c))continue;const k=norm(o.name);const prev=m.get(k);if(!prev||Number(o.capturedAt||0)>=Number(prev.capturedAt||0))m.set(k,o)}return[...m.values()]}
function expectedTotal(){const s=$("sport").value||"ALL",c=$("contest").value||"ALL";if(c==="ALL")return 0;return Number(entryTotals?.[entryTotalKey(s,c)]||entryTotals?.[wildcardEntryTotalKey(c)]||0)}

function fullName(raw){
 const key=norm(raw);if(!key)return String(raw||"");
 if(tokens(raw).length>=2)return String(raw);
 if(playerUniverse[key]?.name&&tokens(playerUniverse[key].name).length>=2)return playerUniverse[key].name;
 const candidates=knownFullNames().filter(full=>nameMatchStrength(raw,full)>0);
 return candidates.length===1?candidates[0]:String(raw);
}
function playerStats(ds){
 const m=new Map();
 ds.forEach(d=>{const seen=new Set();(d.players||[]).forEach(p=>{const name=fullName(p.name),key=norm(name);if(!key||seen.has(key))return;seen.add(key);const cur=m.get(key)||{name,count:0};cur.name=name;cur.count++;m.set(key,cur)})});
 const official=scopedOfficial(ds);
 // Exact Underdog exposure rows replace legacy surname-only rows. This is what
 // keeps the popup on full names even when old completed cards said only "Gibbs".
 for(const o of official){
  const key=norm(o.name);if(Number(o.count)>0)m.set(key,{name:o.name,count:Number(o.count),official:true});
 }
 for(const [key,row] of [...m]){
  if(row.official)continue;
  const covered=official.some(o=>norm(o.name)!==key&&nameMatchStrength(row.name,o.name)>0);
  if(covered)m.delete(key);
 }
 return [...m.values()].map(x=>({...x,pct:ds.length?100*x.count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))
}
function comboStats(ds){const m=new Map();ds.forEach(d=>{const n=[...new Set((d.players||[]).map(p=>fullName(p.name)).filter(Boolean))].sort();for(let i=0;i<n.length;i++)for(let j=i+1;j<n.length;j++){const k=n[i]+" + "+n[j];m.set(k,(m.get(k)||0)+1)}});return [...m].map(([name,count])=>({name,count,pct:ds.length?100*count/ds.length:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name))}
function empty(){return '<div class="empty">No completed drafts captured for this scope yet.</div>'}
function render(){const ds=filtered(),ps=playerStats(ds),cs=comboStats(ds);$("draftCount").textContent=ds.length;$("playerCount").textContent=ps.length;$("comboCount").textContent=cs.length;const q=$("search").value.toLowerCase();if(activeTab==="drafts"){$("view").innerHTML=ds.length?ds.map(d=>`<div class="row"><div><b>${esc(d.contest)}</b><br><small>${esc((d.players||[]).map(p=>fullName(p.name)).join(", "))}</small></div><div></div><div class="num">${new Date(d.capturedAt).toLocaleDateString()}</div></div>`).join(""):empty();return}const rows=(activeTab==="players"?ps:cs).filter(x=>x.name.toLowerCase().includes(q));$("view").innerHTML=rows.length?rows.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="bar"><i style="width:${Math.min(100,x.pct)}%"></i></div></div><div class="num">${x.count}/${ds.length}</div><div class="pct">${x.pct.toFixed(1)}%</div></div>`).join(""):empty()}
async function load(){let d=await chrome.storage.local.get({drafts:[],exposureScope:{sport:"ALL",contest:"ALL"},lastSelectedContest:"ALL",playerUniverse:{},officialExposure:{},entryTotals:{}});allDrafts=d.drafts||[];playerUniverse=d.playerUniverse||{};officialExposure=d.officialExposure||{};entryTotals=d.entryTotals||{};const scope=d.exposureScope||{sport:"ALL",contest:d.lastSelectedContest||"ALL"};buildFilters(scope.sport,scope.contest);render();const setStatus=()=>{const ds=filtered(),expected=expectedTotal();status(ds.length?(expected?"Ready · "+ds.length+"/"+expected+" drafts":"Ready · "+ds.length+" drafts tracked"):"No drafts captured yet",expected&&ds.length!==expected?"working":"ok")};setStatus();try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id){await chrome.tabs.sendMessage(tab.id,{type:"NUKE_FORCE_SCAN"});d=await chrome.storage.local.get({drafts:[],exposureScope:{sport:"ALL",contest:"ALL"},playerUniverse:{},officialExposure:{},entryTotals:{}});allDrafts=d.drafts||[];playerUniverse=d.playerUniverse||{};officialExposure=d.officialExposure||{};entryTotals=d.entryTotals||{};buildFilters(d.exposureScope?.sport||scope.sport,d.exposureScope?.contest||scope.contest);render();setStatus()}}catch{} }
$("sport").addEventListener("change",async()=>{buildFilters($("sport").value,"ALL");await persist();render()});$("contest").addEventListener("change",async()=>{await persist();render()});$("search").addEventListener("input",render);$("refresh").addEventListener("click",load);document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeTab=b.dataset.tab;render()}));chrome.storage.onChanged.addListener(async(ch,a)=>{if(a!=="local")return;if(ch.drafts||ch.officialExposure||ch.playerUniverse||ch.entryTotals){const d=await chrome.storage.local.get({drafts:[],exposureScope:{sport:"ALL",contest:"ALL"},officialExposure:{},playerUniverse:{},entryTotals:{}});allDrafts=d.drafts||[];officialExposure=d.officialExposure||{};playerUniverse=d.playerUniverse||{};entryTotals=d.entryTotals||{};buildFilters(d.exposureScope?.sport||"ALL",d.exposureScope?.contest||"ALL");render();const ds=filtered(),expected=expectedTotal();status(ds.length?(expected?"Ready · "+ds.length+"/"+expected+" drafts":"Ready · "+ds.length+" drafts tracked"):"No drafts captured yet",expected&&ds.length!==expected?"working":"ok")}});load();