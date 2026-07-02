import { createWorld, tick } from '../sim/world.ts';
import { GOOD_DEFS } from '../sim/goods.ts';

// No shock. Confirm no grain unmet at all (distressFeed never needed => H3 clean).
const world = createWorld(1);
let maxMiss = 0, maxFarmerSwing = 0;
const TPD = 10;
for (let day = 1; day <= 200; day++) {
  for (let t = 0; t < TPD; t++) tick(world);
  let gMiss = 0;
  for (const npc of world.market.npcs) gMiss += Math.max(0, GOOD_DEFS.grain.dailyNeed - npc.consumedToday.grain);
  const f = world.market.npcs.filter(n=>n.job==='farmer').length;
  maxMiss = Math.max(maxMiss, gMiss);
  maxFarmerSwing = Math.max(maxFarmerSwing, Math.abs(f-36));
}
const f = world.market.npcs.filter(n=>n.job==='farmer').length;
console.log(`No-shock market: maxGrainMiss over 200d=${maxMiss.toFixed(2)} (should be ~0), final farmers=${f} (start 36), maxFarmerSwing=${maxFarmerSwing}`);
const pg = world.market.market!.price.grain.toFixed(2);
const po = world.market.market!.price.ore.toFixed(2);
console.log(`final prices: grain=${pg} (start 2.233) ore=${po} (start 3.0)`);
