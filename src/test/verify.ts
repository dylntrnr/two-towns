import { runSim } from '../sim/world.ts';

// H3 parity margin
console.log('=== H3 no-shock parity (200 days) ===');
for (const seed of [1, 2, 3]) {
  const r = runSim(seed, 200);
  const sum = (m: any) => m.history.filter((d:any)=>d.day>0&&d.day<=200).reduce((a:number,d:any)=>a+d.outputValue,0);
  const mo = sum(r.market), po = sum(r.planned);
  const diff = Math.abs(mo-po)/Math.max(mo,po);
  console.log(`seed ${seed}: market=${mo.toFixed(0)} planned=${po.toFixed(0)} diff=${(diff*100).toFixed(2)}%`);
}

// Recovery: market grain unmet -> 0, planned stays high
console.log('\n=== Drought divergence (seed 100), unmetSurvival by day ===');
const r = runSim(100, 120, { droughtDay: 30, shockId: 'drought' });
for (const day of [29, 40, 50, 55, 60, 65, 70, 80, 100]) {
  const m = r.market.history.find(d=>d.day===day)?.unmetSurvival ?? -1;
  const p = r.planned.history.find(d=>d.day===day)?.unmetSurvival ?? -1;
  console.log(`day ${day}: market=${m.toFixed(1)} planned=${p.toFixed(1)}`);
}
