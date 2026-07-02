import { createWorld, tick, triggerShock } from '../sim/world.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 70; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day === 55 || day === 65 || day === 70) {
    const ts = world.market;
    console.log(`--- day ${day} ---`);
    const broke = ts.npcs.filter(n => n.money < 1);
    console.log(`broke count=${broke.length}`);
    for (const n of broke.slice(0, 20)) {
      console.log(`  id=${n.id} job=${n.job} money=${n.money.toFixed(1)} gInv=${n.inventory.grain.toFixed(1)} oInv=${n.inventory.ore.toFixed(1)} incToday=${n.incomeToday.toFixed(1)} happy=${n.happiness.toFixed(2)} retrain=${n.retrainTicks} protest=${n.protesting} emaF=${n.incomeEMA.farmer.toFixed(1)} emaM=${n.incomeEMA.miner.toFixed(1)}`);
    }
  }
}
