// Trace market + planned labor + prices through a drought.
import { createWorld, tick, triggerShock } from '../sim/world.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 120; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day >= 28 && day <= 120 && (day % 4 === 0 || day === 31 || day === 50)) {
    const mf = world.market.npcs.filter((n) => n.job === 'farmer').length;
    const ms = world.market.market!;
    const pf = world.planned.npcs.filter((n) => n.job === 'farmer').length;
    const p = world.planned.planner!;
    const mHap = world.market.npcs.reduce((a, n) => a + n.happiness, 0) / 60;
    console.log(
      `d${String(day).padStart(3)} MKT f=${mf} pGrain=${ms.price.grain.toFixed(2)} hap=${mHap.toFixed(2)} | PLN f=${pf} whG=${p.warehouse.grain.toFixed(0)} quota=${p.quota.grain.toFixed(0)}`,
    );
  }
}
