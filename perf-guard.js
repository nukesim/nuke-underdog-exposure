(()=>{
'use strict';
if(globalThis.__NUKE_PERF_GUARD__)return;
globalThis.__NUKE_PERF_GUARD__=true;

// Underdog mutates the draft DOM constantly. The extension only needs exposure
// refreshes on a human-readable cadence, not once per individual React mutation.
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
    },700);
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
Document.prototype.querySelectorAll=function(selector){
 if(this===document&&selector==='span,div')return [];
 return nativeDocumentQSA.call(this,selector);
};

// The click tracker used the same broad descendant scan on every click. Keep
// heading/data-attribute discovery, but never walk thousands of generic nodes
// just because the user clicked a draft button.
const nativeElementQSA=Element.prototype.querySelectorAll;
Element.prototype.querySelectorAll=function(selector){
 if(selector==='h1,h2,h3,[data-tournament-name],span,div'){
  return nativeElementQSA.call(this,'h1,h2,h3,[data-tournament-name]');
 }
 return nativeElementQSA.call(this,selector);
};
})();
