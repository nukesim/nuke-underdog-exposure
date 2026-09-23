(() => {
const clean=s=>(s||"").replace(/\s+/g," ").trim();let timer,running=false,alive=true;
function safe(fn){if(!alive)return Promise.resolve(null);try{return Promise.resolve(fn())}catch(e){if(String(e).includes("Extension context invalidated"))alive=false;return Promise.resolve(null)}}
function selectedContest(){
 const cards=[...document.querySelectorAll("body *")].filter(el=>{const t=clean(el.innerText);return /\d+(?:\.\d+)?\s*Projected/i.test(t)&&t.split(",").length>=6});
 if(!cards.length)return "Unknown Contest";
 const candidates=[...document.querySelectorAll("body *")].filter(el=>{const t=clean(el.textContent);return t.length>2&&t.length<70&&!/Projected/i.test(t)&&el.getBoundingClientRect().height>0});
 const known=candidates.map(el=>clean(el.textContent)).filter(t=>/Battle Royale|The Hurry Up|Prime Time|Playbook/i.test(t));
 return known.find(t=>document.body.innerText.includes(t))||"Unknown Contest";
}
function tournament(text){const m=text.match(/Battle Royale\s*-?\s*Week\s*\d+/i);if(m)return m[0].replace(/royale/i,"Royale");const exact=[...document.querySelectorAll("body *")].map(x=>clean(x.textContent)).filter(t=>t.length>2&&t.length<60);return exact.find(t=>/^(The Hurry Up|Prime Time Da Bomb|The PTP Playbook)$/i.test(t))||"Unknown Contest"}
function rosterStrings(){const out=[];for(const el of document.querySelectorAll("body *")){if(el.children.length>4)continue;const lines=(el.innerText||"").split("\n").map(clean).filter(Boolean);for(let i=0;i<lines.length;i++){if(/^\d+(?:\.\d+)?\s*Projected$/i.test(lines[i])){const next=lines[i+1]||"";if((next.match(/,/g)||[]).length===5)out.push(next)}}}return [...new Set(out)]}
function completedRosters(){return rosterStrings().map(s=>s.split(",").map(clean).filter(Boolean).slice(0,6).map(name=>({name}))).filter(ps=>ps.length===6)}
async function syncCompleted(){if(!alive)return 0;const text=clean(document.body?.innerText);if(!/Completed/i.test(text))return 0;let contest=tournament(text);const rosters=completedRosters();if(contest==="Unknown Contest"||!rosters.length)return 0;for(const ps of rosters){if(!alive)break;const key=[contest,...ps.map(p=>p.name).sort()].join("|");await safe(()=>chrome.runtime.sendMessage({type:"NUKE_SAVE_DRAFT",draft:{draftId:key,sport:"NFL",format:"Daily Draft",contest,players:ps,sourceUrl:location.href,capturedAt:new Date().toISOString()}}))}return rosters.length}
async function exposures(){if(!alive)return null;const data=await safe(()=>chrome.storage.local.get({drafts:[]}));if(!data)return null;const drafts=data.drafts||[];let contest=tournament(clean(document.body?.innerText));if(contest==="Unknown Contest"&&location.pathname.includes("/draft/")){const names=[...new Set(drafts.map(d=>d.contest).filter(Boolean))],br=names.filter(x=>/Battle Royale/i.test(x));if(br.length===1)contest=br[0];else if(names.length===1)contest=names[0]}if(contest==="Unknown Contest")return null;const ds=drafts.filter(d=>d.contest===contest),m=new Map();ds.forEach(d=>[...new Set((d.players||[]).map(p=>p.name))].forEach(n=>m.set(n,(m.get(n)||0)+1)));return {contest,total:ds.length,map:m}}
function leafText(name){return [...document.querySelectorAll("body *")].filter(el=>!el.children.length&&clean(el.textContent)===name&&el.getBoundingClientRect().height>0)}
function badge(name,count,total){const b=document.createElement("span");b.dataset.nukeExposure="1";b.className="nuke-exposure-badge";b.textContent=`EXP ${(count/total*100).toFixed(0)}% · ${count}/${total}`;return b}
function addBadges(ex){document.querySelectorAll("[data-nuke-exposure]").forEach(x=>x.remove());if(!ex||!ex.total)return;for(const [name,count] of ex.map)for(const el of leafText(name))el.insertAdjacentElement("afterend",badge(name,count,ex.total))}
async function scan(){if(running||!alive)return 0;running=true;try{const n=await syncCompleted();addBadges(await exposures());return n}finally{running=false}}
try{chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{if(msg?.type==="NUKE_FORCE_SCAN"){scan().then(n=>sendResponse({ok:true,captured:n}));return true}})}catch(e){alive=false}
const obs=new MutationObserver(()=>{if(!alive){obs.disconnect();return}clearTimeout(timer);timer=setTimeout(scan,800)});obs.observe(document.documentElement,{childList:true,subtree:true});
try{chrome.storage.onChanged.addListener(()=>{if(!alive)return;clearTimeout(timer);timer=setTimeout(scan,300)})}catch(e){alive=false}
setTimeout(scan,800);const interval=setInterval(()=>{if(!alive){clearInterval(interval);obs.disconnect();return}scan()},4000);
})();