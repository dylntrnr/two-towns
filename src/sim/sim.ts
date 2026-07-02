// Sim facade: owns the World + detectors, steps ticks, tracks per-day job
// switches for callouts, and exposes read-only snapshots for the renderer/UI.
// Pure TS, zero DOM/Pixi imports. The renderer READS this; it never mutates
// sim internals.

import {
  World,
  createWorld,
  tick as worldTick,
  triggerShock,
} from './world.ts';
import { ShockId, computeEffects, isDroughtActive } from './shocks.ts';
import {
  DetectorState,
  makeDetectors,
  scanDetectors,
  takeCallouts,
  Callout,
} from './detectors.ts';
import { GoodId, Job, WORLD_CONSTANTS as W } from './goods.ts';
import { NPC } from './npc.ts';

export interface Sim {
  world: World;
  detectors: DetectorState;
  seed: number;
  prevJobs: Map<number, Job>; // to count switches per day
  switchesToFarmingToday: number;
}

const TPD = W.TICKS_PER_DAY;

export function createSim(seed: number): Sim {
  const world = createWorld(seed);
  const prevJobs = new Map<number, Job>();
  for (const n of world.market.npcs) prevJobs.set(n.id, n.job);
  return { world, detectors: makeDetectors(), seed, prevJobs, switchesToFarmingToday: 0 };
}

/** Advance exactly one sim tick. Handles per-day detector scan + switch counting. */
export function stepTick(sim: Sim): void {
  const before = sim.world.tick;
  worldTick(sim.world);
  const day = sim.world.tick / TPD;
  if (sim.world.tick % TPD === 0) {
    // count switches to farming since last day scan
    let toFarming = 0;
    for (const n of sim.world.market.npcs) {
      const prev = sim.prevJobs.get(n.id);
      if (prev && prev !== n.job && n.job === 'farmer') toFarming++;
      sim.prevJobs.set(n.id, n.job);
    }
    sim.switchesToFarmingToday = toFarming;
    scanDetectors(sim.detectors, sim.world, day, toFarming);
  }
  void before;
}

export function fireShock(sim: Sim, id: ShockId): void {
  triggerShock(sim.world, id);
}

export function takeSimCallouts(sim: Sim): Callout[] {
  return takeCallouts(sim.detectors);
}

export function droughtActive(sim: Sim): boolean {
  return isDroughtActive(sim.world.shocks, sim.world.tick);
}

export function currentEffects(sim: Sim) {
  return computeEffects(sim.world.shocks, sim.world.tick);
}

// ---- Snapshots for rendering / scoreboard ----

export interface NPCSnapshot {
  id: number;
  job: Job;
  x: number;
  y: number;
  happiness: number;
  protesting: boolean;
  retraining: boolean;
  switchedFlash: number;
}

export interface TownSnapshot {
  npcs: NPCSnapshot[];
  farmers: number;
  miners: number;
}

export function townSnapshot(npcs: NPC[]): TownSnapshot {
  let farmers = 0;
  let miners = 0;
  const out: NPCSnapshot[] = [];
  for (const n of npcs) {
    if (n.job === 'farmer') farmers++;
    else miners++;
    out.push({
      id: n.id,
      job: n.job,
      x: n.pos.x,
      y: n.pos.y,
      happiness: n.happiness,
      protesting: n.protesting,
      retraining: n.retrainTicks > 0,
      switchedFlash: n.switchedFlash,
    });
  }
  return { npcs: out, farmers, miners };
}

export interface ScoreSnapshot {
  day: number;
  market: {
    outputHistory: number[];
    unmetHistory: number[];
    happyHistory: number[];
    missedMealsCumulative: number;
    protesting: number;
    price: Record<GoodId, number>;
  };
  planned: {
    outputHistory: number[];
    unmetHistory: number[];
    happyHistory: number[];
    missedMealsCumulative: number;
    protesting: number;
    quota: Record<GoodId, number>;
    warehouse: Record<GoodId, number>;
    queueLen: number;
  };
}

function histField(hist: { [k: string]: number }[], field: string): number[] {
  return hist.map((h) => h[field]);
}

export function scoreSnapshot(sim: Sim): ScoreSnapshot {
  const m = sim.world.market;
  const p = sim.world.planned;
  const mh = m.metrics.history;
  const ph = p.metrics.history;
  const last = <T,>(a: T[]): T | undefined => a[a.length - 1];
  return {
    day: sim.world.tick / TPD,
    market: {
      outputHistory: histField(mh as any, 'outputValue'),
      unmetHistory: histField(mh as any, 'unmetDemand'),
      happyHistory: histField(mh as any, 'avgHappiness'),
      missedMealsCumulative: last(mh)?.unmetMealsCumulative ?? 0,
      protesting: last(mh)?.protesting ?? 0,
      price: { ...m.market!.price },
    },
    planned: {
      outputHistory: histField(ph as any, 'outputValue'),
      unmetHistory: histField(ph as any, 'unmetDemand'),
      happyHistory: histField(ph as any, 'avgHappiness'),
      missedMealsCumulative: last(ph)?.unmetMealsCumulative ?? 0,
      protesting: last(ph)?.protesting ?? 0,
      quota: { ...p.planner!.quota },
      warehouse: { ...p.planner!.warehouse },
      queueLen: p.planner!.queueLen,
    },
  };
}
