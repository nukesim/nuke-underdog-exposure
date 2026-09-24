const test=require('node:test');const assert=require('node:assert/strict');
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9'. -]/g,'');
const tokens=s=>norm(s).split(' ').filter(Boolean);
const aliasKeys=s=>{const a=tokens(s);if(!a.length)return[];const out=[norm(s)];if(a.length>1)out.push(a.slice(-2).join(' '));out.push(a.at(-1));if(/^(ii|iii|iv|jr|sr)$/.test(a.at(-1))&&a.length>1){out.push(a.slice(-2).join(' '));out.push(a.at(-2))}return[...new Set(out)]};
function strength(a,b){const na=norm(a),nb=norm(b);if(!na||!nb)return 0;if(na===nb)return 4;const at=tokens(a),bt=tokens(b);if(at.length<bt.length&&aliasKeys(b).includes(na))return at.length===1?1:2;if(bt.length<at.length&&aliasKeys(a).includes(nb))return bt.length===1?1:2;return 0}
function rosterMatch(a,b){if(a.length!==b.length||!a.length)return false;const used=new Set();function walk(i){if(i===a.length)return true;for(let j=0;j<b.length;j++){if(used.has(j)||!strength(a[i].name,b[j].name))continue;used.add(j);if(walk(i+1))return true;used.delete(j)}return false}return walk(0)}
test('surname matches its full player',()=>assert.ok(strength('Gibbs','Jahmyr Gibbs')>0));
test('suffix surname matches full player',()=>assert.ok(strength('Walker III','Kenneth Walker III')>0));
test('two different full Browns never collide',()=>assert.equal(strength('Chase Brown','Amon-Ra St. Brown'),0));
test('two different Wilson full names never collide',()=>assert.equal(strength('Garrett Wilson','Michael Wilson'),0));
test('legacy and full-name versions of same roster match',()=>assert.equal(rosterMatch([{name:'Gibbs'},{name:'Jefferson'}],[{name:'Jahmyr Gibbs'},{name:'Justin Jefferson'}]),true));
test('different full-name Brown rosters do not match',()=>assert.equal(rosterMatch([{name:'Chase Brown'},{name:'Justin Jefferson'}],[{name:'Amon-Ra St. Brown'},{name:'Justin Jefferson'}]),false));

test('compound surname expands only toward longer exact suffix',()=>{assert.ok(strength('St. Brown','Amon-Ra St. Brown')>0);assert.equal(strength('Chase Brown','Amon-Ra St. Brown'),0)});
