import { createWorld, tick, triggerShock } from '../sim/world.ts';
import { GOOD_DEFS } from '../sim/goods.ts';

const world = createWorld(100);
const TPD = 10;
for (let day = 1; day <= 70; day++) {
  if (day === 30) triggerShock(world, 'drought');
  for (let t = 0; t < TPD; t++) tick(world);
  if (day >= 40 && day <= 70) {
    const ts = world.market;
    let oProd = 0, oMiss = 0, oStock = 0, money = 0, gStock = 0, gMiss=0;
    let broke = 0;
    for (const npc of ts.npcs) {
      oProd += npc.producedToday.ore;
      oMiss += Math.max(0, 0.5 - npc.consumedToday.ore);
      oStock += npc.inventory.ore;
      gStock += npc.inventory.grain;
      gMiss += Math.max(0, 1 - npc.consumedToday.grain);
      money += npc.money;
      if (npc.money < 1) broke++;
    }
    const f = ts.npcs.filter((n) => n.job === 'farmer').length;
    const pg = ts.market!.price.grain.toFixed(2);
    const po = ts.market!.price.ore.toFixed(2);
    // money held by farmers vs miners
    let farmerMoney=0, minerMoney=0;
    for (const npc of ts.npcs) { if(npc.job==='farmer') farmerMoney+=npc.money; else minerMoney+=npc.money; }
    console.log(`d${day} f=${f} pg=${pg} po=${po} | gMiss=${gMiss.toFixed(1)} gStock=${gStock.toFixed(0)} oMiss=${oMiss.toFixed(1)} | money=${money.toFixed(0)} broke=${broke} fMoney=${farmerMoney.toFixed(0)} mMoney=${minerMoney.toFixed(0)}`);
  }
}
