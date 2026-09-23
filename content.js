(() => {
const clean=s=>(s||"").replace(/\s+/g," ").trim();let timer,running=false,alive=true;
function safe(fn){if(!alive)return Promise.resolve(null);try{return Promise.resolve(fn())}catch(e){if(String(e).includes("Extension context invalidated"))alive=false;return Promise.resolve(null)}}
function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0}
function activeContest(){
 const projected=[...document.querySelectorAll("body *")].find(el=>visible(el)&&/^\d+(?:\.\d+)?\s*Projected$/i.test(clean(el.textContent)));
 if(!projected)return "Unknown Contest";
 let box=projected;
 for(let i=0;i<12&&box;i++,box=box.parentElement){const els=[...box.querySelectorAll("*")].filter(visible).map(x=>clean(x.textContent)).filter(x=>x.length>2&&x.length<80);const title=els.find(x=>/^(Battle Royale\s*-?\s*Week\s*\d+|The Hurry Up|Prime Time Da Bomb|The PTP Playbook)$/i.test(x));if(title)return title.replace(/royale/i,"Royale")}
 const all=[...document.querySelectorAll("body *")].filter(visible).map(x=>clean(x.textContent)).filter(x=>x.length>2&&x.length<80),titles=all.filter(x=>/^(Battle Royale\s*-?\s*Week\s*\d+|The Hurry Up|Prime Time Da Bomb|The PTP Playbook)$/i.test(x));return titles.length===1?titles[0].replace(/royale/i,"Royale"):"Unknown Contest"
}
function rosterStrings(){const out=[];for(const el of document.querySelectorAll("body *")){if(el.children.length>4)continue;const lines=(el.innerText||"").split("\n").map(clean).filter(Boolean);for(let i=0;i<lines.length;i++)if(/^\d+(?:\.\d+)?\s*Projected$/i.test(lines[i])){const next=lines[i+1]||"";if((next.match(/,/g)||[]).length===5)out.push(next)}}return [...new Set(out)]}
function completedRosters(){return rosterStrings().map(s=>s.split(",").map(clean).filter(Boolean).slice(0,6).map(name=>({name}))).filter(ps=>ps.length===6)}
async function repairAndSync(){if(!alive||!location.pathname.includes("/completed/"))return 0;const contest=activeContest(),rosters=completedRosters();if(contest==="Unknown Contest"||!rosters.length)return 0;const data=await safe(()=>chrome.storage.local.get({drafts:[]}));if(!data)return 0;let drafts=data.drafts||[];const keys=new Set(rosters.map(ps=>ps.map(p=>p.name).sort().join("|")));drafts=drafts.filter(d=>!keys.has((d.players||[]).map(p=>p.name).sort().join("|")));for(const ps of rosters)drafts.push({draftId:[contest,...ps.map(p=>p.name).sort()].join("|"),sport:"NFL",format:"Daily Draft",contest,players:ps,sourceUrl:location.href,capturedAt:new Date().toISOString()});await safe(()=>chrome.storage.local.set({drafts}));return rosters.length}
function draftPlayerNames(){const out=[];for(const el of document.querySelectorAll("body *")){if(el.children.length||!visible(el))continue;const n=clean(el.textContent);if(n.length<4||n.length>35||!/^[A-Za-zÀ-ÿ.' -]+$/.test(n))continue;let p=el.parentElement,ok=false;for(let i=0;i<4&&p;i++,p=p.parentElement){const t=clean(p.innerText);if(/\b(QB|RB|WR|TE)\d?\b/.test(t)&&(/\bvs\b/i.test(t)||/\s@\s/.test(t))){ok=true;break}}if(ok)out.push({el,name:n})}return out}
function selectedPopupContest(){try{return clean(document.querySelector("#contestSelect")?.value)}catch(e){return ""}}\nasync function exposureForDraft(){
 const data=await safe(()=>chrome.storage.local.get({drafts:[],activeDraftContestById:{}}));if(!data)return null;const drafts=data.drafts||[];
 const id=(location.pathname.match(/\/draft\/([^/?]+)/)||[])[1];let contest=data.activeDraftContestById?.[id];
 if(!contest){const names=[...new Set(drafts.map(d=>d.contest).filter(Boolean))];if(names.length===1)contest=names[0]}
 if(!contest)return {needsContest:true,drafts};
 const ds=drafts.filter(d=>d.contest===contest),m=new Map();ds.forEach(d=>[...new Set((d.players||[]).map(p=>p.name))].forEach(n=>m.set(n,(m.get(n)||0)+1)));return {contest,total:ds.length,map:m}
}
function badge(count,total){const b=document.createElement("span");b.dataset.nukeExposure="1";b.className="nuke-exposure-badge";b.textContent=`EXP ${total?Math.round(count/total*100):0}% · ${count}/${total}`;return b}
async function addDraftBadges(){if(!location.pathname.includes("/draft/"))return;document.querySelectorAll("[data-nuke-exposure]").forEach(x=>x.remove());const ex=await exposureForDraft();if(!ex||ex.needsContest||!ex.total)return;for(const {el,name} of draftPlayerNames()){const count=ex.map.get(name)||0;el.insertAdjacentElement("afterend",badge(count,ex.total))}}
async function scan(){if(running||!alive)return 0;running=true;try{const n=await repairAndSync();await addDraftBadges();return n}finally{running=false}}
try{chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{if(msg?.type==="NUKE_FORCE_SCAN"){scan().then(n=>sendResponse({ok:true,captured:n}));return true}})}catch(e){alive=false}
const obs=new MutationObserver(()=>{if(!alive){obs.disconnect();return}clearTimeout(timer);timer=setTimeout(scan,500)});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(scan,600);setInterval(scan,3000);
})();