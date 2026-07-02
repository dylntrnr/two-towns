// Diagnostic: print both towns' daily trajectory, no-shock and drought.
// Run: npx tsx src/test/diag.ts
import { runSim } from '../sim/world.ts';

function summarize(label: string, r: ReturnType<typeof runSim>, days: number[]) {
  console.log(`\n=== ${label} ===`);
  console.log('day |   mOut  mUnmet  mHap | pOut  pUnmet  pHap');
  for (const day of days) {
    const m = r.market.history.find((d) => d.day === day);
    const p = r.planned.history.find((d) => d.day === day);
    if (!m || !p) continue;
    console.log(
      `${String(day).padStart(3)} | ${m.outputValue.toFixed(1).padStart(6)} ${m.unmetDemand.toFixed(1).padStart(6)} ${m.avgHappiness.toFixed(2).padStart(5)} | ${p.outputValue.toFixed(1).padStart(6)} ${p.unmetDemand.toFixed(1).padStart(6)} ${p.avgHappiness.toFixed(2).padStart(5)}`,
    );
  }
}

function totalOut(r: ReturnType<typeof runSim>, town: 'market' | 'planned') {
  return r[town].history.reduce((a, d) => a + d.outputValue, 0);
}

// No-shock, 200 days
const ns = runSim(1, 200);
summarize('NO SHOCK seed=1', ns, [1, 5, 10, 20, 50, 100, 150, 200]);
console.log(`  total market=${totalOut(ns, 'market').toFixed(0)}  planned=${totalOut(ns, 'planned').toFixed(0)}  diff=${((Math.abs(totalOut(ns,'market')-totalOut(ns,'planned'))/Math.max(totalOut(ns,'market'),totalOut(ns,'planned')))*100).toFixed(1)}%`);

// Drought at day 30
const dr = runSim(100, 120, { droughtDay: 30, shockId: 'drought' });
summarize('DROUGHT@30 seed=100', dr, [25, 30, 33, 36, 40, 45, 50, 55, 60, 70, 90, 120]);
