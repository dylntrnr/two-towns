// Market Town coordination: price tâtonnement, trade clearing, labor reallocation.
// Pure TS, zero DOM/Pixi imports.

import {
  GoodId,
  Job,
  GOODS,
  GOOD_DEFS,
  goodOfJob,
  jobOfGood,
  WORLD_CONSTANTS as W,
} from './goods.ts';
import { NPC, yieldForJob } from './npc.ts';

export interface MarketState {
  price: Record<GoodId, number>;
}

export function makeMarketState(): MarketState {
  return { price: { ...W.START_PRICE } };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Days-of-need a producer keeps of its OWN good before offering surplus. */
const SURPLUS_BUFFER_DAYS = 1;
/** Days-of-need a buyer tries to hold of goods it does NOT produce. */
const DEMAND_BUFFER_DAYS = 2;



/**
 * Daily market clearing (§2.4). Runs tâtonnement per good then executes trades.
 * `oreNeed` is the (possibly shocked) per-NPC daily ore need.
 */
export function marketDistribute(
  npcs: NPC[],
  ms: MarketState,
  oreNeed: number,
): void {
  for (const g of GOODS) {
    const need = g === 'ore' ? oreNeed : GOOD_DEFS[g].dailyNeed;
    const sellBuffer = need * SURPLUS_BUFFER_DAYS;
    const buyTarget = need * DEMAND_BUFFER_DAYS;

    // Supply: producers of this good offer their recent surplus FLOW, not their
    // whole stock. A seller offers what it produced (minus its own daily need)
    // plus a slow drawdown of any stock above the sell buffer. Offering the flow
    // rather than dumping the stock is what lets the price rest near its true
    // scarcity value instead of collapsing to the floor from stock dumping.
    let supply = 0;
    const sellers: { npc: NPC; qty: number }[] = [];
    for (const npc of npcs) {
      const produces = goodOfJob(npc.job) === g;
      if (!produces) continue;
      // Offer today's net surplus flow (produced minus own need), plus a small
      // drawdown of stock above the sell buffer. Flow-based offers keep the
      // market balanced at calibration instead of dumping accumulated stock.
      const flow = Math.max(0, npc.producedToday[g] - need);
      const excessStock = Math.max(0, npc.inventory[g] - sellBuffer);
      const offer = Math.min(npc.inventory[g], flow + 0.1 * excessStock);
      if (offer > 1e-9) {
        supply += offer;
        sellers.push({ npc, qty: offer });
      }
    }

    // Demand: non-producers of this good buy toward the buy target, capped by
    // ability to pay. Producers of a good don't buy it (they make it).
    let demand = 0;
    const price = ms.price[g];
    const buyers: { npc: NPC; qty: number }[] = [];
    for (const npc of npcs) {
      const produces = goodOfJob(npc.job) === g;
      if (produces) continue;
      // A buyer wants to (a) replace what it will consume today, plus (b) top up
      // toward its buffer. Anchoring demand to CONSUMPTION (not just a one-off
      // buffer fill) makes steady-state demand ~equal the sellers' surplus flow,
      // so at calibration supply==demand and the price rests instead of sagging.
      const bufferGap = Math.max(0, buyTarget - npc.inventory[g]);
      const want0 = need + 0.5 * bufferGap;
      if (want0 <= 1e-9) continue;
      const affordable = price > 0 ? npc.money / price : 0;
      const want = Math.min(want0, affordable);
      if (want > 1e-9) {
        demand += want;
        buyers.push({ npc, qty: want });
      }
    }

    // Price update = pure SCARCITY signal. This is the Misesian point: a price is
    // compressed information about how scarce a good is relative to what people
    // need. Compare the town's total PRODUCTION of the good today against its
    // total NEED for it:
    //   scarcity = (need - produced) / need    (>0 short, <0 glut)
    // At calibration production slightly exceeds need, so scarcity ~ -0.03 and
    // the price rests just under START. A rest-pull term anchors it there so it
    // neither inflates nor deflates when the town is balanced (fixing the earlier
    // monetary-deflation artifact). Under drought, production collapses, scarcity
    // jumps positive, and the price spikes hard - the signal that drives labor
    // toward grain. Money/trades still flow below for the visible narrative, but
    // the real scarcity of the good, not coin accounting, sets the price.
    const townNeed = need * npcs.length;
    let produced = 0;
    let heldStock = 0;
    for (const npc of npcs) {
      if (goodOfJob(npc.job) === g) produced += npc.producedToday[g];
      heldStock += Math.max(0, npc.inventory[g]);
    }
    // Scarcity has two parts: a FLOW term (is today's production keeping up with
    // need?) and a STOCK term (are the town's granaries depleted?). The stock
    // term is what makes the market genuinely RECOVER better than the planner:
    // after a drought the granaries are empty, so even once production recovers,
    // grain stays valuable until buffers refill - keeping the price (and thus
    // farmers) elevated through the rebuild. The planner has no such signal; it
    // reverts toward its calibrated split and never rebuilds the buffer. A
    // healthy stock (>= STOCK_TARGET_DAYS of need) contributes zero scarcity.
    const flowScarcity = (townNeed - produced) / Math.max(townNeed, 1);
    const stockTarget = need * npcs.length * W.STOCK_TARGET_DAYS;
    const stockScarcity = (stockTarget - heldStock) / Math.max(stockTarget, 1);
    const scarcity =
      W.SCARCITY_FLOW_WEIGHT * flowScarcity +
      W.SCARCITY_STOCK_WEIGHT * Math.max(0, stockScarcity); // >0 = short
    const restPull = (W.START_PRICE[g] - price) / W.START_PRICE[g];
    // Survival goods command a far steeper willingness-to-pay when scarce: a
    // starving person values the next unit of food enormously more than the next
    // unit of comfort. So a shortage of grain (survival) drives its price up much
    // harder than an equal-sized shortage of ore (comfort). This is honest
    // marginal-utility economics, and it's also what makes the grain signal
    // DOMINATE during a drought so labor is pulled toward the real shortage
    // instead of chasing a phantom ore-price blip caused by hungry miners
    // producing less ore. Gluts (scarcity<0) get no criticality boost - a food
    // glut is not specially urgent - so calibration behavior is unchanged.
    const critical = GOOD_DEFS[g].survival ? W.SURVIVAL_SCARCITY_MULT : 1;
    const effScarcity = scarcity > 0 ? scarcity * critical : scarcity;
    const drive = W.PRICE_SCARCITY_GAIN * effScarcity + W.PRICE_REST_GAIN * restPull;
    let newPrice = price * clamp(1 + drive, W.PRICE_STEP_CLAMP[0], W.PRICE_STEP_CLAMP[1]);
    newPrice = clamp(newPrice, W.PRICE_BOUNDS[0], W.PRICE_BOUNDS[1]);
    ms.price[g] = newPrice;

    executeTrades(g, newPrice, sellers, buyers, supply, demand);
  }
}

function executeTrades(
  g: GoodId,
  price: number,
  sellers: { npc: NPC; qty: number }[],
  buyers: { npc: NPC; qty: number }[],
  supply: number,
  demand: number,
): void {
  if (supply <= 1e-9 || demand <= 1e-9) return;

  const traded = Math.min(supply, demand);
  // Ration the short side proportionally.
  const buyFrac = demand > 0 ? traded / demand : 0;
  const sellFrac = supply > 0 ? traded / supply : 0;

  for (const b of buyers) {
    const qty = b.qty * buyFrac;
    const cost = qty * price;
    b.npc.inventory[g] += qty;
    b.npc.money -= cost;
    if (b.npc.money < 0) b.npc.money = 0;
  }
  for (const s of sellers) {
    const qty = s.qty * sellFrac;
    const revenue = qty * price;
    s.npc.inventory[g] -= qty;
    s.npc.money += revenue;
    s.npc.incomeToday += revenue;
  }
}

/**
 * Labor reallocation every REALLOC_INTERVAL days (§2.4).
 * Each NPC updates incomeEMA from current prices and switches with hysteresis.
 * `yieldMult` maps good -> current yield multiplier (drought etc.).
 *
 * Anti-stampede: every NPC keeps its own smoothed income estimate, but only a
 * bounded FRACTION of the NPCs who *want* to switch actually move each cycle
 * (chosen deterministically by a rotating phase). This prevents the whole
 * population making the identical decision on the same day and oscillating.
 * Convergence toward the profitable job still emerges — it just takes a few
 * cycles, which is realistic labor friction (H5) and keeps the town stable.
 */
export function marketReallocate(
  npcs: NPC[],
  ms: MarketState,
  yieldMult: Record<GoodId, number>,
  cycle: number,
): void {
  const jobs: Job[] = ['farmer', 'miner'];
  const wantSwitch: NPC[] = [];
  for (const npc of npcs) {
    // Everyone updates their income estimate every cycle. Moderate smoothing so
    // the town reacts within a few days of a price move but still has hysteresis.
    for (const j of jobs) {
      const good = goodOfJob(j);
      const estIncome = ms.price[good] * yieldForJob(npc, j, yieldMult[good]);
      npc.incomeEMA[j] = 0.7 * npc.incomeEMA[j] + 0.3 * estIncome;
    }
    if (npc.retrainTicks > 0) continue; // don't re-switch mid-retrain
    let best: Job = npc.job;
    for (const j of jobs) {
      if (npc.incomeEMA[j] > npc.incomeEMA[best]) best = j;
    }
    if (
      best !== npc.job &&
      npc.incomeEMA[best] > npc.incomeEMA[npc.job] * W.SWITCH_THRESHOLD
    ) {
      wantSwitch.push(npc);
    }
  }

  // Move a share of the willing switchers this cycle. The share scales with how
  // MANY people independently want to switch: at calibration almost nobody wants
  // to (stable town, H3), but when a shock sends a strong price signal, many
  // want to move at once and the town responds proportionally faster. This is
  // the price signal doing its job (H5) - no NPC is told to move, they each read
  // the price and act, and the aggregate response scales with the signal.
  // Deterministic pick by id + cycle keeps it seed-reproducible (H2).
  const MOVE_FRACTION = 0.22;
  const ABS_CAP = 5;
  const maxMove = Math.min(ABS_CAP, Math.max(1, Math.ceil(wantSwitch.length * MOVE_FRACTION)));
  wantSwitch.sort((a, b) => {
    // rotate priority by cycle so the same NPCs aren't always first
    const ka = (a.id + cycle * 7) % npcs.length;
    const kb = (b.id + cycle * 7) % npcs.length;
    return ka - kb;
  });
  for (let i = 0; i < Math.min(maxMove, wantSwitch.length); i++) {
    const npc = wantSwitch[i];
    let best: Job = npc.job;
    for (const j of jobs) if (npc.incomeEMA[j] > npc.incomeEMA[best]) best = j;
    npc.job = best;
    npc.retrainTicks = W.RETRAIN_TICKS;
    npc.switchedFlash = 20;
  }
}

/** Seed incomeEMA at calibration so the first reallocation isn't noise. */
export function seedIncomeEMA(npcs: NPC[], ms: MarketState): void {
  for (const npc of npcs) {
    for (const j of ['farmer', 'miner'] as Job[]) {
      const good = goodOfJob(j);
      npc.incomeEMA[j] = ms.price[good] * GOOD_DEFS[good].baseYield;
    }
  }
}

export { jobOfGood };
