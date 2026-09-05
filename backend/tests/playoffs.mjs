import assert from 'node:assert/strict';
import { seedSlots, advanceSlots } from '../dist/lib/playoffs.js';
for (const n of [4, 6, 8, 10, 12]) {
  const ids = Array.from({length:n}, (_,i) => `team-${i+1}`);
  let slots = seedSlots(ids);
  assert.deepEqual([...slots.filter(Boolean)].sort(), [...ids].sort());
  assert.equal(slots.length, 2 ** Math.ceil(Math.log2(n)));
  for(let i=0;i<slots.length;i+=2) if(!slots[i] || !slots[i+1]) {
    assert.ok(Number((slots[i] || slots[i+1]).split('-')[1]) <= slots.length-n);
  }
  let played=0;
  while(slots.length>1) {
    const games=[];
    for(let i=0;i<slots.length;i+=2) if(slots[i] && slots[i+1]) games.push({slot:i/2,status:'FINISHED',home_team_id:slots[i],away_team_id:slots[i+1],home_score:12,away_score:6});
    played+=games.length;
    assert.throws(()=>advanceSlots(slots, []));
    const tie=games.map(g=>({...g,away_score:12}));
    assert.throws(()=>advanceSlots(slots,tie));
    slots=advanceSlots(slots,games);
    assert.equal(new Set(slots).size,slots.length);
  }
  assert.equal(played,n-1);
  assert.ok(ids.includes(slots[0]));
  console.log(`OK: ${n} equipos, ${played} partidos, campeón único`);
}
assert.throws(()=>seedSlots(['a','a','b','c']));
assert.throws(()=>seedSlots(['a','b']));
