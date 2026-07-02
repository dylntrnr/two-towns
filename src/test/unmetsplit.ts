import { createWorld, tick, triggerShock } from '../sim/world.ts';
import { GOOD_DEFS } from '../sim/goods.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 70; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day >= 48 && day <= 70 && day % 3 === 0) {
    for (const [name, ts] of [['MKT', world.market], ['PLN', world.planned]] as const) {
      let gMiss = 0, oMiss = 0;
      for (const npc of ts.npcs) {
        gMiss += Math.max(0, GOOD_DEFS.grain.dailyNeed - npc.consumedToday.grain);
        oMiss += Math.max(0, 0.5 - npc.consumedToday.ore);
      }
      const f = ts.npcs.filter((n) => n.job === 'farmer').length;
      process.stdout.write(`${name} d${day} f=${f} grainMiss=${gMiss.toFixed(1)} oreMiss=${oMiss.toFixed(1)}  `);
    }
    console.log('');
  }
}
