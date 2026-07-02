// World: owns both towns, runs the shared tick loop (§2.7).
// Pure TS, zero DOM/Pixi imports. Headless-capable: runSim(seed, ticks) -> metrics.

import {
  GoodId,
  GOODS,
  GOOD_DEFS,
  goodOfJob,
  WORLD_CONSTANTS as W,
} from './goods.ts';
import { RNG } from './rng.ts';
import {
  NPC,
  Town,
  makeNPC,
  personalYield,
  consumeNeeds,
  updateHappiness,
  updateProtest,
} from './npc.ts';
import {
  MarketState,
  makeMarketState,
  marketDistribute,
  marketReallocate,
  seedIncomeEMA,
} from './market.ts';
import {
  PlannerState,
  makePlannerState,
  plannerDistribute,
  plannerReplan,
} from './planner.ts';
import {
  Shock,
  ShockId,
  makeShock,
  computeEffects,
  ShockEffects,
} from './shocks.ts';
import {
  MetricsAccumulator,
  makeMetrics,
  recordDay,
} from './metrics.ts';

export interface TownState {
  town: Town;
  npcs: NPC[];
  market?: MarketState;
  planner?: PlannerState;
  metrics: MetricsAccumulator;
  rng: RNG;
  // per-day production accumulators
  producedToday: Record<GoodId, number>;
  wasteToday: number;
}

export interface World {
  tick: number;
  seed: number;
  shocks: Shock[];
  market: TownState;
  planned: TownState;
}

// Debug flag: freeze market labor (calibration-finding only). Off in production.
export let FREEZE_LABOR = false;
export function setFreezeLabor(v: boolean): void {
  FREEZE_LABOR = v;
}

const TICKS_PER_DAY = W.TICKS_PER_DAY;
const PLAN_CYCLE = W.PLAN_CYCLE_DAYS * TICKS_PER_DAY;
const REALLOC_INTERVAL = W.REALLOC_INTERVAL_DAYS * TICKS_PER_DAY;

// Simple grid positions (renderer overrides visually; sim only needs identity).
function farmPos(i: number): { x: number; y: number } {
  return { x: 6 + (i % 6), y: 6 + Math.floor(i / 6) };
}
function minePos(i: number): { x: number; y: number } {
  return { x: 28 + (i % 5), y: 18 + Math.floor(i / 5) };
}
function homePos(i: number): { x: number; y: number } {
  return { x: 4 + (i % 10) * 3, y: 22 + Math.floor(i / 10) };
}

function buildTown(town: Town, rng: RNG): TownState {
  const npcs: NPC[] = [];
  for (let i = 0; i < W.POPULATION; i++) {
    const job = i < W.START_FARMERS ? 'farmer' : 'miner';
    const home = homePos(i);
    const wp = job === 'farmer' ? farmPos(i) : minePos(i - W.START_FARMERS);
    npcs.push(makeNPC(i, town, job, home, wp));
  }
  const ts: TownState = {
    town,
    npcs,
    metrics: makeMetrics(),
    rng,
    producedToday: { grain: 0, ore: 0 },
    wasteToday: 0,
  };
  if (town === 'market') {
    ts.market = makeMarketState();
    seedIncomeEMA(npcs, ts.market);
  } else {
    ts.planner = makePlannerState();
  }
  return ts;
}

export function createWorld(seed: number): World {
  const root = new RNG(seed);
  // Fork independent streams per town (H2).
  const marketRng = root.fork(1);
  const plannedRng = root.fork(2);
  return {
    tick: 0,
    seed,
    shocks: [],
    market: buildTown('market', marketRng),
    planned: buildTown('planned', plannedRng),
  };
}

export function triggerShock(world: World, id: ShockId): void {
  // Prevent duplicate active shock of same id.
  if (world.shocks.some((s) => s.id === id && world.tick < s.startTick + s.durationTicks)) {
    return;
  }
  world.shocks.push(makeShock(id, world.tick));
}

function applySpoilageInv(inv: Record<GoodId, number>, ts: TownState): void {
  for (const g of GOODS) {
    const rate = GOOD_DEFS[g].spoilRate;
    if (rate > 0) {
      const lost = inv[g] * rate;
      inv[g] -= lost;
      ts.wasteToday += lost;
    }
  }
}

function stepProduction(ts: TownState, eff: ShockEffects): void {
  for (const npc of ts.npcs) {
    const good = goodOfJob(npc.job);
    const perDay = personalYield(npc, eff.yieldMult[good]);
    const perTick = perDay / TICKS_PER_DAY;
    if (ts.town === 'market') {
      npc.inventory[good] += perTick;
    } else {
      // planned: output flows to central warehouse
      ts.planner!.warehouse[good] += perTick;
    }
    npc.producedToday[good] += perTick;
    ts.producedToday[good] += perTick;
    if (npc.retrainTicks > 0) npc.retrainTicks--;
  }
}

function dailyMarket(ts: TownState, eff: ShockEffects): void {
  marketDistribute(ts.npcs, ts.market!, eff.oreNeed);
  // consume from own inventory
  for (const npc of ts.npcs) {
    npc._oreNeedOverride = eff.oreNeed;
    consumeNeeds(npc, npc.inventory);
    // deduct consumed
    npc.inventory.grain = Math.max(0, npc.inventory.grain - npc.consumedToday.grain);
    npc.inventory.ore = Math.max(0, npc.inventory.ore - npc.consumedToday.ore);
    updateHappiness(npc);
    updateProtest(npc);
    applySpoilageInv(npc.inventory, ts);
    npc.incomeToday = 0;
  }
}

function dailyPlanned(ts: TownState, eff: ShockEffects): void {
  const p = ts.planner!;
  // Distribute rations from warehouse into NPC hands.
  plannerDistribute(ts.npcs, p, eff.oreNeed);
  for (const npc of ts.npcs) {
    npc._oreNeedOverride = eff.oreNeed;
    consumeNeeds(npc, npc.inventory);
    npc.inventory.grain = Math.max(0, npc.inventory.grain - npc.consumedToday.grain);
    npc.inventory.ore = Math.max(0, npc.inventory.ore - npc.consumedToday.ore);
    updateHappiness(npc);
    updateProtest(npc);
    applySpoilageInv(npc.inventory, ts);
  }
  // Warehouse spoilage.
  applySpoilageWarehouse(p, ts);
}

function applySpoilageWarehouse(p: PlannerState, ts: TownState): void {
  for (const g of GOODS) {
    const rate = GOOD_DEFS[g].spoilRate;
    if (rate > 0) {
      const lost = p.warehouse[g] * rate;
      p.warehouse[g] -= lost;
      ts.wasteToday += lost;
    }
  }
}

export function tick(world: World): void {
  world.tick++;
  const eff = computeEffects(world.shocks, world.tick);

  for (const ts of [world.market, world.planned]) {
    stepProduction(ts, eff);
  }

  if (world.tick % TICKS_PER_DAY === 0) {
    const day = world.tick / TICKS_PER_DAY;

    // MARKET daily
    dailyMarket(world.market, eff);
    // PLANNED daily
    dailyPlanned(world.planned, eff);

    // record metrics + reset per-day accumulators
    for (const ts of [world.market, world.planned]) {
      recordDay(ts.metrics, day, ts.npcs, ts.producedToday, ts.wasteToday, eff.oreNeed);
      ts.producedToday = { grain: 0, ore: 0 };
      ts.wasteToday = 0;
      for (const npc of ts.npcs) npc.producedToday = { grain: 0, ore: 0 };
    }
  }

  if (world.tick % REALLOC_INTERVAL === 0 && !FREEZE_LABOR) {
    const cycle = world.tick / REALLOC_INTERVAL;
    marketReallocate(world.market.npcs, world.market.market!, eff.yieldMult, cycle);
    // planned: no-op between plan cycles
  }

  if (world.tick % PLAN_CYCLE === 0) {
    plannerReplan(world.planned.npcs, world.planned.planner!);
    // market: no-op
  }
}

// ---- Headless entry point ----
export interface SimResult {
  seed: number;
  market: MetricsAccumulator;
  planned: MetricsAccumulator;
}

export interface RunOptions {
  droughtDay?: number; // day to trigger drought (undefined = no shock)
  shockId?: ShockId;
}

export function runSim(seed: number, days: number, opts: RunOptions = {}): SimResult {
  const world = createWorld(seed);
  const totalTicks = days * TICKS_PER_DAY;
  const shockTick = opts.droughtDay !== undefined ? opts.droughtDay * TICKS_PER_DAY : -1;
  for (let t = 0; t < totalTicks; t++) {
    if (shockTick >= 0 && world.tick === shockTick) {
      triggerShock(world, opts.shockId ?? 'drought');
    }
    tick(world);
  }
  return { seed, market: world.market.metrics, planned: world.planned.metrics };
}
