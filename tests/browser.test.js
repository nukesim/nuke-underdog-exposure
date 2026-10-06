const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=f=>fs.readFileSync(path.join(root,f),'utf8');
const week4={sport:'NFL',contest:'Battle Royale - Week 4'},week5={sport:'NFL',contest:'Battle Royale - Week 5'};
function fixture(url,html,initial){
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return [...this.childNodes].map(n=>n.nodeType===3?n.textContent:n.innerText||n.textContent).join('\n')},configurable:true});
 Object.defineProperty(w.HTMLElement.prototype,'offsetParent',{get(){return this.parentElement},configurable:true});
 w.observers=[];const Observer=w.MutationObserver;w.MutationObserver=class extends Observer{constructor(fn){super(fn);w.observers.push(this)}};w.store=initial;const changes=[],messages=[];
 w.chrome={storage:{local:{get:async defaults=>({...defaults,...structuredClone(w.store)}),set:async values=>{const changed={};for(const [k,v]of Object.entries(values)){changed[k]={oldValue:w.store[k],newValue:v};w.store[k]=structuredClone(v)}for(const fn of changes)fn(changed,'local')}},onChanged:{addListener:fn=>changes.push(fn)}},runtime:{onMessage:{addListener:fn=>messages.push(fn)}},tabs:{query:async()=>[],sendMessage:async()=>({})}};
 w.eval(source('player-catalog.js'));w.eval(source('exposure-core.js'));return dom;
}
async function until(fn){const deadline=Date.now()+2500;while(!fn()){if(Date.now()>deadline)throw Error('Fixture condition timed out');await new Promise(r=>setTimeout(r,10))}}
test('actual popup keeps zero-draft Week 5 and resolves names on players/combos/drafts',async()=>{
 const html=source('popup.html').replace(/<script[^>]*><\/script>/g,'');
 const seed=require('node:vm').runInNewContext(source('player-catalog.js')+';NUKE_PLAYER_CATALOG');
 const id=n=>seed.find(x=>x.name===n).id;
 const initial={drafts:[{draftId:'a',...week4,capturedAt:new Date().toISOString(),players:[{name:'Allen',id:id('Keenan Allen')},{name:'Henry',id:id('Hunter Henry')},{name:'Washington',id:id('Darnell Washington')}]}],exposureScope:week5,knownTournaments:[week4,week5],playerUniverse:{},officialExposure:{allen:{name:'Keenan Allen',count:1,total:1}}};
 const dom=fixture('https://fixture.test/popup',html,initial),w=dom.window,$=s=>w.document.querySelector(s);
 try{w.eval(source('popup.js'));await until(()=>$('#contest').value===week5.contest);
 assert.equal($('#draftCount').textContent,'0');assert.match($('#view').textContent,/No completed drafts/);
 $('#contest').value=week4.contest;$('#contest').dispatchEvent(new w.Event('change'));await until(()=>$('#draftCount').textContent==='1');
 for(const n of ['Keenan Allen','Hunter Henry','Darnell Washington'])assert.match($('#view').textContent,new RegExp(n));
 $('[data-tab="combos"]').click();assert.match($('#view').textContent,/Darnell Washington \+ Hunter Henry/);
 $('[data-tab="drafts"]').click();assert.match($('#view').textContent,/Keenan Allen, Hunter Henry, Darnell Washington/);
 $('#contest').value=week5.contest;$('#contest').dispatchEvent(new w.Event('change'));await until(()=>$('#draftCount').textContent==='0');
 }finally{w.observers.forEach(x=>x.disconnect());w.close()}
});
test('actual content script clears stale scope on lobby, detects card click and SPA week changes',async()=>{
 const html='<body><nav>NFL</nav><h2>Daily</h2><a id="week5" href="#"><div><span>Battle Royale - Week 5</span><p>6 person drafts - $60k to first!</p><span>$10</span><span>Entry</span><span>$300k</span><span>Prizes</span></div></a><h3>The Wildcat</h3></body>';
 const dom=fixture('https://fixture.test/lobby/nfl/slate',html,{drafts:[{draftId:'old',...week4,players:[{name:'Keenan Allen'},{name:'Hunter Henry'}]}],exposureScope:week4,playerUniverse:{},officialExposure:{allen:{name:'Keenan Allen',count:1,total:1}}}),w=dom.window;
 try{w.eval(source('content.js'));await until(()=>w.store.exposureScope?.contest==='__NO_TOURNAMENT__');
 assert.ok(w.store.knownTournaments.some(x=>x.contest===week5.contest));
 w.document.querySelector('#week5').addEventListener('click',e=>e.preventDefault());w.document.querySelector('#week5').click();w.history.pushState({},'', '/draft/new5');w.document.body.innerHTML='<nav>NFL</nav><h2>Battle Royale - Week 5</h2>';
 await until(()=>w.store.exposureScope?.contest===week5.contest);
 w.history.pushState({},'', '/draft/old4');w.document.body.innerHTML='<nav>NFL</nav><h2>Battle Royale - Week 4</h2>';
 await until(()=>w.store.exposureScope?.contest===week4.contest);
 w.history.pushState({},'', '/draft/unknown');w.document.body.innerHTML='<nav>NFL</nav>';
 await until(()=>w.store.exposureScope?.contest==='__NO_TOURNAMENT__');
 assert.equal(w.store.drafts.length,1);
 }finally{w.observers.forEach(x=>x.disconnect());w.close()}
});
test('live exposure uses exact tournament and never old global cache, even with equal totals',async()=>{
 const dom=fixture('https://fixture.test/draft/5','<body><nav>NFL</nav><h2>Battle Royale - Week 5</h2></body>',{exposureScope:week4,drafts:[{draftId:'old',...week4,players:[{name:'Keenan Allen'}]},{draftId:'new',...week5,players:[{name:'Hunter Henry'}]}],officialExposure:{'keenan allen':{name:'Keenan Allen',count:1,total:1}},playerUniverse:{}}),w=dom.window;
 try{const s=source('content.js').replace(/\}\)\(\);\s*$/, 'globalThis.testContent={getStats:()=>cached.stats,exposureCount,harvestStructured,ingestStructured};})();');w.eval(s);await until(()=>w.store.exposureScope?.contest===week5.contest);
 const st=w.testContent.getStats();assert.equal(st.total,1);assert.equal(w.testContent.exposureCount('Keenan Allen',st),0);assert.equal(w.testContent.exposureCount('Hunter Henry',st),1);
 await w.testContent.ingestStructured({players:[{first_name:'Old',last_name:'Response',drafted_count:1,drafted_percentage:100,total_drafts:1}]},'fetch','/exposure','https://fixture.test/draft/4');assert.equal(Object.values(w.store.officialExposure).some(x=>x.name==='Old Response'),false);
 const records=w.testContent.harvestStructured({draft_id:'test',tournament_name:week5.contest,sport:'NFL',players:[{player:{firstName:'Keenan',lastName:'Allen',id:'new-id'}},{appearance:{player:{first_name:'Hunter',last_name:'Henry',id:'other-id'}}}]});
 assert.equal(records[0].players[0].name,'Keenan Allen');assert.equal(records[0].players[1].name,'Hunter Henry');
 }finally{w.observers.forEach(x=>x.disconnect());w.close()}
});
