import { createWorld, tick, triggerShock } from '../sim/world.ts';
import { goodOfJob } from '../sim/goods.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 60; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day >= 30 && day <= 56 && day % 2 === 0) {
    const ms = world.market.market!;
    const npc = world.market.npcs[0]; // a farmer
    const npcM = world.market.npcs.find((n) => n.job === 'miner')!;
    console.log(
      `d${day} pGrain=${ms.price.grain.toFixed(2)} pOre=${ms.price.ore.toFixed(2)} | farmerEMA f=${npc.incomeEMA.farmer.toFixed(2)} m=${npc.incomeEMA.miner.toFixed(2)} hap=${npc.happiness.toFixed(2)}`,
    );
  }
}
