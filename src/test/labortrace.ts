// Trace market labor split + prices over no-shock run.
import { createWorld, tick } from '../sim/world.ts';

const world = createWorld(1);
const TPD = 10;
for (let day = 1; day <= 120; day++) {
  for (let t = 0; t < TPD; t++) tick(world);
  if ([1, 3, 5, 7, 9, 11, 15, 20, 30, 50, 80, 120].includes(day)) {
    const f = world.market.npcs.filter((n) => n.job === 'farmer').length;
    const m = world.market.npcs.filter((n) => n.job === 'miner').length;
    const ms = world.market.market!;
    const avgMoney = world.market.npcs.reduce((a, n) => a + n.money, 0) / world.market.npcs.length;
    const avgGrainInv = world.market.npcs.reduce((a, n) => a + n.inventory.grain, 0) / world.market.npcs.length;
    console.log(
      `day ${String(day).padStart(3)}: farmers=${f} miners=${m} | price grain=${ms.price.grain.toFixed(2)} ore=${ms.price.ore.toFixed(2)} | avgMoney=${avgMoney.toFixed(1)} avgGrainInv=${avgGrainInv.toFixed(2)}`,
    );
  }
}
