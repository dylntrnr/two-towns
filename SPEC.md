# TWO TOWNS — Build Spec v1.0
### A browser simulation of the economic calculation problem

**One-line pitch:** Two identical pixel towns, identical people, identical shock. One coordinates with prices, one with quotas. The visitor watches the information difference become a survival difference.

**Prime directive for the coding agent:** The market must win *because of the price signal*, not because the code favors it. Every rule below is designed to be symmetric except the coordination mechanism. See §8 (Honesty Checklist) — treat it as acceptance criteria.

---

## 1. Tech Stack

**Recommendation: PixiJS v8 (rendering) + vanilla TypeScript (simulation) + Vite (bundler). No backend. No game framework.**

Rationale:

- **Why not Phaser 3:** Phaser is a full game framework — scenes, physics, arcade systems — and this project uses almost none of it. The economic engine is 100% custom, so Phaser's value shrinks to "tilemap + camera," which Pixi covers in ~50 lines. Phaser also adds ~1MB and framework opinions that fight a custom fixed-timestep sim.
- **Why not plain Canvas:** Viable at this scale (2 maps × ~100 NPCs), and acceptable as a fallback. But Pixi gives WebGL sprite batching for free (matters at 16× speed with visible rendering), crisp `NEAREST`-filtered pixel scaling, containers/z-ordering, and BitmapText for the price tickers. The dependency cost is one library.
- **Deployment:** `vite build` → static `dist/` folder → GitHub Pages / Netlify / Cloudflare Pages. Zero server. All state client-side.

**Hard architectural rule:** the simulation must be **headless-capable**. Sim code imports nothing from Pixi. The renderer reads sim state; it never mutates it. This enables:
1. `npm run test` — run 10,000 ticks in Node in <1s, assert divergence numerically (§8).
2. Speed control — 16× = run 16 sim ticks per render frame; rendering cost is constant.

```
/src
 /sim ← pure TS, zero DOM/Pixi imports
 world.ts, npc.ts, goods.ts, market.ts, planner.ts, shocks.ts, metrics.ts, rng.ts
 /render ← Pixi: tilemap, sprites, tickers, heatmap, particles
 /ui ← HTML overlay: scoreboard, buttons, callout toasts
 /test ← headless divergence tests
 main.ts ← game loop: fixed-timestep sim + interpolated render
```

Fixed timestep: **10 sim ticks/second at 1×** (accumulator pattern). Renderer interpolates NPC positions between ticks.

---

## 2. Simulation Model

### 2.1 Time constants

| Unit | Value | Meaning |
|---|---|---|
| tick | 100ms at 1× | atomic sim step |
| day | 10 ticks | consumption + market clearing happen daily |
| plan cycle | 15 days (150 ticks) | Planned Town's planner reviews & re-issues quotas |
| drought duration | 20 days | default shock length |

At 4× speed, a full arc (calibration → shock → divergence → recovery) plays out in ~2–3 minutes.

### 2.2 Goods

**MVP: two goods.** (One good is not enough — the calculation problem is fundamentally about *reallocation between alternatives*, so there must be at least two things labor could do.)

```ts
type GoodId = 'grain' | 'ore'; // Phase 3 adds 'bread' (grain → bread chain)

interface GoodDef {
 id: GoodId;
 baseYield: number; // units per worker per day at calibration (grain: 3, ore: 2)
 spoilRate: number; // fraction lost per day in ANY storage (grain: 0.04, ore: 0.0)
 dailyNeed: number; // units each NPC must consume per day (grain: 1, ore: 0.5)
 // (ore = "tools/fuel"; unmet ore need reduces comfort, not survival)
}
```

Spoilage applies identically in both towns (market stalls and state warehouses alike). It is what makes gluts *costly* rather than cosmetic.

### 2.3 NPCs

Population: **60 per town**, identical seeded initial assignment (e.g., 36 farmers, 24 miners — the calibrated equilibrium).

```ts
interface NPC {
 id: number;
 town: 'market' | 'planned';
 job: 'farmer' | 'miner'; // Phase 3: 'baker', 'builder'
 retrainTicks: number; // >0 → producing at 50% while retraining
 pos: Vec2; target: Vec2 | null; path: Vec2[];
 state: 'working' | 'traveling' | 'trading' | 'queuing' | 'idle' | 'protesting';

 inventory: Partial<Record<GoodId, number>>;
 money: number; // MARKET TOWN ONLY. Planned NPCs hold no money.

 hunger: number; // 0..1; +0.15/day unfed, -0.5/day when grain need met
 comfort: number; // 0..1; driven by ore need
 happiness: number; // derived: 1 - 0.7*hunger - 0.3*(1-comfort)
 incomeEMA: Record<Job, number>; // MARKET ONLY: smoothed est. of daily income per job
}
```

**Productivity is need-coupled (symmetric in both towns):**
`personalYield = baseYield × shockYieldMult × (0.4 + 0.6 × happiness)`
Hungry NPCs produce less. This is the honest decay loop: shortages → hunger → lower output → worse shortages, in *either* town if its mechanism fails to feed people.

**Protest rule (symmetric):** if `happiness < 0.25` for 3 consecutive days, NPC enters `protesting` (productivity 0) until happiness > 0.4. A broke, starving market NPC protests exactly like a rationed-out planned NPC.

### 2.4 Market Town — price formation & labor reallocation

**Money:** each NPC starts with 20 coins. Money is conserved (buyers pay sellers). NPCs are self-employed producers: they sell surplus output, buy their needs.

**Price rule — daily tâtonnement at the market tile.** Once per day:

```
for each good g:
 supply[g] = Σ sellers' offered surplus (inventory beyond 2 days of own need)
 demand[g] = Σ buyers' desired qty (need deficit, capped by money/price[g])

 imbalance = (demand[g] - supply[g]) / max(demand[g], supply[g], 1)
 price[g] *= clamp(1 + K_PRICE * imbalance, 0.90, 1.12) // K_PRICE = 0.25
 price[g] = clamp(price[g], 0.2, 50)

 // clear at posted price; if demand > supply, ration buyers proportionally;
 // if supply > demand, sellers keep unsold stock (and eat spoilage)
 executeTrades(g, price[g])
```

This is deliberately not a perfect auction — prices *adjust*, they don't teleport to equilibrium. Overshoot and oscillation are allowed and realistic; damping comes from the clamp and from labor friction below.

**Labor reallocation — every 2 days, each NPC:**

```
for each job j:
 incomeEMA[j] = 0.8 * incomeEMA[j] + 0.2 * (price[goodOf(j)] * personalYield(j))
best = argmax(incomeEMA)
if best != currentJob AND incomeEMA[best] > incomeEMA[currentJob] * SWITCH_THRESHOLD:
 switch job; retrainTicks = 30 // 3 days at 50% output
// SWITCH_THRESHOLD = 1.3 (hysteresis prevents thrashing)
```

No NPC is told anything. Each reads one number — the price — and acts locally. The town-level correction must *emerge* from this.

### 2.5 Planned Town — the honest planner

**This is the most important design decision in the spec.** A planner that never adapts is a strawman and would rig the outcome. Mises's argument is not "planners are stupid"; it's that **without prices, even a smart, well-intentioned planner lacks the information to calculate**. So our planner is diligent and adaptive — but can only see what a real central office could see: **aggregate warehouse counts, reported late.**

No money, no prices. All output flows to a central **Warehouse**; NPCs collect equal daily **rations** at the Shop.

```ts
interface Planner {
 quota: Record<GoodId, number>; // target units per plan cycle
 assumedYield: Record<GoodId, number>; // baseYield from original calibration — STALE.
 // The planner cannot observe that drought halved
 // per-worker yield; it only sees totals, late.
 lastReport: Record<GoodId, number>; // warehouse levels as of END OF PREVIOUS cycle
 // (one full cycle of information lag)
 targetStock: Record<GoodId, number>; // population * dailyNeed * 15 days buffer
}

// Every 150 ticks (plan cycle):
function replan(p: Planner) {
 for (g of goods) {
 const gap = (p.targetStock[g] - p.lastReport[g]) / p.targetStock[g];
 // diligent proportional controller, but capped — bureaucracies move in steps:
 p.quota[g] *= clamp(1 + 0.5 * gap, 0.8, 1.2);
 }
 // Labor assignment: divide workforce using ASSUMED yields (the stale coefficients):
 laborNeed[g] = p.quota[g] / (p.assumedYield[g] * 15);
 assignWorkers(normalize(laborNeed)); // reassigned NPCs also pay 30-tick retraining
 p.lastReport = snapshotWarehouse(); // info for NEXT cycle — always one cycle old
}
```

**Rations (daily):** `ration[g] = min(dailyNeed[g], warehouse[g] / population)`. If short, NPCs queue at the Shop in arrival order; late NPCs get nothing → hunger. Queues are the *visible* symptom.

**Why divergence emerges (not scripted):**
1. **Lag:** drought hits day 30; planner's next look at (already stale) data is day 45; correction lands day 45–60. Market prices moved on day 31.
2. **Wrong model:** planner raises the grain *quota*, but yield-per-farmer has halved — hitting the quota is physically impossible with assigned labor, and the planner can't see *why*, only that the warehouse keeps draining.
3. **Whiplash:** planner keeps escalating grain labor through the drought; when the drought ends, the over-assigned farm sector floods the warehouse with spoiling grain while ore (neglected for cycles) runs short. Glut and shortage *at the same time* — the classic pattern, emerging from a lag + proportional controller, not from a script.
4. **No valuation:** rations are equal per head; there is no signal of *who* needs *what* more, and no mechanism rewards anyone for fixing the shortage.

### 2.6 Shock system

Shocks apply **identically and simultaneously** to both towns.

```ts
interface Shock {
 id: 'drought' | 'demandShift' | 'veinDepleted';
 startTick: number; durationTicks: number;
 apply(world): void; // drought: grain yieldMult = 0.45
 // demandShift: ore dailyNeed 0.5 → 1.2 ("winter — everyone needs fuel")
 // veinDepleted: ore yieldMult = 0.5, permanent
}
```

Triggered by visitor button or auto-scenario at day 30. Multiple shocks can stack.

### 2.7 The tick loop (both towns share it; only `coordination` differs)

```
function tick(world):
 world.tick++
 applyActiveShocks(world)

 for npc in world.npcs:
 advanceMovement(npc) // one step along path
 if npc.state == 'working' and atWorkplace(npc):
 npc.inventory[goodOf(npc.job)] += personalYield(npc) / TICKS_PER_DAY

 if world.tick % TICKS_PER_DAY == 0: // ---- DAILY ----
 world.coordination.distribute(world)
 // MARKET: run tâtonnement + trades at market tile (§2.4)
 // PLANNED: collect all output to warehouse; hand out rations; form queues
 for npc in world.npcs:
 consumeNeeds(npc) // eat ration/purchases; update hunger/comfort
 updateHappiness(npc)
 applySpoilage(npc.inventory); applySpoilage(world.warehouse)
 updateProtestState(npc)

 if world.tick % REALLOC_INTERVAL == 0: // ---- EVERY 2 DAYS ----
 world.coordination.reallocateLabor(world)
 // MARKET: each NPC runs the incomeEMA switch rule (§2.4)
 // PLANNED: no-op (labor moves only at plan cycle)

 if world.tick % PLAN_CYCLE == 0: // ---- EVERY 15 DAYS ----
 world.coordination.replan(world)
 // MARKET: no-op
 // PLANNED: planner.replan() (§2.5)

 world.metrics.record(world) // §2.8
 world.detectors.scan(world) // fires teaching callouts (§4.4)
```

Both worlds run from the **same RNG seed**, forked into two independent streams at t=0 so identical event ordering can't leak between towns.

### 2.8 Metrics (the scoreboard's data)

```ts
interface DailyMetrics {
 outputValue: number; // Σ units produced × CALIBRATION_WEIGHT[g]
 // weights = market prices at t=0, FROZEN — a fixed, town-neutral
 // yardstick. (Footnote for the About page: even *scoring* an
 // economy requires prices from somewhere. That's the whole point.)
 unmetDemand: number; // Σ (dailyNeed - actuallyConsumed), weighted
 avgHappiness: number;
 waste: number; // spoilage + unsold/unissued surplus beyond 30-day buffer, weighted
 protesting: number; // NPC count
}
```

Keep full history (it's ~2 numbers × 5 fields × a few thousand days — trivial) for sparkline charts.

---

## 3. Rendering

### 3.1 Tilemap

- Two **40 × 30** tile grids, 16×16px tiles, rendered side by side into one Pixi stage (or two stages if letterboxing). Scale 2× with `SCALE_MODES.NEAREST` for the 16-bit look.
- Static layer baked once into a `RenderTexture` (grass, water, paths, fields). Dynamic layer: buildings, NPCs, effects.
- Map layout **identical** in both towns except the center-tile building: Market stalls vs. Planner HQ + Warehouse + Ration Shop. Mirror the layouts so the symmetry reads instantly.

### 3.2 Minimal sprite set

| Asset | Count | Notes |
|---|---|---|
| NPC sheets | 4 jobs (farmer/miner/baker/builder) | 2-frame walk bob + horizontal flip = enough. Color-coded hats/shirts per job so **labor migration is legible as a color flow**. |
| Buildings | farm plot, mine entrance, bakery, houses ×3 variants, market stall, Planner HQ, warehouse, ration shop | 16×16 or 16×32 |
| Goods icons | grain, ore, bread, coin | 8×8, used in bubbles/tickers/queues |
| Tiles | grass, field (healthy + drought-brown variant), dirt path, water, town square | drought visibly browns the fields in BOTH towns — the shock must look identical |
| FX | thought bubble frame, "!" mark, Zzz idle, protest fist, queue marker | tiny |

Source: **Kenney.nl** (CC0 — Tiny Town / Roguelike packs cover ~90% of this) or commission a small custom sheet later. Don't block Phase 1 on art; colored rects with icons are fine until Phase 2.

### 3.3 Camera

Fixed overhead camera per town, whole town visible — **no scrolling.** The lesson depends on seeing both wholes at once. (Optional Phase 3: click-to-zoom 2× on a town, esc to return.)

### 3.4 Making the invisible visible (price signals)

1. **Price ticker** above Market Town's market tile: per-good icon + price + ▲/▼ arrow, flashing red on spikes. Planned Town's HQ shows the equivalent: current quota numbers on a static wooden sign that **visibly doesn't change** while the world burns — the stillness *is* the visualization.
2. **Scarcity heatmap tint:** in Market Town, tint each production zone by `price/calibrationPrice` (red = lucrative/scarce, blue = glut). In Planned Town there is no price, so tint by *actual* warehouse shortfall — visible to the **visitor** but, pointedly, not to the planner's quota logic. A small "you can see this; the planner can't" callout lands here.
3. **Job-switch bubbles:** when a market NPC switches, a thought bubble (coin + new good icon) pops, then the NPC walks across the map to the new workplace. With hat colors, a drought produces a **visible stream of blue miners turning into green farmers** flowing across town. This is the money shot; make the walk deliberately unhurried.
4. **Queues:** planned NPCs line up at the ration shop in a literal snaking line, growing daily during shortage. Empty-shelf icon over the shop when rations hit zero.
5. **Warehouse pile:** stacked crate sprites scale with stock — an ore mountain during the grain famine reads instantly.
6. Floating "+3 🌾" motes on production, tiny and throttled, so activity level is glanceable.

---

## 4. UI / UX for Teaching

### 4.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│ MARKET TOWN PLANNED TOWN │
│ [40×30 tile view] [40×30 tile view] │
│ price ticker quota signboard │
├────────────────────────────────────────────────────────────┤
│ SCOREBOARD output ▓▓▓▓▓ vs ▓▓▓ unmet need happiness │
│ [sparklines, one line per town, shared axes] │
├────────────────────────────────────────────────────────────┤
│ [⏸ 1× 4× 16×] [🌵 Drought] [🔥 Fuel Winter] [⛏ Vein Dry] │
│ [↻ Reset (seed #)] │
└────────────────────────────────────────────────────────────┘
```

HTML/CSS overlay (not Pixi) for scoreboard + controls — free layout, accessibility, crisp text.

### 4.2 Scoreboard

Four paired stats with sparklines on **shared axes** so divergence is a widening gap between two lines, plus a big headline number: "Planned Town has missed **412 meals**. Market Town: **31**." Concrete beats abstract.

### 4.3 Speed control

1× / 4× / 16× / pause. Implementation: sim ticks per render frame (1×=1, 4×=4, 16×=16 with rendering throttled to every 4th tick's state). Default to **4×** so the arc lands in ~2–3 min.

### 4.4 Contextual callouts — event-driven, never timed

A `detectors.scan(world)` pass fires one-sentence toasts (max ~12 words) on **first occurrence** of emergent conditions. Each fires once per run. Examples:

| Detector condition | Callout |
|---|---|
| grain price > 1.5× calibration | "Grain just got expensive — that's the shortage, broadcast to everyone." |
| ≥3 NPCs switch to farming within 5 days of a price spike | "Nobody ordered these miners to farm. The price did." |
| planned queue length ≥ 6 | "The quota was set before the drought. It can't see the line." |
| planned warehouse: one good >2× target while another <25% | "A glut and a famine in the same warehouse." |
| market unmet-demand returns to pre-shock level | "Market Town healed itself. Total orders issued: zero." |
| planner overshoot glut after drought ends | "The plan finally caught up — with a problem that no longer exists." |

Toasts point at the relevant town with a small arrow, auto-dismiss in 6s, never stack more than one.

### 4.5 Onboarding

No tutorial. A single translucent line on load: *"Two towns. Same people, same land, same luck. Different ways of deciding who makes what."* Then, after 15 sim-seconds: a pulsing highlight on the **Drought** button: *"Try ruining their harvest."* Handing the visitor the shock button makes them the experimenter, not a lecture audience.

---

## 5. The Educational Arc

**0–15s:** Both towns bustle identically. Visitor's takeaway: *these really are the same.* (This parity is load-bearing — see honesty test H3.)

**15s (visitor presses Drought):** Both fields brown simultaneously. Same shock, visibly.

**15–60s:** Market Town — grain price ticker spikes red, thought bubbles pop, blue hats stream across the map and turn green, shelves refill, price eases back. Planned Town — the quota sign doesn't move; a queue starts snaking from the ration shop; the ore pile grows behind an empty grain bay.

**60–90s:** Scoreboard gap is unmistakable. First protest fist appears in Planned Town. Callout: *"Market Town healed itself. Total orders issued: zero."*

**The one insight to leave with:** **A price is compressed knowledge.** It gathers what millions of people know and want into one number anyone can act on — and rewards them for acting. Delete the price and the knowledge still exists, scattered in a thousand heads, but no one can add it up. The planner isn't evil or dumb; the planner is *blind*.

(About panel, one paragraph, links to Mises 1920 and Hayek's "The Use of Knowledge in Society" for the curious. That's the entire reading load.)

---

## 6. Build Milestones

### Phase 0 — Skeleton (1–2 days)
- Vite + TS + Pixi scaffold; static deploy pipeline (Pages/Netlify)
- Seeded RNG (mulberry32 or similar), forked streams per town
- Fixed-timestep loop w/ accumulator; speed multiplier plumbing
- One 40×30 tilemap rendered; 10 NPCs random-walking with interpolation
- Headless entry point: `runSim(seed, ticks) → metrics[]` runs in Node

### Phase 1 — MVP: honest divergence, ugly graphics (3–5 days)
- Goods, NPC state, production, consumption, hunger→productivity coupling
- Market Town: tâtonnement, trade execution, incomeEMA labor switching
- Planned Town: warehouse, rations, queues, planner replan() with lagged reports
- Drought shock, applied symmetrically
- Metrics recording + **headless divergence test suite (§8)** — this gates the phase
- Bare-bones render: colored squares for NPCs, text prices, two towns side by side
- **Exit criterion:** with seed sweep of 50 seeds, market recovers unmet-demand to <1.2× baseline within 25 days post-shock in ≥90% of runs; planned town doesn't in ≥90%; AND no-shock runs show <5% output difference (H3).

### Phase 2 — Make it legible (3–4 days)
- Real sprites (Kenney), walk animation, job hat colors
- Price ticker, quota signboard, heatmap tints, thought bubbles, queue rendering, warehouse piles
- Scoreboard w/ sparklines; speed control UI; shock buttons; reset w/ seed display
- Callout detector system (6 detectors from §4.4)
- Onboarding line + drought-button nudge

### Phase 3 — Depth & polish (optional before ship, 3–5 days)
- Third good + production chain: baker buys grain, sells bread (market) / receives grain allocation (planned)
- Second & third shock types; shock stacking
- Protest animations, Zzz idle, drought-brown field tiles, ambient SFX (mute default)
- Click-to-zoom; About panel; shareable permalink encoding seed + shock log

### Ship after Phase 2. Phase 3 is improvement, not requirement.

---

## 7. Stretch Ideas (all optional, post-ship)

- **"You Are the Planner" mode** ⭐ highest pedagogical value: the visitor takes the HQ desk, sees only the planner's lagged aggregate reports, and sets quotas via sliders against the same shocks.
- **Mixed-economy third town:** planner sets quotas but a legal market clears the surplus.
- **Money & inflation module:** planner starts printing ration coupons; price controls in Market Town.
- **More goods/jobs (6–8), housing & builders**, seasonal cycles.
- **Multiplayer planner-vs-planner** (needs a backend — out of scope for the static build).
- **Data export:** download run CSV for classroom use.

---

## 8. Honesty Checklist — acceptance criteria for the coding agent

The whole project fails if a skeptical visitor can say "you rigged it." Every item below must hold:

- **H1 — Symmetry of physics.** Yields, spoilage, needs, hunger/productivity coupling, protest rules, retraining costs, shock magnitudes, map layout: byte-identical constants for both towns. One `WORLD_CONSTANTS` object, imported by both.
- **H2 — Symmetry of luck.** Same seed, independent forked RNG streams, deterministic tick order. A given seed always reproduces the same run (also enables the shareable permalink).
- **H3 — Steady-state parity.** With **no shock**, both towns' 200-day output must match within 5%. Planning-by-yesterday's-numbers *works* in a static world. If the planned town decays without a shock, a constant is biased; find it and fix it.
- **H4 — No strawman planner.** The planner adapts every cycle with a sane proportional rule. Its failure must trace *only* to information constraints (lag, aggregation, stale coefficients, no valuation).
- **H5 — Market friction is real.** Switching hysteresis (1.3×), 3-day retraining at 50%, price-move clamps, spoilage on unsold stock. The market must win *despite* friction, not because it's frictionless.
- **H6 — Neutral scoring.** Scoreboard weights frozen at t=0 calibration values, identical for both towns.
- **H7 — Automated proof.** `npm test` runs the 50-seed sweep + the H3 parity test. Tuning any constant must keep these green.
- **H8 — Show the failure mode both ways.** If the visitor uses the (stretch) price-ceiling button, Market Town must degrade with the same queue/hunger mechanics.

---

## Appendix A — Suggested calibration constants (tune via headless sweeps)

```ts
const WORLD = {
 POPULATION: 60, TICKS_PER_DAY: 10, PLAN_CYCLE_DAYS: 15,
 START_MONEY: 20, START_PRICE: { grain: 2.0, ore: 3.0 },
 K_PRICE: 0.25, PRICE_STEP_CLAMP: [0.90, 1.12], PRICE_BOUNDS: [0.2, 50],
 SWITCH_THRESHOLD: 1.3, RETRAIN_TICKS: 30, RETRAIN_OUTPUT: 0.5,
 REALLOC_INTERVAL_DAYS: 2,
 HUNGER_RATE: 0.15, HUNGER_RECOVERY: 0.5, PRODUCTIVITY_FLOOR: 0.4,
 PROTEST_THRESHOLD: 0.25, PROTEST_DAYS: 3, PROTEST_RECOVERY: 0.4,
 PLANNER_GAIN: 0.5, PLANNER_STEP_CLAMP: [0.8, 1.2], TARGET_STOCK_DAYS: 15,
 DROUGHT_MULT: 0.45, DROUGHT_DAYS: 20,
};
```

## Appendix B — File-by-file build order for the coding agent

1. `sim/rng.ts` → 2. `sim/goods.ts` + constants → 3. `sim/npc.ts` → 4. `sim/market.ts` → 5. `sim/planner.ts` → 6. `sim/shocks.ts` → 7. `sim/world.ts` + `sim/metrics.ts` → 8. `test/divergence.test.ts` (**gate**) → 9. `render/*` → 10. `ui/*` → 11. detectors/callouts → 12. polish.
