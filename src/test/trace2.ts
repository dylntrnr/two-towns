import { createWorld, tick } from '../sim/world.ts';
const w = createWorld(100);
for (let day = 1; day <= 40; day++) {
  for (let t = 0; t < 10; t++) tick(w);
  const m = w.market;
  const avgInvG = m.npcs.reduce((a, n) => a + n.inventory.grain, 0) / 60;
  const avgInvO = m.npcs.reduce((a, n) => a + n.inventory.ore, 0) / 60;
  const avgMoney = m.npcs.reduce((a, n) => a + n.money, 0) / 60;
  const farmers = m.npcs.filter((n) => n.job === 'farmer').length;
  const happy = m.npcs.reduce((a, n) => a + n.happiness, 0) / 60;
  const mm = m.metrics.history[m.metrics.history.length - 1];
  console.log(`d${day} pG=${m.market!.price.grain.toFixed(2)} pO=${m.market!.price.ore.toFixed(2)} farm=${farmers} invG=${avgInvG.toFixed(1)} invO=${avgInvO.toFixed(1)} $=${avgMoney.toFixed(1)} happy=${happy.toFixed(2)} unmet=${mm.unmetDemand.toFixed(1)}`);
}
