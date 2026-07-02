import { createWorld, tick, triggerShock } from '../sim/world.ts';
import { GOOD_DEFS } from '../sim/goods.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 80; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day >= 28 && day <= 80) {
    const ts = world.market;
    let gMiss = 0, gStock = 0, happy = 0;
    for (const npc of ts.npcs) {
      gMiss += Math.max(0, GOOD_DEFS.grain.dailyNeed - npc.consumedToday.grain);
      gStock += npc.inventory.grain;
      happy += npc.happiness;
    }
    const f = ts.npcs.filter((n) => n.job === 'farmer').length;
    const pg = ts.market!.price.grain.toFixed(2);
    const po = ts.market!.price.ore.toFixed(2);
    console.log(`d${day} f=${f} pg=${pg} po=${po} grainMiss=${gMiss.toFixed(1)} grainStock=${gStock.toFixed(1)} happy=${(happy/60).toFixed(2)}`);
  }
}
