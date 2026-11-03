const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),Core=require('../exposure-core');
const source=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const now='2026-11-03T16:00:00Z';
function fixture(html,initial={},popup=false){
 const dom=new JSDOM(html,{url:popup?'https://fixture.test/popup':'https://fixture.test/draft/week9',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.eval(`Date=class extends Date{constructor(...args){super(...(args.length?args:['${now}']))}static now(){return new Date('${now}').getTime()}}`);
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return [...this.childNodes].map(n=>n.nodeType===3?n.textContent:n.innerText||n.textContent).join('\n')},configurable:true});
 w.HTMLElement.prototype.getClientRects=function(){return [{}]};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return this.id==='roster'||this.closest('#roster')?{left:1400,width:380,height:600}:{left:80,width:670,height:this.classList.contains('row')?80:600}};
 Object.defineProperty(w,'innerWidth',{value:1837});
 const listeners=[];w.store=structuredClone(initial);
 w.chrome={storage:{local:{get:async defaults=>({...defaults,...structuredClone(w.store)}),set:async values=>{const changed={};for(const [k,v]of Object.entries(values)){changed[k]={newValue:v};w.store[k]=structuredClone(v)}for(const fn of listeners)fn(changed,'local')}},onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{query:async()=>[]}};
 w.eval(source('player-catalog.js'));w.eval(source('exposure-core.js'));return dom;
}
async function settle(){await new Promise(r=>setTimeout(r,20))}
const row=(name,pos,team)=>`<div class="row"><div><span>${name}</span><p>${pos} ${team} vs LV</p></div></div>`;
const roster=(name='Brock Purdy',pos='QB',team='SF')=>`<section id="roster"><div><span>Pick position</span><span>Projected</span></div><h3>${pos}</h3><div class="row"><div><span>${name}</span><p>${team} vs LV</p></div></div><h3>RB</h3><h3>WR</h3><h3>TE</h3></section>`;
function liveHTML(myRoster=roster()){return `<body><section id="players"><h2>Players</h2><p>ADP Proj</p>${row('Mike Evans','WR10','SF')}${row('Deebo Samuel','WR20','SF')}${row('George Kittle','TE2','SF')}${row('Christian McCaffrey','RB3','SF')}${row('Brock Purdy','QB4','SF')}${row('Jaxon Smith-Njigba','WR1','SEA')}</section><section><h2>Queue</h2>${row('Patrick Mahomes','QB','KC')}</section>${myRoster}</body>`}
test('NFL workspace rolls to Week 9 on Tuesday Central, retaining other sports and stored history',()=>{
 assert.equal(Core.nflPeriod(now).week,9);
 assert.equal(Core.nflPeriod('2026-11-03T05:59:00Z').week,8);
 assert.equal(Core.nflPeriod('2026-11-03T06:00:00Z').week,9);
 const drafts=[{sport:'NFL',contest:'Battle Royale - Week 8'},{sport:'NFL',contest:'Battle Royale - Week 9'},{sport:'NFL',contest:'The Hurry Up',capturedAt:'2026-11-01T15:00:00Z'},{sport:'NFL',contest:'The Hurry Up',capturedAt:now},{sport:'NBA',contest:'NBA Monday'}];
 assert.deepEqual(Core.currentDrafts(drafts,now),[drafts[1],drafts[3],drafts[4]]);assert.equal(drafts.length,5);
});
test('Purdy highlights live SF RB/WR/TE even with no history or seed SF identities',async()=>{
 const dom=fixture(liveHTML()),w=dom.window;
 w.NUKE_PLAYER_CATALOG=w.NUKE_PLAYER_CATALOG.filter(p=>p.teamAbbr!=='SF');
 try{w.eval(source('perf-guard.js'));w.eval(source('active-badges.js'));await settle();
 const glow=[...w.document.querySelectorAll('#players .nuke-qb-stack')].map(x=>x.textContent);
 assert.deepEqual(glow,['Mike Evans','Deebo Samuel','George Kittle','Christian McCaffrey']);
 assert.equal(w.document.querySelectorAll('#roster .nuke-qb-stack,#players .row:last-child .nuke-qb-stack').length,0);
 }finally{w.close()}
});
test('live SF labels override saved former-team metadata and reverse stacks work',async()=>{
 const initial={playerUniverse:{purdy:{name:'Brock Purdy',pos:'QB',teamAbbr:'SF'},evans:{name:'Mike Evans',pos:'WR',team:'Tampa Bay Buccaneers',teamAbbr:'TB'}}};
 const dom=fixture(liveHTML(roster('Mike Evans','WR')),initial),w=dom.window;
 try{w.eval(source('active-badges.js'));await settle();
 assert.equal(w.document.querySelector('[data-nuke-reverse-stack-name]').textContent,'Brock Purdy');
 assert.equal(w.document.querySelectorAll('[data-nuke-forward-stack-name]').length,0);
 }finally{w.close()}
});
test('popup removes Week 8, selects zero-entry Week 9 and keeps history stored',async()=>{
 const old={sport:'NFL',contest:'Battle Royale - Week 8'},current={sport:'NFL',contest:'Battle Royale - Week 9'};
 const drafts=[{draftId:'old',...old,players:[{name:'Josh Allen'}]}];
 const dom=fixture(source('popup.html').replace(/<script[^>]*><\/script>/g,''),{drafts,exposureScope:old,knownTournaments:[old,current]},true),w=dom.window;
 try{w.eval(source('popup.js'));await settle();
 const options=[...w.document.querySelector('#contest').options].map(x=>x.value);
 assert.equal(options.includes(old.contest),false);assert.equal(options.includes(current.contest),true);
 assert.equal(w.document.querySelector('#contest').value,current.contest);
 assert.equal(w.document.querySelector('#draftCount').textContent,'0');assert.deepEqual(w.store.drafts,drafts);
 assert.equal(w.store.exposureScope.contest,current.contest);
 }finally{w.close()}
});
test('unselected tournament never falls back to all historical exposure',async()=>{
 const dom=fixture(liveHTML(),{drafts:[{sport:'NFL',contest:'Battle Royale - Week 9',players:[{name:'Brock Purdy'}]},{sport:'NFL',contest:'The Hurry Up',capturedAt:now,players:[{name:'Brock Purdy'}]}]}),w=dom.window;
 try{w.eval(source('active-badges.js'));await settle();assert.ok([...w.document.querySelectorAll('.nuke-active-own')].every(x=>x.textContent==='0% · 0/0'))}finally{w.close()}
});
test('changing the current roster clears the previous SF glow',async()=>{
 const dom=fixture(liveHTML()),w=dom.window;
 try{w.eval(source('active-badges.js'));await settle();assert.equal(w.document.querySelectorAll('[data-nuke-forward-stack-name]').length,4);
 w.document.querySelector('#roster').outerHTML=roster('Patrick Mahomes','QB','KC');
 w.document.body.click();await new Promise(r=>setTimeout(r,260));
 assert.equal(w.document.querySelectorAll('[data-nuke-forward-stack-name]').length,0);
 }finally{w.close()}
});
test('zero-entry selected tournament does not inherit another Week 9 tournament counts',async()=>{
 const scope={sport:'NFL',contest:'The Hurry Up'};
 const dom=fixture(liveHTML(),{exposureScope:scope,drafts:[{sport:'NFL',contest:'Battle Royale - Week 9',players:[{name:'Brock Purdy'}]}]}),w=dom.window;
 try{w.eval(source('active-badges.js'));await settle();assert.ok([...w.document.querySelectorAll('.nuke-active-own')].every(x=>x.textContent==='0% · 0/0'&&x.title.endsWith('The Hurry Up')))}finally{w.close()}
});
test('unnumbered Week 8 tournaments disappear even when the old page scope was saved',async()=>{
 const scope={sport:'NFL',contest:'The Hurry Up'};
 const drafts=[{draftId:'old',...scope,capturedAt:'2026-11-01T16:00:00Z',players:[{name:'Josh Allen'}]}];
 const dom=fixture(source('popup.html').replace(/<script[^>]*><\/script>/g,''),{drafts,exposureScope:scope,activePageScope:scope,knownTournaments:[scope]},true),w=dom.window;
 try{w.eval(source('popup.js'));await settle();assert.equal([...w.document.querySelector('#contest').options].some(x=>x.value===scope.contest),false);assert.equal(w.store.drafts.length,1)}finally{w.close()}
});
