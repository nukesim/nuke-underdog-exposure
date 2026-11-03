// Exact completed-entry identities. This never runs in a live draft room.
(()=>{
'use strict';
const Core=globalThis.NukeExposure;if(!Core)return;
const clean=Core.clean,norm=Core.norm,completed=()=>/\/completed(?:\/|$)/i.test(location.pathname);
const visible=el=>el&&el.isConnected&&el.offsetParent!==null&&!el.closest('[id^="nuke-"]');
let running=null,queueTimer=0,lastRoute='',attempted=new Set(),clickedCard=null,interrupted=false;
function cards(){
 const result=[],seen=new Set();if(!completed())return result;
 for(const marker of document.querySelectorAll('*')){
  if(marker.childElementCount||!visible(marker)||!/^\d+(?:\.\d+)?\s*Projected$/i.test(clean(marker.textContent)))continue;
  let card=marker.parentElement;
  for(let i=0;i<7&&card&&card!==document.body;i++,card=card.parentElement){
   const lines=(card.innerText||'').split('\n').map(clean).filter(Boolean);
   const at=lines.findIndex(x=>/^\d+(?:\.\d+)?\s*Projected$/i.test(x));if(at<0)continue;
   const roster=lines.slice(at+1,at+5).find(x=>{const a=x.split(',').map(clean).filter(Boolean);return a.length>=2&&a.length<=12});
   if(!roster)continue;
   if(!seen.has(card)){seen.add(card);result.push({card,roster,players:roster.split(',').map(name=>({name:clean(name)}))})}break;
  }
 }
 return result;
}
function readDetail(pool,sport='NFL'){
 const groups=new Map(),fullNames=new Set(pool.map(p=>norm(p.name)));
 for(const el of document.querySelectorAll('span,p,div,a,h3,h4,b,strong')){
  if(!visible(el)||el.closest('[data-nuke-completed-id]'))continue;
  const name=clean(el.innerText||el.textContent);
  if(el.childElementCount&&!fullNames.has(norm(name)))continue;
  if(!/^[A-Z][A-Za-zÀ-ÿ'.’\-]+(?: [A-Za-zÀ-ÿ'.’\-]+){1,5}$/.test(name)||/\bvs\b/i.test(name))continue;
  let row=el.parentElement,game=null;
  for(let depth=0;depth<5&&row&&row!==document.body;depth++,row=row.parentElement){
   const text=clean(row.innerText);if(text.length>350)break;
   game=text.match(/\b([A-Z]{2,3})\s*(?:vs\.?|@)\s*([A-Z]{2,3})\b/i);if(game)break;
  }
  if(!game||!row)continue;
  // Look for the nearest roster container with multiple position sections.
  let panel=row.parentElement;
  for(let depth=0;depth<8&&panel&&panel!==document.body;depth++,panel=panel.parentElement){
   const lines=(panel.innerText||'').split('\n').map(clean).filter(Boolean);
   const headings=lines.filter(x=>/^(QB|RB|WR|TE)$/.test(x));
   if(new Set(headings).size<3)continue;
   let pos='';for(const h of panel.querySelectorAll('h2,h3,h4,span,p,div,b,strong')){
    if(h.childElementCount)continue;const text=clean(h.textContent);
    if(/^(QB|RB|WR|TE)$/.test(text)&&(h.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))pos=text;
   }
   if(!pos)break;
   const p=Core.resolve({name,pos,team:game[1].toUpperCase(),sport},pool);
   if(p.unresolved||!p.name.includes(' '))break;
   if(!groups.has(panel))groups.set(panel,new Map());
   groups.get(panel).set(norm(p.name),{...p,name,pos,teamAbbr:game[1].toUpperCase(),identitySource:'completed-detail',unresolved:false});break;
  }
 }
 const legal=players=>{const n={QB:0,RB:0,WR:0,TE:0};players.forEach(p=>n[p.pos]++);return players.length===6&&n.QB===1&&n.RB===2&&n.WR===2&&n.TE===1};
 return [...groups.values()].map(m=>[...m.values()]).filter(legal).sort((a,b)=>b.length-a.length)[0]||[];
}
const signature=players=>players.map(p=>norm(p.name)).sort().join('|');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function learn(card,players,capture){
 const id=card.card.dataset.nukeCompletedId;if(!id||!Core.sameRoster(card.players,players))return false;
 const data=await chrome.storage.local.get({completedFullNames:{},drafts:[]});
 const entry=data.drafts.find(d=>d.draftId===id);if(!entry)return false;
 const record={players,summary:card.players,scope:{sport:entry.sport,contest:entry.contest},sourceUrl:location.href,at:Date.now()};
 const next={...data.completedFullNames,[id]:record};
 await chrome.storage.local.set({completedFullNames:next});
 await capture();return true;
}
async function perform(capture,force){
 if(!completed())return;
 const route=location.href;if(route!==lastRoute){lastRoute=route;attempted=new Set()}
 if(force)attempted.clear();interrupted=false;
 const data=await chrome.storage.local.get({drafts:[],playerUniverse:{},officialExposure:{},completedFullNames:{}});
 const pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG||[],data.playerUniverse,data.drafts,data.officialExposure);
 let list=cards().filter(x=>x.card.dataset.nukeCompletedId);if(!list.length)return;
 const initialDetail=readDetail(pool),matches=list.filter(x=>Core.sameRoster(x.players,initialDetail));
 const original=matches.length===1?matches[0]:null;
 if(original&&initialDetail.length)await learn(original,initialDetail,capture);
 const current=await chrome.storage.local.get({completedFullNames:{}});
 const targets=list.filter(x=>data.drafts.some(d=>d.draftId===x.card.dataset.nukeCompletedId)&&!current.completedFullNames[x.card.dataset.nukeCompletedId]&&!attempted.has(x.card.dataset.nukeCompletedId)&&x.players.some(p=>Core.candidates(p,pool).length!==1));
 if(!targets.length)return;
 await chrome.storage.local.set({completedNameSync:{running:true,pending:targets.length,at:Date.now()}});
 let pending=targets.length,last=null;const work=[...targets],deferred=[];
 try{
  for(let index=0;index<work.length;index++){
   const card=work[index];
   if(interrupted||location.href!==route||!completed())break;
   attempted.add(card.card.dataset.nukeCompletedId);
   const before=signature(readDetail(pool));
   clickedCard=card.card;
   card.card.click();last=card;
   const deadline=Date.now()+4000;let stable='',stableAt=0,found=[];
   while(Date.now()<deadline&&!interrupted&&location.href===route){
    await pause(80);const detail=readDetail(pool),sig=signature(detail);
    // Do not attach the previous entry's Williams to a newly selected card
    // whose surname-only summary happens to be identical.
    if(!Core.sameRoster(card.players,detail)||sig===before){stable='';continue}
    if(sig!==stable){stable=sig;stableAt=Date.now();continue}
    if(Date.now()-stableAt>=160){found=detail;break}
   }
   if(found.length&&await learn(card,found,capture))pending--;
   else if(index<targets.length)deferred.push(card);
   // The first target may already be selected. After another card changes the
   // detail panel, revisit it so an identical surname summary can be verified.
   if(index===targets.length-1&&pending<targets.length)work.push(...deferred);
   await chrome.storage.local.set({completedNameSync:{running:true,pending,at:Date.now()}});
  }
 }finally{
  if(!interrupted&&location.href===route&&original&&last?.card!==original.card){clickedCard=original.card;original.card.click()}
  await chrome.storage.local.set({completedNameSync:{running:false,pending,at:Date.now()}});
 }
}
function sync(capture,{force=false}={}){if(running)return running;running=perform(capture,force).finally(()=>{running=null});return running}
function queue(capture){if(!completed()||running)return;clearTimeout(queueTimer);queueTimer=setTimeout(()=>sync(capture).catch(()=>{}),180)}
document.addEventListener('click',e=>{
 if(!completed()||!e.isTrusted)return;
 if(running)interrupted=true;
 const hit=cards().find(x=>x.card===e.target||x.card.contains(e.target));if(hit)clickedCard=hit.card;
},true);
globalThis.NukeCompletedNames={cards,readDetail,learn,sync,queue};
})();
