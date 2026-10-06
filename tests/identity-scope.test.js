const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../exposure-core');
require('../player-catalog');
const pool=Core.catalog(globalThis.NUKE_PLAYER_CATALOG);
const scope4={sport:'NFL',contest:'Battle Royale - Week 4'},scope5={sport:'NFL',contest:'Battle Royale - Week 5'};
test('all 545 CSV identities resolve by stable and appearance IDs',()=>{
 assert.equal(globalThis.NUKE_PLAYER_CATALOG.length,545);
 for(const p of globalThis.NUKE_PLAYER_CATALOG)for(const id of p.ids)assert.equal(Core.resolve({id,name:p.name.split(' ').at(-1)},pool).name,p.name);
});
test('structured API joins snake_case and camelCase names',()=>{
 assert.equal(Core.player({first_name:'Darnell',last_name:'Washington'}).name,'Darnell Washington');
 assert.equal(Core.player({player:{firstName:'Hunter',lastName:'Henry'}}).name,'Hunter Henry');
 assert.equal(Core.player({appearance:{player:{first_name:'Keenan',last_name:'Allen'}}}).name,'Keenan Allen');
});
test('shared surnames require identity or position/team evidence',()=>{
 for(const name of ['Washington','Henry','Allen','Wilson','Brown'])assert.equal(Core.resolve({name,sport:'NFL'},pool).unresolved,true);
 assert.equal(Core.resolve({name:'Washington',pos:'TE',sport:'NFL'},pool).name,'Darnell Washington');
 assert.equal(Core.resolve({name:'Henry',pos:'TE',sport:'NFL'},pool).name,'Hunter Henry');
 assert.equal(Core.resolve({name:'Allen',pos:'WR',sport:'NFL'},pool).name,'Keenan Allen');
 assert.equal(Core.resolve({name:'Allen',pos:'RB',sport:'NFL'},pool).unresolved,true);
 assert.equal(Core.resolve({name:'Allen',team:'New York Jets',sport:'NFL'},pool).name,'Braelon Allen');
 assert.equal(Core.resolve({name:'Allen',team:'Imaginary Team',sport:'NFL'},pool).unresolved,true);
});
test('unique compound and suffix surnames resolve',()=>{
 assert.equal(Core.resolve({name:'Smith-Njigba'},pool).name,'Jaxon Smith-Njigba');
 assert.equal(Core.resolve({name:'Walker III'},Core.catalog([{name:'Kenneth Walker III',id:'walker'}])).name,'Kenneth Walker III');
 assert.equal(Core.resolve({name:'St. Brown',id:pool.find(x=>x.name==='Amon-Ra St. Brown').id},pool).name,'Amon-Ra St. Brown');
});
test('legacy exposure and same-denominator other tournament never override',()=>{
 const old={name:'Keenan Allen',count:20,total:127};
 assert.equal(Core.officialCount(old,scope5,127),null);
 assert.equal(Core.officialCount({...old,scope:scope4},scope5,127),null);
 assert.equal(Core.officialCount({...old,scope:scope5},scope5,127),20);
 assert.equal(Core.officialCount({...old,scope:scope5},scope5,0),null);
});
test('Week 5 starts empty while Week 4 history remains',()=>{
 const drafts=[{draftId:'old',...scope4,players:[{name:'Keenan Allen'}]}];
 assert.equal(Core.displayDrafts(drafts,pool).filter(d=>Core.matchesScope(d,scope5)).length,0);
 assert.equal(Core.displayDrafts(drafts,pool).filter(d=>Core.matchesScope(d,scope4)).length,1);
});
test('distinct real entries with identical rosters are preserved',()=>{
 const players=[{name:'Keenan Allen'},{name:'Hunter Henry'}];
 const drafts=[{draftId:'a',...scope4,players},{draftId:'b',...scope4,players},{draftId:'a',...scope4,players},{draftId:'dom|old',...scope4,players}];
 assert.deepEqual(Core.displayDrafts(drafts,pool).map(d=>d.draftId),['a','b']);
});
test('ID migration upgrades saved surnames without modifying original data',()=>{
 const p=pool.find(x=>x.name==='Keenan Allen');const drafts=[{draftId:'a',...scope4,players:[{id:p.id,name:'Allen'}]}];
 const repaired=Core.displayDrafts(drafts,pool);assert.equal(repaired[0].players[0].name,'Keenan Allen');assert.equal(drafts[0].players[0].name,'Allen');
});
