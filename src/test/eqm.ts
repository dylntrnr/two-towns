// Find equilibrium prices with labor frozen at 36/24.
import { createWorld, tick, setFreezeLabor } from '../sim/world.ts';
setFreezeLabor(true);
const w = createWorld(100);
for (let day = 1; day <= 100; day++) {
  for (let t = 0; t < 10; t++) tick(w);
  if (day % 5 === 0) {
    const m = w.market;
    const invG = m.npcs.reduce((a, n) => a + n.inventory.grain, 0) / 60;
    const invO = m.npcs.reduce((a, n) => a + n.inventory.ore, 0) / 60;
    const fInc = m.npcs.filter(n=>n.job==='farmer').reduce((a,n)=>a+n.incomeEMA.farmer,0);
    const mm = m.metrics.history[m.metrics.history.length - 1];
    console.log(`d${day} pG=${m.market!.price.grain.toFixed(2)} pO=${m.market!.price.ore.toFixed(2)} invG=${invG.toFixed(2)} invO=${invO.toFixed(2)} unmet=${mm.unmetDemand.toFixed(1)}`);
    void fInc;
  }
}
