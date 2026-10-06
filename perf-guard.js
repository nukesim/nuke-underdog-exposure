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

// Keep bad UI labels out of storage even if Underdog's structured payloads use
// generic fields such as `name` or `title` that resemble tournament metadata.
try{
 const area=chrome?.storage?.local;
 if(area){
  const nativeGet=area.get.bind(area),nativeSet=area.set.bind(area);
  area.get=async(...args)=>sanitizeValues(await nativeGet(...args));
  area.set=(values,...args)=>nativeSet(sanitizeValues(values),...args);
 }
}catch{}

// Underdog's React tree can emit hundreds of mutations while a draft room is
// updating. Batch those into one extension refresh instead of competing with
// the site for the main thread on every mutation.
const NativeObserver=globalThis.MutationObserver;
if(NativeObserver){
 class NukeMutationObserver{
  constructor(callback){
   this._callback=callback;this._pending=[];this._timer=0;
   this._native=new NativeObserver(records=>{
    this._pending.push(...records);
    if(this._timer)return;
    this._timer=setTimeout(()=>{
     this._timer=0;
     const batch=this._pending.splice(0);
     if(batch.length)this._callback(batch,this);
    },900);
   });
  }
  observe(...args){return this._native.observe(...args)}
  disconnect(){if(this._timer){clearTimeout(this._timer);this._timer=0}this._pending.length=0;return this._native.disconnect()}
  takeRecords(){return [...this._pending.splice(0),...this._native.takeRecords()]}
 }
 globalThis.MutationObserver=NukeMutationObserver;
}

// content.js historically scanned every span/div on the entire Underdog page
// to guess tournament names. That is both expensive and the source of junk
// options such as "$5 Drafts", "3 Picks away", and boost labels. Tournament
// discovery now relies on headings/data attributes plus structured API data.
const nativeDocumentQSA=Document.prototype.querySelectorAll;
let starCache=null,starAt=0,divCache=null,divAt=0;
Document.prototype.querySelectorAll=function(selector){
 if(this===document&&selector==='span,div')return [];
 const now=Date.now();
 // Several exposure helpers ask for the entire DOM during the same render.
 // Reuse the same static NodeList briefly instead of repeating full-tree scans.
 if(this===document&&selector==='*'){
  if(starCache&&now-starAt<650)return starCache;
  starCache=nativeDocumentQSA.call(this,selector);starAt=now;return starCache;
 }
 if(this===document&&selector==='div'){
  if(divCache&&now-divAt<500)return divCache;
  divCache=nativeDocumentQSA.call(this,selector);divAt=now;return divCache;
 }
 return nativeDocumentQSA.call(this,selector);
};

// The click tracker used the same broad descendant scan on every click. Keep
// heading/data-attribute discovery, but never walk thousands of generic nodes
// just because the user clicked a draft button. Also memoize the player-row
// scan briefly because the same pool is queried several times per render.
const nativeElementQSA=Element.prototype.querySelectorAll;
const rowCache=new WeakMap();
Element.prototype.querySelectorAll=function(selector){
 if(selector==='h1,h2,h3,[data-tournament-name],span,div'){
  return nativeElementQSA.call(this,'h1,h2,h3,[data-tournament-name]');
 }
 if(selector==='span,div,p'){
  const now=Date.now(),old=rowCache.get(this);if(old&&now-old.at<450)return old.value;
  const value=nativeElementQSA.call(this,selector);rowCache.set(this,{at:now,value});return value;
 }
 return nativeElementQSA.call(this,selector);
};
})();
