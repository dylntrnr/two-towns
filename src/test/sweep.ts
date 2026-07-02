// Diagnostic sweep (not a test). Run: npx tsx src/test/sweep.ts
import { runSim } from '../sim/world.ts';
import { MetricsAccumulator } from '../sim/metrics.ts';

function totalOutput(m: MetricsAccumulator, a: number, b: number): number {
  let s = 0;
  for (const d of m.history) if (d.day > a && d.day <= b) s += d.outputValue;
  return s;
}
function baselineUnmet(m: MetricsAccumulator, day: number): number {
  const w = m.history.filter((d) => d.day > day - 10 && d.day <= day);
  return w.length ? w.reduce((a, d) => a + d.unmetDemand, 0) / w.length : 0;
}
function recoveryDays(m: MetricsAccumulator, dDay: number, base: number, maxD: number): number {
  const thr = Math.max(base * 1.2, 0.5);
  for (let dd = 1; dd <= maxD; dd++) {
    const day = dDay + dd;
    const w = m.history.filter((d) => d.day > day - 3 && d.day <= day);
    if (!w.length) continue;
    const avg = w.reduce((a, d) => a + d.unmetDemand, 0) / w.length;
    if (avg <= thr) return dd;
  }
  return Infinity;
}

// H3 parity
console.log('=== H3 parity (no shock, 200 days) ===');
let worstDiff = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const r = runSim(seed, 200);
  const mo = totalOutput(r.market, 0, 200);
  const po = totalOutput(r.planned, 0, 200);
  const diff = Math.abs(mo - po) / Math.max(mo, po);
  worstDiff = Math.max(worstDiff, diff);
  console.log(`seed ${seed}: market=${mo.toFixed(0)} planned=${po.toFixed(0)} diff=${(diff * 100).toFixed(2)}%`);
}
console.log(`worst diff = ${(worstDiff * 100).toFixed(2)}%\n`);

// Divergence
console.log('=== Divergence (drought day 30, 50 seeds) ===');
const D = 30, WIN = 25;
const seeds = Array.from({ length: 50 }, (_, i) => i + 100);
let mRec = 0, pFail = 0;
const mRecDays: number[] = [], pRecDays: number[] = [];
for (const seed of seeds) {
  const r = runSim(seed, 120, { droughtDay: D, shockId: 'drought' });
  const mb = baselineUnmet(r.market, D);
  const pb = baselineUnmet(r.planned, D);
  const m = recoveryDays(r.market, D, mb, WIN);
  const p = recoveryDays(r.planned, D, pb, WIN);
  mRecDays.push(m); pRecDays.push(p);
  if (m <= WIN) mRec++;
  if (p > WIN) pFail++;
}
console.log(`market recovers <=25d: ${mRec}/50 = ${(mRec / 50 * 100).toFixed(0)}%`);
console.log(`planned fails >25d:    ${pFail}/50 = ${(pFail / 50 * 100).toFixed(0)}%`);
const finiteM = mRecDays.filter((x) => isFinite(x));
console.log(`market recovery days: min=${Math.min(...finiteM)} max=${Math.max(...finiteM)} avg=${(finiteM.reduce((a, b) => a + b, 0) / finiteM.length).toFixed(1)}`);
const finiteP = pRecDays.filter((x) => isFinite(x));
console.log(`planned recovery days (finite): ${finiteP.length} runs, ${finiteP.length ? 'avg=' + (finiteP.reduce((a, b) => a + b, 0) / finiteP.length).toFixed(1) : 'none recovered'}`);

// Sample trace
console.log('\n=== Sample trace seed 100 (unmet demand around drought) ===');
const r = runSim(100, 90, { droughtDay: D, shockId: 'drought' });
for (let day = 25; day <= 75; day += 3) {
  const m = r.market.history.find((d) => d.day === day);
  const p = r.planned.history.find((d) => d.day === day);
  console.log(`day ${day}: market unmet=${m?.unmetDemand.toFixed(1)} out=${m?.outputValue.toFixed(0)} | planned unmet=${p?.unmetDemand.toFixed(1)} out=${p?.outputValue.toFixed(0)} q=${p?.protesting}`);
}
