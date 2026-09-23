(() => {
const clean=s=>(s||"").replace(/\s+/g," ").trim();let timer,running=false;
function tournament(text){const m=text.match(/Battle Royale\s*-?\s*Week\s*\d+/i);if(m)return m[0].replace(/royale/i,"Royale");const m2=text.match(/(?:The Hurry Up|Prime Time Da Bomb|The PTP Playbook)/i);return m2?m2[0]:"Unknown Contest"}
function completedRosters(){
 const raw=document.body?.innerText||"",out=[],re=/\d+(?:\.\d+)?\s*Projected\s*\n\s*([^\n]+(?:,[^\n]+){5})/gi;let m;
 while((m=re.exec(raw))!==null){const names=m[1].split(",").map(clean).filter(Boolean).slice(0,6);if(names.length===6)out.push(names.map(name=>({name})))}
 const uniq=new Map();for(const ps of out)uniq.set(ps.map(p=>p.name).sort().join("|"),ps);return [...uniq.values()]
}
async function syncCompleted(){
 const raw=document.body?.innerText||"",text=clean(raw);if(!/Completed/i.test(text))return 0;
 const contest=tournament(text),rosters=completedRosters();if(contest==="Unknown Contest"||!rosters.length)return 0;
 for(const ps of rosters){const key=[contest,...ps.map(p=>p.name).sort()].join("|");await chrome.runtime.sendMessage({type:"NUKE_SAVE_DRAFT",draft:{draftId:key,sport:"NFL",format:"Daily Draft",contest,players:ps,sourceUrl:location.href,capturedAt:new Date().toISOString()}})}
 return rosters.length
}
async function exposures(){
 const {drafts=[]}=await chrome.storage.local.get({drafts:[]});let contest=tournament(clean(document.body?.innerText));
 if(contest==="Unknown Contest"&&location.pathname.includes("/draft/")){const names=[...new Set(drafts.map(d=>d.contest).filter(Boolean))];const br=names.filter(x=>/Battle Royale/i.test(x));if(br.length===1)contest=br[0];else if(names.length===1)contest=names[0]}
 if(contest==="Unknown Contest")return null;
 const ds=drafts.filter(d=>d.contest===contest),m=new Map();ds.forEach(d=>[...new Set((d.players||[]).map(p=>p.name))].forEach(n=>m.set(n,(m.get(n)||0)+1)));
 return {contest,total:ds.length,map:m}
}
function leafText(name){return [...document.querySelectorAll("body *")].filter(el=>!el.children.length&&clean(el.textContent)===name&&el.getBoundingClientRect().height>0)}
function badge(name,count,total){const b=document.createElement("span");b.dataset.nukeExposure="1";b.className="nuke-exposure-badge";b.textContent=`EXP ${(count/total*100).toFixed(0)}% · ${count}/${total}`;b.title=`${name}: ${count} of ${total} completed drafts`;return b}
function addBadges(ex){document.querySelectorAll("[data-nuke-exposure]").forEach(x=>x.remove());if(!ex||!ex.total)return;for(const [name,count] of ex.map){for(const el of leafText(name))el.insertAdjacentElement("afterend",badge(name,count,ex.total))}}
async function scan(){if(running)return 0;running=true;try{const n=await syncCompleted();addBadges(await exposures());return n}finally{running=false}}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{if(msg?.type==="NUKE_FORCE_SCAN"){scan().then(n=>sendResponse({ok:true,captured:n}));return true}});
const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,700)});obs.observe(document.documentElement,{childList:true,subtree:true});
chrome.storage.onChanged.addListener(()=>{clearTimeout(timer);timer=setTimeout(scan,300)});
setTimeout(scan,700);setInterval(scan,4000);
})();