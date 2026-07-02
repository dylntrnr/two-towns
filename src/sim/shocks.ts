// Shock system. Shocks apply identically & simultaneously to both towns (H1).
// Pure TS, zero DOM/Pixi imports.

import { GoodId, WORLD_CONSTANTS as W } from './goods.ts';

export type ShockId = 'drought' | 'fuelWinter' | 'veinDepleted';

export interface Shock {
  id: ShockId;
  startTick: number;
  durationTicks: number; // Infinity for permanent
}

export interface ShockEffects {
  yieldMult: Record<GoodId, number>; // multiply base yield
  oreNeed: number; // per-NPC daily ore need
}

export function baseEffects(): ShockEffects {
  return { yieldMult: { grain: 1, ore: 1 }, oreNeed: 0.5 };
}

export function makeShock(id: ShockId, startTick: number): Shock {
  switch (id) {
    case 'drought':
      return { id, startTick, durationTicks: W.DROUGHT_DAYS * W.TICKS_PER_DAY };
    case 'fuelWinter':
      return { id, startTick, durationTicks: W.FUEL_DAYS * W.TICKS_PER_DAY };
    case 'veinDepleted':
      return { id, startTick, durationTicks: Infinity };
  }
}

/** Compute combined effects of all active shocks at a given tick. */
export function computeEffects(shocks: Shock[], tick: number): ShockEffects {
  const eff = baseEffects();
  for (const s of shocks) {
    const active =
      tick >= s.startTick &&
      (s.durationTicks === Infinity || tick < s.startTick + s.durationTicks);
    if (!active) continue;
    switch (s.id) {
      case 'drought':
        eff.yieldMult.grain *= W.DROUGHT_MULT;
        break;
      case 'fuelWinter':
        eff.oreNeed = W.FUEL_ORE_NEED;
        break;
      case 'veinDepleted':
        eff.yieldMult.ore *= W.VEIN_MULT;
        break;
    }
  }
  return eff;
}

export function isDroughtActive(shocks: Shock[], tick: number): boolean {
  return shocks.some(
    (s) =>
      s.id === 'drought' &&
      tick >= s.startTick &&
      tick < s.startTick + s.durationTicks,
  );
}
