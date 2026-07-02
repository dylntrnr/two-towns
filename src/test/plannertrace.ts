import { createWorld, tick, triggerShock } from '../sim/world.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 90; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day % 15 === 0) {
    const p = world.planned.planner!;
    const f = world.planned.npcs.filter((n) => n.job === 'farmer').length;
    console.log(
      `d${day} quotaG=${p.quota.grain.toFixed(0)} quotaO=${p.quota.ore.toFixed(0)} assumedYG=${p.assumedYield.grain} laborNeedG=${(p.quota.grain/(p.assumedYield.grain*15)).toFixed(1)} laborNeedO=${(p.quota.ore/(p.assumedYield.ore*15)).toFixed(1)} assignF=${p.laborAssign.farmer} actualF=${f} whG=${p.warehouse.grain.toFixed(0)} lastReportG=${p.lastReport.grain.toFixed(0)}`,
    );
  }
}
