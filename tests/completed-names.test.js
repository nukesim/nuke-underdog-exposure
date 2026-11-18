const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),Core=require('../exposure-core');require('../player-catalog');
// Keep historical regression rosters available when weekly catalogs rotate.
const historicalExtras=[['Puka Nacua','WR','LAR'],['Kirk Cousins','QB','ATL'],['Kyren Williams','RB','LAR']].map(([name,pos,teamAbbr])=>({name,pos,teamAbbr,team:teamAbbr,sport:'NFL',ids:['fixture-player-'+name,'fixture-appearance-'+name]}));
const seed=[...new Map([...require('./historical-catalog.json'),...historicalExtras,...globalThis.NUKE_PLAYER_CATALOG].map(p=>[p.name,p])).values()],pool=Core.catalog(seed),source=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const scope={sport:'NFL',contest:'The Wildcat'};
const exactA=['Patrick Mahomes','Chuba Hubbard','Saquon Barkley','Puka Nacua','CeeDee Lamb','Travis Kelce'];
const exactB=['Kirk Cousins','Javonte Williams','Jonah Coleman','Jaxon Smith-Njigba','Tetairoa McMillan','Brock Bowers'];
const exactC=['Kirk Cousins','Kyren Williams','Jonah Coleman','Jaxon Smith-Njigba','Tetairoa McMillan','Brock Bowers'];
// The selected entry in the reported Completed screenshot uses a WR in FLEX.
const allenWRFlex=['Josh Allen','Bhayshul Tuten','Amon-Ra St. Brown','Malik Nabers','D.J. Moore','Dalton Kincaid'];
const allenTEFlex=['Josh Allen','Bhayshul Tuten','Amon-Ra St. Brown','Malik Nabers','Dalton Kincaid','Hunter Henry'];
function full(names){return names.map(n=>seed.find(p=>p.name===n))}
function detail(names){return ['QB','RB','WR','TE'].map(pos=>`<section><h3>${pos}</h3>${full(names).filter(p=>p.pos===pos).map(p=>`<div class="player"><span>${p.name}</span><p>${p.teamAbbr} @ LV</p><span>12.3</span><span>Projected</span></div>`).join('')}</section>`).join('')}
const summary=names=>full(names).map(p=>p.name.split(' ').slice(1).join(' ')).join(', ');
function fixture(html,initial={},popup=false){
 const dom=new JSDOM(html,{url:popup?'https://fixture.test/popup':'https://fixture.test/completed/slate/br/wildcat',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return [...this.childNodes].map(n=>n.nodeType===3?n.textContent:n.innerText||n.textContent).join('\n')},configurable:true});
 Object.defineProperty(w.HTMLElement.prototype,'offsetParent',{get(){return this.parentElement},configurable:true});
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:1000,width:550,height:600}};
 const observers=[],Native=w.MutationObserver;w.MutationObserver=class extends Native{constructor(cb){super(cb);observers.push(this)}};
 const listeners=[];w.store=structuredClone(initial);
 w.chrome={storage:{local:{get:async defaults=>({...defaults,...structuredClone(w.store)}),set:async vals=>{const ch={};for(const[k,v]of Object.entries(vals)){ch[k]={newValue:structuredClone(v)};w.store[k]=structuredClone(v)}listeners.forEach(fn=>fn(ch,'local'))}},onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{onMessage:{addListener(){}}},tabs:{query:async()=>[]}};
 w.NUKE_PLAYER_CATALOG=structuredClone(seed);w.eval(source('exposure-core.js'));
 return {w,close(){observers.forEach(o=>o.disconnect());w.close()}};
}
async function until(fn){const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw Error('Timed out waiting for roster capture');await new Promise(r=>setTimeout(r,15))}}
function completedHTML(){return `<body><nav>NFL</nav><main><h2>The Wildcat</h2><h3>Your teams</h3>${[exactA,exactB,exactC].map((names,i)=>`<button id="card${i}"><b>94.30 Projected</b><p>${summary(names)}</p></button>`).join('')}</main><aside id="detail">${detail(exactA)}</aside></body>`}
test('all Williams identities remain distinct when player/appearance IDs are nested',()=>{
 for(const p of seed.filter(p=>p.name.endsWith('Williams'))){
  const r=Core.resolve({name:'Williams',appearance:{id:p.ids[1],player:{last_name:'Williams'}}},pool);
  assert.equal(r.name,p.name);assert.equal(r.unresolved,false);
 }
});
test('matching roster summaries requires distinct full players and preserves shared surnames',()=>{
 assert.equal(Core.sameRoster(summary(exactB).split(',').map(name=>({name:name.trim()})),full(exactB)),true);
 assert.equal(Core.sameRoster([{name:'Williams'},{name:'Williams'}],[{name:'Javonte Williams'},{name:'Kyren Williams'}]),true);
 assert.equal(Core.sameRoster([{name:'Williams'},{name:'Williams'}],[{name:'Javonte Williams'},{name:'Jonah Coleman'}]),false);
});
test('detailed rosters accept RB, WR and TE FLEX and reject incomplete or illegal entries',()=>{
 const app=fixture('<body><aside id="detail"></aside></body>'),w=app.w;
 try{
  w.eval(source('completed-names.js'));
  for(const names of [exactA,allenWRFlex,allenTEFlex]){
   w.document.querySelector('#detail').innerHTML=detail(names);
   const players=w.NukeCompletedNames.readDetail(pool);
   assert.equal(players.length,6,'Missing FLEX roster: '+names.join(', '));
   assert.deepEqual(Array.from(players,p=>p.name).sort(),names.slice().sort());
  }
  for(const names of [allenWRFlex.slice(0,5),['Josh Allen','Kirk Cousins',...allenWRFlex.slice(2)]]){
   w.document.querySelector('#detail').innerHTML=detail(names);
   assert.equal(w.NukeCompletedNames.readDetail(pool).length,0);
  }
 }finally{app.close()}
});
test('selected Josh Allen WR FLEX repairs the saved entry, popup search and 1/10 live badge',async()=>{
 const html=`<body><nav>NFL</nav><main><h2>The Wildcat</h2><h3>Your teams</h3>${Array.from({length:9},()=>`<button><b>94.30 Projected</b><p>${summary(exactA)}</p></button>`).join('')}<button id="allen"><b>88.20 Projected</b><p>${summary(allenWRFlex)}</p></button></main><aside id="detail">${detail(allenWRFlex)}</aside></body>`;
 const app=fixture(html),w=app.w;
 try{
  w.eval(source('completed-names.js'));w.eval(source('content.js'));
  await until(()=>w.store.drafts?.some(d=>d.identitySource==='completed-detail'));
  assert.equal(w.store.drafts.length,10);
  assert.equal(w.store.drafts.filter(d=>d.players.some(p=>p.name==='Josh Allen'&&!p.unresolved)).length,1);
  const pop=fixture(source('popup.html').replace(/<script[^>]*><\/script>/g,''),w.store,true);
  try{
   pop.w.eval(source('popup.js'));await until(()=>pop.w.document.querySelector('#draftCount').textContent==='10');
   const search=pop.w.document.querySelector('#search');search.value='josh allen';search.dispatchEvent(new pop.w.Event('input'));
   assert.match(pop.w.document.querySelector('#view').textContent,/Josh Allen.*1\/10.*10\.0%/);
   search.value='missing player';search.dispatchEvent(new pop.w.Event('input'));
   assert.match(pop.w.document.querySelector('#view').textContent,/No players match your search/);
   assert.doesNotMatch(pop.w.document.querySelector('#view').textContent,/No completed drafts/);
   pop.w.document.querySelector('[data-tab="combos"]').click();
   assert.match(pop.w.document.querySelector('#view').textContent,/No combos match your search/);
   assert.equal(pop.w.document.querySelector('#draftCount').textContent,'10');
   assert.doesNotMatch(pop.w.document.querySelector('#syncText').textContent,/Syncing/);
  }finally{pop.close()}
  w.history.replaceState({},'', '/draft/live');
  w.document.body.innerHTML='<nav>NFL</nav><h2>The Wildcat</h2><section id="players"><h2>Players</h2><p>ADP Proj</p><div class="row"><div><span>Josh Allen</span><p>QB1 BUF vs MIA</p></div></div></section>';
  w.HTMLElement.prototype.getClientRects=function(){return [{}]};
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:80,width:670,height:this.classList.contains('row')?80:600}};
  w.eval(source('active-badges.js'));
  await until(()=>/10%.*1\/10/.test(w.document.querySelector('.nuke-active-own')?.textContent||''));
  assert.match(w.document.querySelector('.nuke-active-own').textContent,/10%.*1\/10/);
 }finally{app.close()}
});
test('Completed auto-sync obtains Javonte and Kyren from full roster details and preserves them across rescans',async()=>{
 const app=fixture(completedHTML()),w=app.w;
 try{
  [exactA,exactB,exactC].forEach((names,i)=>w.document.querySelector('#card'+i).addEventListener('click',()=>setTimeout(()=>{w.document.querySelector('#detail').innerHTML=detail(names)},35)));
  w.eval(source('perf-guard.js'));w.eval(source('completed-names.js'));
  w.eval(source('content.js').replace(/\}\)\(\);\s*$/,'globalThis.testContent={captureCompleted,harvestStructured,ingestStructured};})();'));
  await until(()=>w.store.drafts?.length===3);
  await until(()=>w.store.drafts?.every(d=>d.identitySource==='completed-detail'));
  let ds=w.store.drafts;
  assert.equal(ds.length,3);assert.equal(ds.every(d=>d.identitySource==='completed-detail'),true);
  assert.equal(ds.flatMap(d=>d.players).filter(p=>p.name==='Javonte Williams').length,1);
  assert.equal(ds.flatMap(d=>d.players).filter(p=>p.name==='Kyren Williams').length,1);
  assert.ok(ds.flatMap(d=>d.players).every(p=>p.name.includes(' ')&&!p.unresolved));
  await w.testContent.captureCompleted();ds=w.store.drafts;
  assert.equal(ds.length,3);assert.equal(ds.every(d=>d.identitySource==='completed-detail'),true);
  const pop=fixture(source('popup.html').replace(/<script[^>]*><\/script>/g,''),w.store,true);
  try{pop.w.eval(source('popup.js'));await until(()=>pop.w.document.querySelector('#draftCount').textContent==='3');const text=pop.w.document.querySelector('#view').textContent;
   assert.match(text,/Javonte Williams/);assert.match(text,/Kyren Williams/);assert.doesNotMatch(text,/identity unconfirmed|Full name syncing/);
   const rows=[...pop.w.document.querySelectorAll('#view .row')].filter(x=>/Williams/.test(x.textContent));assert.equal(rows.length,2);assert.ok(rows.every(x=>/1\/3/.test(x.textContent)));
  }finally{pop.close()}
 }finally{app.close()}
});
test('an unresolved surname is never relabelled from a different roster sharing that surname',async()=>{
 const players=summary(exactB).split(',').map(name=>({name:name.trim()}));
 const app=fixture(source('popup.html').replace(/<script[^>]*><\/script>/g,''),{drafts:[{...scope,draftId:'unknown',players,capturedAt:new Date().toISOString()},{...scope,draftId:'known',players:full(exactC),capturedAt:new Date().toISOString()}],exposureScope:scope},true),w=app.w;
 try{w.eval(source('popup.js'));await until(()=>w.document.querySelector('#draftCount').textContent==='2');
  const rows=[...w.document.querySelectorAll('#view .row')].filter(x=>/Williams/.test(x.textContent));assert.equal(rows.length,1);assert.match(rows[0].textContent,/Kyren Williams/);assert.match(rows[0].textContent,/1\/2/);assert.doesNotMatch(w.document.body.textContent,/identity unconfirmed/);assert.match(w.document.querySelector('#syncText').textContent,/Syncing full names/);
 }finally{app.close()}
});
test('structured roster IDs inherit the parent tournament and resolve exact Williams names',async()=>{
 const app=fixture('<body><nav>NFL</nav></body>'),w=app.w;
 try{w.eval(source('completed-names.js'));w.eval(source('content.js').replace(/\}\)\(\);\s*$/,'globalThis.testContent={harvestStructured};})();'));await new Promise(r=>setTimeout(r,20));
  const payload={tournament_name:'The Wildcat',sport:'NFL',entries:[{entry_id:'entry-b',picks:full(exactB).map(p=>({appearance_id:p.ids[1]||p.ids[0]}))},{entry_id:'entry-c',picks:full(exactC).map(p=>({appearance:{id:p.ids[1]||p.ids[0]}}))}]};
  const ds=w.testContent.harvestStructured(payload);assert.equal(ds.length,2);assert.equal(ds[0].players[1].name,'Javonte Williams');assert.equal(ds[1].players[1].name,'Kyren Williams');assert.equal(ds[0].contest,'The Wildcat');
 }finally{app.close()}
});

test('a preselected Williams roster is repaired after visiting the other Williams entry',async()=>{
 const app=fixture(completedHTML().replace(detail(exactA),detail(exactB))),w=app.w;
 try{
  [exactA,exactB,exactC].forEach((names,i)=>w.document.querySelector('#card'+i).addEventListener('click',()=>setTimeout(()=>{w.document.querySelector('#detail').innerHTML=detail(names)},25)));
  w.eval(source('completed-names.js'));w.eval(source('content.js'));
  const deadline=Date.now()+20000;
  while(!w.store.drafts?.filter(d=>d.summaryPlayers?.some(p=>p.name==='Williams')).every(d=>d.identitySource==='completed-detail')||w.store.drafts?.length!==3){if(Date.now()>deadline)throw Error('Preselected entry was not repaired: '+JSON.stringify({drafts:w.store.drafts?.map(d=>({id:d.draftId,source:d.identitySource,names:d.players.map(p=>p.name)})),sync:w.store.completedNameSync,learned:Object.keys(w.store.completedFullNames||{})}));await new Promise(r=>setTimeout(r,30));}
  assert.equal(w.store.drafts.flatMap(d=>d.players).filter(p=>p.name==='Javonte Williams').length,1);
  assert.equal(w.store.drafts.flatMap(d=>d.players).filter(p=>p.name==='Kyren Williams').length,1);
 }finally{app.close()}
});
test('full-name scanning does not click or capture anything during a live draft',async()=>{
 const app=fixture(completedHTML()),w=app.w;let clicks=0;
 try{w.history.replaceState({},'', '/draft/live');w.document.addEventListener('click',()=>clicks++);w.eval(source('completed-names.js'));await w.NukeCompletedNames.sync(async()=>{throw Error('Must not capture a live draft')});assert.equal(clicks,0)}finally{app.close()}
});
