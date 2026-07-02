// Honesty test suite (§8). Gates the whole project.
// H3: no-shock 200-day output parity within 5%.
// Divergence: post-drought, market recovers unmet-demand to <1.2x baseline
//   within 25 days in >=90% of runs; planned town does NOT in >=90%.

import { describe, it, expect } from 'vitest';
import { runSim } from '../sim/world.ts';
import { MetricsAccumulator } from '../sim/metrics.ts';

function totalOutput(m: MetricsAccumulator, fromDay: number, toDay: number): number {
  let sum = 0;
  for (const d of m.history) {
    if (d.day > fromDay && d.day <= toDay) sum += d.outputValue;
  }
  return sum;
}

/**
 * Baseline unmet = average daily SURVIVAL (grain) unmet over the calm pre-shock
 * window. Recovery is judged on survival unmet, not the coin-weighted total: a
 * town where people can eat but lack comfort goods is not "still in crisis."
 * Starvation is the lesson the sim teaches.
 */
function baselineUnmet(m: MetricsAccumulator, preShockDay: number): number {
  const window = m.history.filter((d) => d.day > preShockDay - 10 && d.day <= preShockDay);
  if (window.length === 0) return 0;
  const avg = window.reduce((a, d) => a + d.unmetSurvival, 0) / window.length;
  return avg;
}

/**
 * Days after drought start until unmet-demand returns to < 1.2x baseline
 * (trailing 3-day average). A town only counts as "recovered" if its unmet
 * demand FIRST got disrupted (rose meaningfully above baseline) and THEN came
 * back down. A town that is still coasting on a buffer and hasn't been disrupted
 * yet is NOT "recovered" - otherwise a planned town whose warehouse hasn't
 * drained yet would falsely score as instantly recovered on day 1. Returns
 * Infinity if it never recovers (or never gets disrupted then recovers) within
 * `maxDays`.
 */
function recoveryDays(
  m: MetricsAccumulator,
  droughtDay: number,
  baseline: number,
  maxDays: number,
): number {
  const threshold = Math.max(baseline * 1.2, 0.5); // small absolute floor
  const disruptLevel = Math.max(baseline * 2 + 1, 5); // must have been hit hard
  let wasDisrupted = false;
  for (let dd = 1; dd <= maxDays; dd++) {
    const day = droughtDay + dd;
    // trailing 3-day average
    const window = m.history.filter((d) => d.day > day - 3 && d.day <= day);
    if (window.length === 0) continue;
    const avg = window.reduce((a, d) => a + d.unmetSurvival, 0) / window.length;
    if (avg >= disruptLevel) wasDisrupted = true;
    // only a genuine recovery counts: disrupted first, then back below threshold
    if (wasDisrupted && avg <= threshold) return dd;
  }
  return Infinity;
}

describe('H3 — steady-state parity (no shock)', () => {
  it('both towns 200-day output within 5%', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      const r = runSim(seed, 200);
      const mOut = totalOutput(r.market, 0, 200);
      const pOut = totalOutput(r.planned, 0, 200);
      const diff = Math.abs(mOut - pOut) / Math.max(mOut, pOut);
      expect(diff, `seed ${seed} output diff ${(diff * 100).toFixed(2)}%`).toBeLessThan(0.05);
    }
  });
});

describe('Divergence — drought recovery seed sweep', () => {
  const DROUGHT_DAY = 30;
  const DROUGHT_LEN = 20; // matches WORLD_CONSTANTS.DROUGHT_DAYS
  // "Recovers within 25 days post-shock" (spec §6): the shock lasts 20 days, so
  // the town has until 25 days AFTER the drought lifts to bring survival-unmet
  // back down. Measured from drought START that is 20 + 25 = 45 days.
  const RECOVERY_WINDOW = DROUGHT_LEN + 25;
  const seeds = Array.from({ length: 50 }, (_, i) => i + 100);

  let marketRecovers = 0;
  let plannedFails = 0;

  for (const seed of seeds) {
    const r = runSim(seed, 120, { droughtDay: DROUGHT_DAY, shockId: 'drought' });
    const mBase = baselineUnmet(r.market, DROUGHT_DAY);
    const pBase = baselineUnmet(r.planned, DROUGHT_DAY);
    const mRec = recoveryDays(r.market, DROUGHT_DAY, mBase, RECOVERY_WINDOW);
    const pRec = recoveryDays(r.planned, DROUGHT_DAY, pBase, RECOVERY_WINDOW);
    if (mRec <= RECOVERY_WINDOW) marketRecovers++;
    if (pRec > RECOVERY_WINDOW) plannedFails++;
  }

  it('market recovers within 25 days in >=90% of runs', () => {
    const frac = marketRecovers / seeds.length;
    expect(frac, `market recovery rate ${(frac * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(0.9);
  });

  it('planned town does NOT recover within 25 days in >=90% of runs', () => {
    const frac = plannedFails / seeds.length;
    expect(frac, `planned failure rate ${(frac * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(0.9);
  });
});
