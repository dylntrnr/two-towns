// Planned Town coordination: warehouse, rations, queues, lagged/aggregate planner.
// Pure TS, zero DOM/Pixi imports.
// H4: planner adapts every cycle; failure traces only to information constraints.

import {
  GoodId,
  Job,
  GOODS,
  GOOD_DEFS,
  jobOfGood,
  WORLD_CONSTANTS as W,
} from './goods.ts';
import { NPC } from './npc.ts';

export interface PlannerState {
  quota: Record<GoodId, number>; // target units per plan cycle
  assumedYield: Record<GoodId, number>; // STALE calibration coefficients
  lastReport: Record<GoodId, number>; // warehouse at end of previous cycle
  targetStock: Record<GoodId, number>;
  warehouse: Record<GoodId, number>;
  queueLen: number; // NPCs who got nothing today (last daily ration)
  laborAssign: Record<Job, number>; // desired worker counts per job
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function makePlannerState(): PlannerState {
  const target: Record<GoodId, number> = { grain: 0, ore: 0 };
  for (const g of GOODS) {
    target[g] = W.POPULATION * GOOD_DEFS[g].dailyNeed * W.TARGET_STOCK_DAYS;
  }
  // Initial quota = enough to cover population need over a plan cycle.
  const quota: Record<GoodId, number> = { grain: 0, ore: 0 };
  for (const g of GOODS) {
    quota[g] = W.POPULATION * GOOD_DEFS[g].dailyNeed * W.PLAN_CYCLE_DAYS;
  }
  // H1: the planned warehouse must NOT start fatter than the market town's
  // aggregate personal inventory, or it gets a free buffer the market never has.
  // Market starts each of POPULATION NPCs with {grain:2, ore:1}; mirror that
  // exact aggregate stock here so both towns begin with identical total goods.
  const startWarehouse: Record<GoodId, number> = {
    grain: W.POPULATION * 2,
    ore: W.POPULATION * 1,
  };
  return {
    quota,
    assumedYield: { grain: GOOD_DEFS.grain.baseYield, ore: GOOD_DEFS.ore.baseYield },
    lastReport: { ...startWarehouse }, // planner's first report = actual start stock
    targetStock: target,
    warehouse: { ...startWarehouse },
    queueLen: 0,
    laborAssign: { farmer: W.START_FARMERS, miner: W.START_MINERS },
  };
}

/**
 * Daily distribution (§2.5): collect output, hand out equal rations, form queues.
 * Called AFTER production has been added to warehouse for the day.
 * `oreNeed` is the (possibly shocked) per-NPC daily ore need.
 */
export function plannerDistribute(
  npcs: NPC[],
  p: PlannerState,
  oreNeed: number,
): void {
  const pop = npcs.length;
  let shortCount = 0;

  for (const g of GOODS) {
    const need = g === 'ore' ? oreNeed : GOOD_DEFS[g].dailyNeed;
    const perHead = pop > 0 ? Math.min(need, p.warehouse[g] / pop) : 0;
    // hand out ration to each NPC
    for (const npc of npcs) {
      const give = Math.min(perHead, p.warehouse[g]);
      npc.inventory[g] += give;
      p.warehouse[g] -= give;
    }
    // If rations were short of grain need, count queue (visible symptom).
    if (g === 'grain' && perHead < need - 1e-9) {
      // number of people who effectively went without full grain
      shortCount = pop;
    }
  }
  p.queueLen = shortCount > 0 ? Math.min(pop, Math.round(pop)) : 0;
}

/** Collect one tick's production into the warehouse. */
export function plannerCollect(p: PlannerState, good: GoodId, amount: number): void {
  p.warehouse[good] += amount;
}

/**
 * Replan every PLAN_CYCLE (§2.5). Diligent proportional controller on LAGGED
 * aggregate warehouse data, then reassign labor using STALE assumed yields.
 */
export function plannerReplan(npcs: NPC[], p: PlannerState): void {
  // Proportional controller on last cycle's (stale) report.
  for (const g of GOODS) {
    const gap = (p.targetStock[g] - p.lastReport[g]) / p.targetStock[g];
    p.quota[g] *= clamp(1 + W.PLANNER_GAIN * gap, W.PLANNER_STEP_CLAMP[0], W.PLANNER_STEP_CLAMP[1]);
  }

  // Labor assignment using ASSUMED (stale) yields.
  const laborNeed: Record<GoodId, number> = { grain: 0, ore: 0 };
  let total = 0;
  for (const g of GOODS) {
    laborNeed[g] = p.quota[g] / (p.assumedYield[g] * W.PLAN_CYCLE_DAYS);
    total += laborNeed[g];
  }
  // Normalize to actual population.
  const pop = npcs.length;
  const assign: Record<Job, number> = { farmer: 0, miner: 0 };
  if (total > 0) {
    assign.farmer = Math.round((laborNeed.grain / total) * pop);
    assign.miner = pop - assign.farmer;
  } else {
    assign.farmer = W.START_FARMERS;
    assign.miner = W.START_MINERS;
  }
  p.laborAssign = assign;
  reassignWorkers(npcs, assign);

  // Snapshot for NEXT cycle — always one cycle old.
  p.lastReport = { ...p.warehouse };
}

function reassignWorkers(npcs: NPC[], assign: Record<Job, number>): void {
  // Current counts.
  const farmers = npcs.filter((n) => n.job === 'farmer');
  const miners = npcs.filter((n) => n.job === 'miner');

  let needFarmers = assign.farmer;
  const curFarmers = farmers.length;

  if (needFarmers > curFarmers) {
    // move miners -> farmers
    const toMove = Math.min(needFarmers - curFarmers, miners.length);
    for (let i = 0; i < toMove; i++) {
      const npc = miners[i];
      npc.job = 'farmer';
      npc.retrainTicks = W.RETRAIN_TICKS;
      npc.switchedFlash = 20;
    }
  } else if (needFarmers < curFarmers) {
    // move farmers -> miners
    const toMove = Math.min(curFarmers - needFarmers, farmers.length);
    for (let i = 0; i < toMove; i++) {
      const npc = farmers[i];
      npc.job = 'miner';
      npc.retrainTicks = W.RETRAIN_TICKS;
      npc.switchedFlash = 20;
    }
  }
}

export { jobOfGood };
