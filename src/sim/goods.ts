// Goods definitions + WORLD_CONSTANTS. Pure data, zero DOM/Pixi imports.
// H1: a single WORLD_CONSTANTS object, imported by both towns.

export type GoodId = 'grain' | 'ore';
export type Job = 'farmer' | 'miner';

export const GOODS: GoodId[] = ['grain', 'ore'];

export interface GoodDef {
  id: GoodId;
  baseYield: number; // units per worker per day at calibration
  spoilRate: number; // fraction lost per day in ANY storage
  dailyNeed: number; // units each NPC must consume per day
  survival: boolean; // true = starvation good (grain); false = comfort good (ore)
}

// Calibrated so full employment ~matches aggregate need (tight equilibrium):
//   36 farmers * 1.75 = 63 grain/day  vs  60 grain need  (~5% slack)
//   24 miners  * 1.35 = 32.4 ore/day  vs  30 ore need    (~8% slack)
// The small slack keeps prices near START_PRICE at calibration but leaves no
// fat buffer, so a drought creates real, immediate scarcity.
// Calibrated for a small (~10%) surplus at full employment so NPCs can hold a
// modest buffer and spoilage is covered, without a fat glut that floors prices:
//   36 farmers * 1.85 = 66.6 grain/day  vs 60 need (covers 4%/day spoilage)
//   24 miners  * 1.30 = 31.2 ore/day    vs 30 need
// A drought (grain yield *0.7) drops grain to ~46/day << 60: real scarcity that
// only fast labor reallocation can meaningfully close.
export const GOOD_DEFS: Record<GoodId, GoodDef> = {
  grain: { id: 'grain', baseYield: 1.72, spoilRate: 0.02, dailyNeed: 1, survival: true },
  ore: { id: 'ore', baseYield: 1.28, spoilRate: 0.0, dailyNeed: 0.5, survival: false },
};

export function goodOfJob(job: Job): GoodId {
  return job === 'farmer' ? 'grain' : 'ore';
}

export function jobOfGood(good: GoodId): Job {
  return good === 'grain' ? 'farmer' : 'miner';
}

export const WORLD_CONSTANTS = {
  POPULATION: 60,
  TICKS_PER_DAY: 10,
  PLAN_CYCLE_DAYS: 15,
  START_MONEY: 20,
  // Calibrated so both jobs earn EQUAL income at the 36/24 split (H3): a farmer
  // earns grain_price*1.72 and a miner ore_price*1.28; 2.233*1.72 = 3.0*1.28 =
  // 3.84. Equal income means no NPC has a standing incentive to switch at rest,
  // so calm-time labor stays put and the market matches the planned town.
  START_PRICE: { grain: 2.233, ore: 3.0 } as Record<GoodId, number>,

  // Initial calibrated labor split (36 farmers, 24 miners).
  START_FARMERS: 36,
  START_MINERS: 24,

  K_PRICE: 0.18,
  // Scarcity-signal gains (see market.ts price rule + calib2). alpha/beta ~ 1
  // rests the price near START at calibration; the drought's big positive
  // scarcity term then drives the visible price spike.
  // ratio ~4 (see calib4): rests price near START at calibration but lets a real
  // shortage drive price to ~6.8 during drought - past the ~6.3 income-parity
  // point where farming out-earns mining despite the drought yield cut, so labor
  // gets pulled INTO grain. This is the price signal doing the reallocation.
  PRICE_SCARCITY_GAIN: 0.8,
  PRICE_REST_GAIN: 0.2,
  // A shortage of a survival good moves its price this many times harder than an
  // equal shortage of a comfort good (steeper marginal utility of not starving).
  // Makes the grain signal dominate during a drought so labor chases the real
  // shortage, not a phantom ore-price blip from hungry miners.
  SURVIVAL_SCARCITY_MULT: 1.5,
  // Scarcity signal = flow (is production meeting need?) + stock (are granaries
  // depleted?). The stock term keeps grain valuable through a post-drought
  // rebuild, so the market holds enough farmers to refill buffers - a genuine
  // recovery the aggregate-blind planner can't replicate. Healthy stock (>= this
  // many days of need) adds zero scarcity, so calibration is unchanged.
  SCARCITY_FLOW_WEIGHT: 1.0,
  SCARCITY_STOCK_WEIGHT: 0.6,
  STOCK_TARGET_DAYS: 2.0, // = the starting per-NPC grain buffer, so calibration reads zero stock-scarcity (H3)
  // Step clamp: allow up to +18% / -12% per day. Slightly faster up than down so
  // a shortage signal propagates quickly (prices are famously sticky downward),
  // but still bounded so it can't teleport - overshoot/oscillation stays bounded.
  PRICE_STEP_CLAMP: [0.88, 1.18] as [number, number],
  PRICE_BOUNDS: [0.2, 50] as [number, number],

  SWITCH_THRESHOLD: 1.3,
  RETRAIN_TICKS: 30,
  RETRAIN_OUTPUT: 0.5,
  REALLOC_INTERVAL_DAYS: 2,

  HUNGER_RATE: 0.15,
  HUNGER_RECOVERY: 0.8, // fed people bounce back fast, so a re-fed town can heal
  PRODUCTIVITY_FLOOR: 0.55, // yield = base * (0.55 + 0.45*happiness)

  PROTEST_THRESHOLD: 0.2,
  PROTEST_DAYS: 4,
  PROTEST_RECOVERY: 0.35,
  PROTEST_OUTPUT: 0.25, // residual output while protesting (not a hard zero)

  PLANNER_GAIN: 0.8,
  // Wider upper clamp so a SEVERELY short good's quota can outpace a mildly short
  // one - otherwise both quotas peg at the same cap during a drought and the
  // grain:ore ratio (hence the labor split) never shifts, leaving the planner
  // frozen at 36 farmers. With a wider clamp the planner DOES rebalance toward
  // grain, but late (one-cycle report lag) and using stale full-yield
  // coefficients, so it chronically under-provisions and the warehouse stays
  // drained - the honest information-constrained failure (H4).
  PLANNER_STEP_CLAMP: [0.7, 1.5] as [number, number],
  TARGET_STOCK_DAYS: 5,

  // 0.65: a real, painful shortage. At this level even ALL 60 farming barely
  // meets grain need (60.4 vs 60), so a town MUST reallocate hard toward grain
  // to survive - but recovery IS physically possible if it does (see calib5).
  // The market reallocates via price and pulls through; the planned town, stuck
  // near 36 farmers on stale yields, makes ~40 grain and starves. That gap is
  // the whole lesson, and it's earned by coordination, not baked in.
  DROUGHT_MULT: 0.65,
  DROUGHT_DAYS: 20,

  // Ore-demand shock ("Fuel Winter").
  FUEL_ORE_NEED: 1.2,
  FUEL_DAYS: 20,

  // Vein-depleted shock (permanent ore yield cut).
  VEIN_MULT: 0.5,
};

export type WorldConstants = typeof WORLD_CONSTANTS;

// H6: neutral scoring weights = start prices, frozen at t=0.
export const CALIBRATION_WEIGHT: Record<GoodId, number> = {
  grain: WORLD_CONSTANTS.START_PRICE.grain,
  ore: WORLD_CONSTANTS.START_PRICE.ore,
};
