// Metrics recording (§2.8). Pure TS, zero DOM/Pixi imports.

import { GoodId, GOODS, GOOD_DEFS, CALIBRATION_WEIGHT } from './goods.ts';
import { NPC } from './npc.ts';

export interface DailyMetrics {
  day: number;
  outputValue: number;
  unmetDemand: number; // weighted total (grain + ore), for the scoreboard
  unmetSurvival: number; // grain-only (starvation) unmet - the thing that matters
  avgHappiness: number;
  waste: number;
  protesting: number;
  // convenience raw fields for detectors/UI
  unmetMealsCumulative: number; // cumulative missed grain meals
}

export interface MetricsAccumulator {
  history: DailyMetrics[];
  cumulativeMissedMeals: number;
}

export function makeMetrics(): MetricsAccumulator {
  return { history: [], cumulativeMissedMeals: 0 };
}

export interface DayProductionSnapshot {
  produced: Record<GoodId, number>;
  waste: number;
}

/**
 * Record a day's metrics. `oreNeed` is the current per-NPC ore need.
 */
export function recordDay(
  acc: MetricsAccumulator,
  day: number,
  npcs: NPC[],
  producedToday: Record<GoodId, number>,
  wasteToday: number,
  oreNeed: number,
): void {
  let outputValue = 0;
  for (const g of GOODS) {
    outputValue += producedToday[g] * CALIBRATION_WEIGHT[g];
  }

  let unmet = 0;
  let missedGrainMeals = 0;
  let happySum = 0;
  let protesting = 0;
  for (const npc of npcs) {
    const grainNeed = GOOD_DEFS.grain.dailyNeed;
    const grainGot = npc.consumedToday.grain;
    const grainMiss = Math.max(0, grainNeed - grainGot);
    missedGrainMeals += grainMiss / grainNeed;
    unmet += grainMiss * CALIBRATION_WEIGHT.grain;

    const oreGot = npc.consumedToday.ore;
    const oreMiss = Math.max(0, oreNeed - oreGot);
    unmet += oreMiss * CALIBRATION_WEIGHT.ore;

    happySum += npc.happiness;
    if (npc.protesting) protesting++;
  }

  acc.cumulativeMissedMeals += missedGrainMeals;

  // Survival unmet = grain (starvation) shortfall only. Starvation is the lesson;
  // a town where people can't eat is failing worse than one that just lacks fuel,
  // regardless of the coin price of each good. The recovery test tracks this.
  let unmetSurvival = 0;
  for (const npc of npcs) {
    unmetSurvival += Math.max(0, GOOD_DEFS.grain.dailyNeed - npc.consumedToday.grain) * CALIBRATION_WEIGHT.grain;
  }

  acc.history.push({
    day,
    outputValue,
    unmetDemand: unmet,
    unmetSurvival,
    avgHappiness: npcs.length ? happySum / npcs.length : 0,
    waste: wasteToday,
    protesting,
    unmetMealsCumulative: acc.cumulativeMissedMeals,
  });
}
