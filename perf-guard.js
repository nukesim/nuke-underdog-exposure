(()=>{
'use strict';
if(globalThis.__NUKE_PERF_GUARD__)return;
globalThis.__NUKE_PERF_GUARD__=true;

const Core=globalThis.NukeExposure;
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
function validContestName(name){
 const x=clean(name);if(!x||x===Core?.NONE||x==='ALL'||x.length>100)return false;
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
const validChoice=x=>x===Core?.NONE||x==='ALL'||validContestName(x);
const cleanScope=s=>s&&typeof s==='object'&&!validChoice(s.contest)?{...s,contest:Core?.NONE||'__NO_TOURNAMENT__'}:s;
const sanitizeValues=values=>{
 if(!values||typeof values!=='object')return values;
 const out={...values};
 if(Array.isArray(out.knownTournaments))out.knownTournaments=out.knownTournaments.filter(x=>validContestName(x?.contest));
 if('activePageScope'in out)out.activePageScope=cleanScope(out.activePageScope);
 if('exposureScope'in out)out.exposureScope=cleanScope(out.exposureScope);
 if('lastSelectedContest'in out&&!validChoice(out.lastSelectedContest))out.lastSelectedContest=Core?.NONE||'__NO_TOURNAMENT__';
 return out;
};

try{
 const area=chrome?.storage?.local;
 if(area){
  const nativeGet=area.get.bind(area),nativeSet=area.set.bind(area);
  area.get=async(...args)=>sanitizeValues(await nativeGet(...args));
  area.set=(values,...args)=>nativeSet(sanitizeValues(values),...args);
 }
}catch{}

// The Underdog draft room mutates continuously. Extension refreshes are now
// throttled and deferred until the browser has idle time so drafting clicks win.
const NativeObserver=globalThis.MutationObserver;
if(NativeObserver){
 class NukeMutationObserver{
  constructor(callback){
   this._callback=callback;this._pending=[];this._timer=0;this._idle=0;
   this._native=new NativeObserver(records=>{
    // The content callback only needs to know that meaningful nodes were added.
    // Cap the batch instead of retaining hundreds/thousands of React mutations.
    for(const r of records){if(this._pending.length>=24)break;this._pending.push(r)}
    if(this._timer||this._idle)return;
    this._timer=setTimeout(()=>{
     this._timer=0;
     const run=()=>{
      this._idle=0;
      const batch=this._pending.splice(0);
      if(batch.length)this._callback(batch,this);
     };
     if(typeof requestIdleCallback==='function')this._idle=requestIdleCallback(run,{timeout:2200});
     else this._timer=setTimeout(run,400);
    },1800);
   });
  }
  observe(...args){return this._native.observe(...args)}
  disconnect(){if(this._timer){clearTimeout(this._timer);this._timer=0}if(this._idle&&typeof cancelIdleCallback==='function'){cancelIdleCallback(this._idle);this._idle=0}this._pending.length=0;return this._native.disconnect()}
  takeRecords(){const a=this._pending.splice(0);const b=this._native.takeRecords();return [...a,...b.slice(0,24)]}
 }
 globalThis.MutationObserver=NukeMutationObserver;
}

const nativeDocumentQSA=Document.prototype.querySelectorAll;
let starCache=null,starAt=0,divCache=null,divAt=0,headingCache=null,headingAt=0;
Document.prototype.querySelectorAll=function(selector){
 if(this===document&&selector==='span,div')return [];
 const now=Date.now();
 if(this===document&&selector==='h1,h2,h3,[data-tournament-name]'){
  if(headingCache&&now-headingAt<1800)return headingCache;
  headingCache=[...nativeDocumentQSA.call(this,selector)].filter(el=>validContestName(el.dataset?.tournamentName||el.textContent));headingAt=now;return headingCache;
 }
 if(this===document&&selector==='*'){
  if(starCache&&now-starAt<3000)return starCache;
  starCache=nativeDocumentQSA.call(this,selector);starAt=now;return starCache;
 }
 if(this===document&&selector==='div'){
  if(divCache&&now-divAt<2200)return divCache;
  divCache=nativeDocumentQSA.call(this,selector);divAt=now;return divCache;
 }
 return nativeDocumentQSA.call(this,selector);
};

const nativeElementQSA=Element.prototype.querySelectorAll;
const rowCache=new WeakMap();
Element.prototype.querySelectorAll=function(selector){
 if(selector==='h1,h2,h3,[data-tournament-name],span,div'){
  return [...nativeElementQSA.call(this,'h1,h2,h3,[data-tournament-name]')].filter(el=>validContestName(el.dataset?.tournamentName||el.textContent));
 }
 if(selector==='span,div,p'){
  const now=Date.now(),old=rowCache.get(this);if(old&&now-old.at<1600)return old.value;
  const value=nativeElementQSA.call(this,selector);rowCache.set(this,{at:now,value});return value;
 }
 return nativeElementQSA.call(this,selector);
};
})();
