(()=>{
'use strict';
if(globalThis.__NUKE_COMBO_DOCK__)return;
globalThis.__NUKE_COMBO_DOCK__=true;

let raf=0,lastHtml='';
const isDraftPage=()=>/\/draft\//.test(location.pathname);
const visible=el=>!!el&&el.isConnected&&el.getClientRects().length>0;

function dock(){
 let el=document.getElementById('nuke-combo-dock');
 if(!el){el=document.createElement('section');el.id='nuke-combo-dock';document.body.appendChild(el)}
 return el;
}

function legacyPanel(){return document.getElementById('nuke-combo-panel')}

function queueHostFromLegacy(){
 const legacy=legacyPanel();
 const prev=legacy?.previousElementSibling;
 if(prev&&visible(prev))return prev;
 return null;
}

function fallbackQueueHost(){
 try{
  const snap=document.evaluate("//*[starts-with(normalize-space(text()),'Queue')]",document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
  const hits=[];
  for(let i=0;i<snap.snapshotLength;i++){
   const label=snap.snapshotItem(i);if(!visible(label))continue;
   const lr=label.getBoundingClientRect(),lc=lr.left+lr.width/2;
   if(lc<innerWidth*.34||lc>innerWidth*.76)continue;
   let p=label.parentElement;
   for(let depth=0;depth<7&&p&&p!==document.body;depth++,p=p.parentElement){
    const r=p.getBoundingClientRect(),cx=r.left+r.width/2;
    if(r.width<300||r.width>900||r.height<45||r.height>650||cx<innerWidth*.34||cx>innerWidth*.76)continue;
    const text=(p.innerText||'').replace(/\s+/g,' ').trim();
    const score=Math.abs(cx-innerWidth*.58)+(/Use the star button|Queued players/i.test(text)?-300:0)+Math.abs(Math.min(r.height,180)-180)*.15;
    hits.push({p,score});
   }
  }
  hits.sort((a,b)=>a.score-b.score);
  return hits[0]?.p||null;
 }catch{return null}
}

function position(el,host){
 const r=host.getBoundingClientRect(),gap=10,edge=8,top=r.bottom+gap;
 const available=Math.floor(innerHeight-edge-top);
 if(r.width<250||r.bottom<0||r.top>innerHeight||available<74){el.hidden=true;return false}
 el.style.left=Math.round(r.left)+'px';
 el.style.width=Math.round(r.width)+'px';
 el.style.top=Math.round(top)+'px';
 el.style.maxHeight=Math.min(330,available)+'px';
 el.hidden=false;
 return true;
}

function sync(){
 const el=dock();
 if(!isDraftPage()){el.hidden=true;return}
 const legacy=legacyPanel();
 if(!legacy){el.hidden=true;return}
 const html=(legacy.innerHTML||'').trim();
 if(!html){el.hidden=true;return}
 // Mirror the ORIGINAL dynamic panel verbatim. That keeps NUKE NEXT, roster
 // construction, duplicate-path warnings and candidate tags exactly as before.
 if(html!==lastHtml){el.innerHTML=html;lastHtml=html}
 const host=queueHostFromLegacy()||fallbackQueueHost();
 if(!host){el.hidden=true;return}
 position(el,host);
}

function fast(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;sync()})}

document.addEventListener('scroll',fast,{capture:true,passive:true});
window.addEventListener('resize',fast,{passive:true});
document.addEventListener('click',()=>{setTimeout(sync,80);setTimeout(sync,450);setTimeout(sync,1200);setTimeout(sync,3200)},true);

sync();
setInterval(sync,300);
})();
