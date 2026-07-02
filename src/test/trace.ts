import { createWorld, tick, triggerShock } from '../sim/world.ts';

const w = createWorld(100);
const D = 30;
for (let day = 1; day <= 90; day++) {
  if (day === D) triggerShock(w, 'drought');
  for (let t = 0; t < 10; t++) tick(w);
  if (day % 3 === 0 || (day >= 28 && day <= 60)) {
    const p = w.planned.planner!;
    const mAvgInvGrain = w.market.npcs.reduce((a, n) => a + n.inventory.grain, 0) / w.market.npcs.length;
    const mFarmers = w.market.npcs.filter((n) => n.job === 'farmer').length;
    const mHappy = w.market.npcs.reduce((a, n) => a + n.happiness, 0) / w.market.npcs.length;
    const pHappy = w.planned.npcs.reduce((a, n) => a + n.happiness, 0) / w.planned.npcs.length;
    const mm = w.market.metrics.history[w.market.metrics.history.length - 1];
    const pm = w.planned.metrics.history[w.planned.metrics.history.length - 1];
    console.log(
      `d${day} | MKT price g=${w.market.market!.price.grain.toFixed(2)} o=${w.market.market!.price.ore.toFixed(2)} farmers=${mFarmers} inv=${mAvgInvGrain.toFixed(1)} happy=${mHappy.toFixed(2)} unmet=${mm.unmetDemand.toFixed(1)} | PLN wh_g=${p.warehouse.grain.toFixed(0)} wh_o=${p.warehouse.ore.toFixed(0)} quota_g=${p.quota.grain.toFixed(0)} happy=${pHappy.toFixed(2)} unmet=${pm.unmetDemand.toFixed(1)}`,
    );
  }
}
