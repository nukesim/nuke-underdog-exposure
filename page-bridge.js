(()=>{'use strict';
const recent=new Map();
// The live draft room must stay untouched. We do not clone/parse any of its
// fetch/XHR traffic. Structured interception is limited to completed/exposure
// pages where a small delay cannot affect a pick clock or user clicks.
const liveRoom=()=>/\/draft\//i.test(location.pathname);
const relevant=u=>!liveRoom()&&/completed|exposure/i.test(String(u||''));
const allow=u=>{const k=String(u||'').split('?')[0],now=Date.now(),last=recent.get(k)||0;if(now-last<3000)return false;recent.set(k,now);if(recent.size>30)for(const [key,t]of recent)if(now-t>30000)recent.delete(key);return true};
const send=(kind,url,data,pageUrl)=>{try{if(relevant(url)&&allow(url))window.postMessage({source:'NUKE_UD_BRIDGE',kind,url,data,pageUrl},'*')}catch{}};
const originalFetch=window.fetch;
window.fetch=async function(...args){const pageUrl=location.href,res=await originalFetch.apply(this,args);if(liveRoom())return res;try{const url=String(args[0]?.url||args[0]||res.url||'');if(relevant(url)){const len=Number(res.headers.get('content-length')||0);if(len&&len>500000)return res;const clone=res.clone(),ct=clone.headers.get('content-type')||'';if(ct.includes('json'))clone.json().then(d=>send('fetch',url,d,pageUrl)).catch(()=>{})}}catch{}return res};
const XO=XMLHttpRequest.prototype.open,XS=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(m,u,...rest){this.__nukeUrl=String(u||'');return XO.call(this,m,u,...rest)};
XMLHttpRequest.prototype.send=function(...args){const pageUrl=location.href;if(!liveRoom()&&relevant(this.__nukeUrl))this.addEventListener('load',()=>{try{const ct=this.getResponseHeader('content-type')||'',len=Number(this.getResponseHeader('content-length')||0);if((!len||len<=500000)&&ct.includes('json'))send('xhr',this.__nukeUrl,JSON.parse(this.responseText),pageUrl)}catch{}});return XS.apply(this,args)};
})();
