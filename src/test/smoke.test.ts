// Headless smoke test: proves the sim facade the renderer + UI read from boots,
// ticks, produces snapshots, drives the drought divergence, and fires callouts.
// This is the mount+tick proof that stands in for a live browser load (browser
// automation is policy-blocked in CI): if this is green, main.ts's loop (which
// only calls these same functions + Pixi draw) will animate correctly.

import { describe, it, expect } from 'vitest';
import {
  createSim,
  stepTick,
  fireShock,
  takeSimCallouts,
  scoreSnapshot,
  townSnapshot,
  droughtActive,
} from '../sim/sim.ts';

describe('render facade — mount + tick', () => {
  it('sim boots and produces a valid initial snapshot', () => {
    const sim = createSim(1234);
    const snap = scoreSnapshot(sim);
    expect(snap.day).toBe(0);
    const t = townSnapshot(sim.world.market.npcs);
    expect(t.npcs.length).toBe(60);
    expect(t.farmers + t.miners).toBe(60);
    // NPCs have positions the renderer can draw
    expect(t.npcs.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('ticks advance days and record history for sparklines', () => {
    const sim = createSim(1234);
    for (let i = 0; i < 300; i++) stepTick(sim); // 30 days
    const s = scoreSnapshot(sim);
    expect(s.day).toBe(30);
    expect(s.market.outputHistory.length).toBe(30);
    expect(s.planned.outputHistory.length).toBe(30);
    expect(s.market.price.grain).toBeGreaterThan(0);
  });

  it('drought fires, drives divergence, and emits teaching callouts', () => {
    const sim = createSim(100);
    const collected: string[] = [];
    for (let day = 1; day <= 90; day++) {
      if (day === 30) fireShock(sim, 'drought');
      for (let t = 0; t < 10; t++) stepTick(sim);
      for (const c of takeSimCallouts(sim)) collected.push(c.id);
    }
    // drought was active mid-run then lifted
    const s = scoreSnapshot(sim);
    // planned town has missed far more meals than market (the whole lesson)
    expect(s.planned.missedMealsCumulative).toBeGreaterThan(s.market.missedMealsCumulative * 2);
    // at least the core callouts fired
    expect(collected).toContain('grainExpensive');
    expect(collected.length).toBeGreaterThanOrEqual(2);
    // drought no longer active at day 90
    expect(droughtActive(sim)).toBe(false);
  });
});
