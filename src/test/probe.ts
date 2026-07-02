import { runSim } from '../sim/world.ts';

const DROUGHT_DAY = 30;
const RECOVERY_WINDOW = 25;

function baselineUnmet(m: any, preShockDay: number): number {
  const window = m.history.filter((d: any) => d.day > preShockDay - 10 && d.day <= preShockDay);
  if (window.length === 0) return 0;
  return window.reduce((a: number, d: any) => a + d.unmetDemand, 0) / window.length;
}
function recoveryDays(m: any, droughtDay: number, baseline: number, maxDays: number): number {
  const threshold = Math.max(baseline * 1.2, 0.5);
  const disruptLevel = Math.max(baseline * 2 + 1, 5);
  let wasDisrupted = false;
  for (let dd = 1; dd <= maxDays; dd++) {
    const day = droughtDay + dd;
    const window = m.history.filter((d: any) => d.day > day - 3 && d.day <= day);
    if (window.length === 0) continue;
    const avg = window.reduce((a: number, d: any) => a + d.unmetDemand, 0) / window.length;
    if (avg >= disruptLevel) wasDisrupted = true;
    if (wasDisrupted && avg <= threshold) return dd;
  }
  return Infinity;
}

let marketRecovers = 0, plannedFails = 0;
const rows: string[] = [];
for (const seed of [100, 101, 102, 103, 104]) {
  const r = runSim(seed, 120, { droughtDay: DROUGHT_DAY, shockId: 'drought' });
  const mBase = baselineUnmet(r.market, DROUGHT_DAY);
  const pBase = baselineUnmet(r.planned, DROUGHT_DAY);
  const mRec = recoveryDays(r.market, DROUGHT_DAY, mBase, RECOVERY_WINDOW);
  const pRec = recoveryDays(r.planned, DROUGHT_DAY, pBase, RECOVERY_WINDOW);
  // sample planned unmet at a few days in window
  const m45 = r.market.history.find((d) => d.day === 45)?.unmetDemand.toFixed(1);
  const m55 = r.market.history.find((d) => d.day === 55)?.unmetDemand.toFixed(1);
  const p55 = r.planned.history.find((d) => d.day === 55)?.unmetDemand.toFixed(1);
  rows.push(`seed ${seed}: mRec=${mRec} pRec=${pRec} | mktUnmet d45=${m45} d55=${m55} | plnUnmet d55=${p55}`);
  if (mRec <= RECOVERY_WINDOW) marketRecovers++;
  if (pRec > RECOVERY_WINDOW) plannedFails++;
}
console.log(rows.join('\n'));
console.log(`marketRecovers=${marketRecovers}/5 plannedFails=${plannedFails}/5`);
