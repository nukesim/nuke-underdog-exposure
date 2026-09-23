let activeTab = "players";
let allDrafts = [];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

async function load() {
  const data = await chrome.storage.local.get({ drafts: [] });
  allDrafts = data.drafts || [];
  buildFilters();
  render();
}

function buildFilters() {
  const currentWeek = $("week").value || "ALL";
  const weeks = [...new Set(allDrafts.map(d=>d.week).filter(Boolean))].sort();
  $("week").innerHTML = ["ALL",...weeks].map(x=>`<option ${x===currentWeek?"selected":""}>${esc(x)}</option>`).join("");
  buildContests();
}

function buildContests() {
  const week = $("week").value;
  const current = $("contest").value || "ALL";
  const contests = [...new Set(allDrafts.filter(d=>week==="ALL"||d.week===week).map(d=>d.contest).filter(Boolean))].sort();
  $("contest").innerHTML = ["ALL",...contests].map(x=>`<option ${x===current?"selected":""}>${esc(x)}</option>`).join("");
}

function filtered() {
  const w=$("week").value,c=$("contest").value;
  return allDrafts.filter(d=>(w==="ALL"||d.week===w)&&(c==="ALL"||d.contest===c));
}

function playerStats(ds) {
  const m=new Map();
  ds.forEach(d=>(d.players||[]).forEach(p=>m.set(p.name,(m.get(p.name)||0)+1)));
  return [...m].map(([name,count])=>({name,count,pct:ds.length?count/ds.length*100:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name));
}

function comboStats(ds) {
  const m=new Map();
  ds.forEach(d=>{
    const names=[...new Set((d.players||[]).map(p=>p.name))].sort();
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const k=names[i]+" + "+names[j];m.set(k,(m.get(k)||0)+1)}
  });
  return [...m].map(([name,count])=>({name,count,pct:ds.length?count/ds.length*100:0})).sort((a,b)=>b.pct-a.pct||a.name.localeCompare(b.name));
}

function render() {
  const ds=filtered(), ps=playerStats(ds), cs=comboStats(ds);
  $("draftCount").textContent=ds.length;$("playerCount").textContent=ps.length;$("comboCount").textContent=cs.length;
  const q=$("search").value.toLowerCase();
  if(activeTab==="drafts"){
    $("view").innerHTML=ds.length?ds.map(d=>`<div class="row"><div><b>${esc(d.contest)}</b><br><small>${esc(d.week)} · ${esc((d.players||[]).map(p=>p.name).join(", "))}</small></div><div></div><div class="num">${new Date(d.capturedAt).toLocaleDateString()}</div></div>`).join(""):empty();
    return;
  }
  const rows=(activeTab==="players"?ps:cs).filter(x=>x.name.toLowerCase().includes(q));
  $("view").innerHTML=rows.length?rows.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="bar"><i style="width:${Math.min(100,x.pct)}%"></i></div></div><div class="num">${x.count}/${ds.length}</div><div class="pct">${x.pct.toFixed(1)}%</div></div>`).join(""):empty();
}
function empty(){return '<div class="empty">No completed drafts captured for this filter yet.<br>Keep Underdog open and finish a draft.</div>'}

$("week").addEventListener("change",()=>{buildContests();render()});
$("contest").addEventListener("change",render);
$("search").addEventListener("input",render);
$("refresh").addEventListener("click",load);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeTab=b.dataset.tab;render()}));
chrome.storage.onChanged.addListener(()=>load());
load();
