(globalThis as any).__MKT_DEBUG = true;
const { createWorld, tick, setFreezeLabor } = await import('../sim/world.ts');
setFreezeLabor(true);
const w = createWorld(100);
for (let day = 1; day <= 12; day++) {
  (globalThis as any).__mktLog = [];
  for (let t = 0; t < 10; t++) tick(w);
  const logs = (globalThis as any).__mktLog as any[];
  const g = logs.filter((l) => l.g === 'grain').at(-1);
  const o = logs.filter((l) => l.g === 'ore').at(-1);
  console.log(`d${day} GRAIN sup=${g.supply.toFixed(1)} dem=${g.demand.toFixed(1)} p=${g.price.toFixed(2)} | ORE sup=${o.supply.toFixed(1)} dem=${o.demand.toFixed(1)} p=${o.price.toFixed(2)}`);
}
