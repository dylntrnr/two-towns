// NPC type + productivity, consumption, happiness helpers.
// Pure TS, zero DOM/Pixi imports.

import {
  GoodId,
  Job,
  GOOD_DEFS,
  goodOfJob,
  WORLD_CONSTANTS as W,
} from './goods.ts';

export type Town = 'market' | 'planned';

export interface Vec2 {
  x: number;
  y: number;
}

export type NPCState =
  | 'working'
  | 'traveling'
  | 'trading'
  | 'queuing'
  | 'idle'
  | 'protesting';

export interface NPC {
  id: number;
  town: Town;
  job: Job;
  retrainTicks: number;

  pos: Vec2;
  target: Vec2 | null;
  home: Vec2;
  workplace: Vec2;
  state: NPCState;

  inventory: Record<GoodId, number>;
  money: number; // market only

  hunger: number; // 0..1
  comfort: number; // 0..1
  happiness: number;
  lowHappyDays: number; // consecutive days under protest threshold
  protesting: boolean;

  incomeEMA: Record<Job, number>; // market only
  // per-day accounting
  producedToday: Record<GoodId, number>;
  consumedToday: Record<GoodId, number>;
  incomeToday: number;
  switchedFlash: number; // ticks remaining to render a job-switch bubble
  _oreNeedOverride?: number; // set by shock system for daily ore need
}

export function makeNPC(
  id: number,
  town: Town,
  job: Job,
  home: Vec2,
  workplace: Vec2,
): NPC {
  return {
    id,
    town,
    job,
    retrainTicks: 0,
    pos: { ...home },
    target: null,
    home: { ...home },
    workplace: { ...workplace },
    state: 'working',
    // ~2 days of grace stock (symmetric with the planned warehouse buffer, H1).
    inventory: { grain: 2, ore: 1 },
    money: town === 'market' ? W.START_MONEY : 0,
    hunger: 0,
    comfort: 1,
    happiness: 1,
    lowHappyDays: 0,
    protesting: false,
    incomeEMA: { farmer: 0, miner: 0 },
    producedToday: { grain: 0, ore: 0 },
    consumedToday: { grain: 0, ore: 0 },
    incomeToday: 0,
    switchedFlash: 0,
  };
}

/** Per-day output for this NPC's current job, given a yield multiplier for that good. */
export function personalYield(npc: NPC, yieldMult: number): number {
  const good = goodOfJob(npc.job);
  const base = GOOD_DEFS[good].baseYield;
  const happyFactor = W.PRODUCTIVITY_FLOOR + (1 - W.PRODUCTIVITY_FLOOR) * npc.happiness;
  let out = base * yieldMult * happyFactor;
  if (npc.retrainTicks > 0) out *= W.RETRAIN_OUTPUT;
  // Protest sharply cuts output but not to a hard zero: an absolute-zero protest
  // is a one-way death ratchet (no output -> no food -> can never exit protest),
  // which would kill BOTH towns and defeat the whole recovery lesson. A small
  // residual output lets a town that regains its food supply climb back out.
  if (npc.protesting) out *= W.PROTEST_OUTPUT;
  return out;
}

/** Hypothetical per-day output for an arbitrary job (used by labor reallocation). */
export function yieldForJob(npc: NPC, job: Job, yieldMult: number): number {
  const good = goodOfJob(job);
  const base = GOOD_DEFS[good].baseYield;
  const happyFactor = W.PRODUCTIVITY_FLOOR + (1 - W.PRODUCTIVITY_FLOOR) * npc.happiness;
  return base * yieldMult * happyFactor;
}

export function updateHappiness(npc: NPC): void {
  npc.happiness = Math.max(
    0,
    Math.min(1, 1 - 0.7 * npc.hunger - 0.3 * (1 - npc.comfort)),
  );
}

/**
 * Apply daily consumption of needs from an available bundle.
 * Returns amount actually consumed per good. Mutates npc hunger/comfort.
 * `avail` is what the NPC actually has access to this day.
 */
export function consumeNeeds(
  npc: NPC,
  avail: Record<GoodId, number>,
): Record<GoodId, number> {
  const consumed: Record<GoodId, number> = { grain: 0, ore: 0 };

  // Grain — survival.
  const grainNeed = GOOD_DEFS.grain.dailyNeed;
  const grainGot = Math.min(grainNeed, avail.grain);
  consumed.grain = grainGot;
  if (grainGot >= grainNeed - 1e-9) {
    npc.hunger = Math.max(0, npc.hunger - W.HUNGER_RECOVERY);
  } else {
    // partial feeding reduces the hunger gain proportionally
    const deficitFrac = 1 - grainGot / grainNeed;
    npc.hunger = Math.min(1, npc.hunger + W.HUNGER_RATE * deficitFrac);
  }

  // Ore — comfort (uses possibly-shocked dailyNeed passed via override map).
  const oreNeed = npc._oreNeedOverride ?? GOOD_DEFS.ore.dailyNeed;
  const oreGot = Math.min(oreNeed, avail.ore);
  consumed.ore = oreGot;
  const comfortTarget = oreNeed > 0 ? oreGot / oreNeed : 1;
  // ease comfort toward target
  npc.comfort = npc.comfort + 0.5 * (comfortTarget - npc.comfort);

  npc.consumedToday = { ...consumed };
  return consumed;
}

export function updateProtest(npc: NPC): void {
  if (npc.happiness < W.PROTEST_THRESHOLD) {
    npc.lowHappyDays += 1;
  } else {
    npc.lowHappyDays = 0;
  }
  if (!npc.protesting && npc.lowHappyDays >= W.PROTEST_DAYS) {
    npc.protesting = true;
  } else if (npc.protesting && npc.happiness > W.PROTEST_RECOVERY) {
    npc.protesting = false;
    npc.lowHappyDays = 0;
  }
  npc.state = npc.protesting ? 'protesting' : npc.state;
}
