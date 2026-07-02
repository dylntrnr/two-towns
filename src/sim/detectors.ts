// Contextual callout detectors (§4.4). Pure TS, zero DOM/Pixi imports.
// Fires one-sentence teaching toasts on FIRST occurrence of an emergent
// condition. Each fires once per run. The renderer/UI reads the queue and
// displays them; the sim just decides WHEN they are true.

import { WORLD_CONSTANTS as W } from './goods.ts';
import type { World } from './world.ts';

export interface Callout {
  id: string;
  text: string;
  town: 'market' | 'planned';
}

export interface DetectorState {
  fired: Set<string>;
  pending: Callout[]; // consumed by UI
  switchesRecent: { day: number; count: number }[];
  grainSpikeDay: number | null;
}

export function makeDetectors(): DetectorState {
  return { fired: new Set(), pending: [], switchesRecent: [], grainSpikeDay: null };
}

function fire(d: DetectorState, id: string, text: string, town: 'market' | 'planned') {
  if (d.fired.has(id)) return;
  d.fired.add(id);
  d.pending.push({ id, text, town });
}

/**
 * Scan once per day. `switchesToday` = number of market NPCs that switched to
 * farming today (tracked by the loop).
 */
export function scanDetectors(
  d: DetectorState,
  world: World,
  day: number,
  switchesToFarmingToday: number,
): void {
  const ms = world.market.market!;
  const p = world.planned.planner!;
  const startGrain = W.START_PRICE.grain;

  // 1. grain price > 1.5x calibration
  if (ms.price.grain > startGrain * 1.5) {
    if (d.grainSpikeDay === null) d.grainSpikeDay = day;
    fire(d, 'grainExpensive',
      'Grain just got expensive — that\u2019s the shortage, broadcast to everyone.',
      'market');
  }

  // 2. >=3 NPCs switch to farming within 5 days of a price spike
  d.switchesRecent.push({ day, count: switchesToFarmingToday });
  d.switchesRecent = d.switchesRecent.filter((s) => s.day > day - 5);
  const recentSwitches = d.switchesRecent.reduce((a, s) => a + s.count, 0);
  if (recentSwitches >= 3 && d.grainSpikeDay !== null && day - d.grainSpikeDay <= 6) {
    fire(d, 'nobodyOrdered',
      'Nobody ordered these miners to farm. The price did.',
      'market');
  }

  // 3. planned queue length >= 6
  if (p.queueLen >= 6) {
    fire(d, 'quotaBlind',
      'The quota was set before the drought. It can\u2019t see the line.',
      'planned');
  }

  // 4. planned warehouse: one good > 2x target while another < 25%
  const grainRatio = p.warehouse.grain / Math.max(1, p.targetStock.grain);
  const oreRatio = p.warehouse.ore / Math.max(1, p.targetStock.ore);
  if ((grainRatio > 2 && oreRatio < 0.25) || (oreRatio > 2 && grainRatio < 0.25)) {
    fire(d, 'glutAndFamine',
      'A glut and a famine in the same warehouse.',
      'planned');
  }

  // 5. market unmet-survival returns to pre-shock level AFTER being disrupted
  const hist = world.market.metrics.history;
  const today = hist[hist.length - 1];
  if (today) {
    // must have been disrupted at some point
    const wasDisrupted = hist.some((h) => h.unmetSurvival > 15);
    if (wasDisrupted && today.unmetSurvival < 0.5 && day > 40) {
      fire(d, 'marketHealed',
        'Market Town healed itself. Total orders issued: zero.',
        'market');
    }
  }

  // 6. planner overshoot glut after drought ends (grain warehouse balloons)
  const droughtOver = world.shocks.some(
    (s) => s.id === 'drought' && world.tick >= s.startTick + s.durationTicks,
  );
  if (droughtOver && grainRatio > 1.8) {
    fire(d, 'planLate',
      'The plan finally caught up — with a problem that no longer exists.',
      'planned');
  }
}

export function takeCallouts(d: DetectorState): Callout[] {
  const out = d.pending;
  d.pending = [];
  return out;
}
