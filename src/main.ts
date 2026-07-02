// Game loop: fixed-timestep sim (accumulator) + rendered frames. Speed control
// runs N sim ticks per rendered frame. The sim is authoritative and headless;
// the renderer and UI only READ it.

import './ui/style.css';
import { createSim, stepTick, fireShock, takeSimCallouts, type Sim } from './sim/sim.ts';
import { WORLD_CONSTANTS as W } from './sim/goods.ts';
import { createRenderer, renderFrame, type Renderer } from './render/renderer.ts';
import { buildUI } from './ui/ui.ts';
import type { ShockId } from './sim/shocks.ts';

const TICK_MS = 100; // 10 ticks/sec at 1x
let speed = 4; // default 4x (per spec)
let sim: Sim;
let renderer: Renderer;

function randomSeed(): number {
  return Math.floor(Math.random() * 9000) + 1000;
}

let currentSeed = randomSeed();

const ui = buildUI({
  onSpeed: (m) => { speed = m; },
  onShock: (id: ShockId) => {
    fireShock(sim, id);
    ui.markShockUsed(id);
  },
  onReset: () => {
    currentSeed = randomSeed();
    sim = createSim(currentSeed);
    ui.setSeed(currentSeed);
    // reset shock button styling by rebuilding? simplest: reload state visuals
    rebuildRenderer();
  },
});

async function rebuildRenderer() {
  const mount = document.getElementById('pixi-mount')!;
  if (renderer) renderer.destroy();
  mount.innerHTML = '';
  renderer = await createRenderer(mount);
}

async function boot() {
  sim = createSim(currentSeed);
  ui.setSeed(currentSeed);
  const mount = document.getElementById('pixi-mount')!;
  renderer = await createRenderer(mount);

  let last = performance.now();
  let acc = 0;

  function frame(now: number) {
    const dt = now - last;
    last = now;
    if (speed > 0) {
      acc += dt;
      const tickInterval = TICK_MS / speed;
      let steps = 0;
      const maxSteps = speed * 4 + 4; // cap catch-up
      while (acc >= tickInterval && steps < maxSteps) {
        stepTick(sim);
        acc -= tickInterval;
        steps++;
      }
    }
    const cs = takeSimCallouts(sim);
    if (cs.length) ui.pushCallouts(cs);
    renderFrame(renderer, sim);
    ui.update(sim);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void W; // constants imported for potential tuning display
boot();
