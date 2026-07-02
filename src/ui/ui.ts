// HTML/CSS overlay: scoreboard w/ sparklines, speed control, shock buttons,
// reset w/ seed, onboarding line, callout toasts, about panel.
// Reads sim snapshots; calls back into main for control actions.

import type { Sim } from '../sim/sim.ts';
import { scoreSnapshot } from '../sim/sim.ts';
import type { Callout } from '../sim/detectors.ts';

export interface UICallbacks {
  onSpeed: (mult: number) => void;
  onShock: (id: 'drought' | 'fuelWinter' | 'veinDepleted') => void;
  onReset: () => void;
}

export interface UI {
  update(sim: Sim): void;
  pushCallouts(cs: Callout[]): void;
  setSeed(seed: number): void;
  markShockUsed(id: string): void;
}

// tiny inline sparkline as SVG polyline
function sparkline(marketData: number[], plannedData: number[], w = 240, h = 34): string {
  const all = [...marketData, ...plannedData];
  const max = Math.max(1, ...all);
  const n = Math.max(marketData.length, plannedData.length, 1);
  const pts = (data: number[]) =>
    data
      .map((v, i) => {
        const x = (i / Math.max(1, n - 1)) * w;
        const y = h - (v / max) * (h - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline fill="none" stroke="#39d353" stroke-width="1.5" points="${pts(marketData)}"/>
    <polyline fill="none" stroke="#3aa0ff" stroke-width="1.5" points="${pts(plannedData)}"/>
  </svg>`;
}

export function buildUI(cb: UICallbacks): UI {
  const scoreboard = document.getElementById('scoreboard')!;
  const controls = document.getElementById('controls')!;
  const onboard = document.getElementById('onboard')!;
  const toast = document.getElementById('toast')!;
  const aboutPanel = document.getElementById('about-panel')!;

  // ---- Scoreboard ----
  scoreboard.innerHTML = `
    <div class="sb-headline">
      <span class="meals">Planned Town has missed <b id="pln-meals">0</b> meals.
      Market Town: <b id="mkt-meals" class="good">0</b>.</span>
    </div>
    <div class="sb-legend"><span class="dot mkt"></span>Market
      <span class="dot pln"></span>Planned &nbsp;·&nbsp; day <b id="daycount">0</b></div>
    <div class="sb-grid">
      <div class="sb-card"><div class="sb-title">Output</div><div id="spark-output"></div></div>
      <div class="sb-card"><div class="sb-title">Unmet need</div><div id="spark-unmet"></div></div>
      <div class="sb-card"><div class="sb-title">Happiness</div><div id="spark-happy"></div></div>
    </div>`;

  // ---- Controls ----
  controls.innerHTML = `
    <div class="ctl-row">
      <div class="speed">
        <button data-spd="0" class="spd">\u23F8</button>
        <button data-spd="1" class="spd">1\u00D7</button>
        <button data-spd="4" class="spd active">4\u00D7</button>
        <button data-spd="16" class="spd">16\u00D7</button>
      </div>
      <div class="shocks">
        <button id="sh-drought" class="shock pulse">\uD83C\uDF35 Drought</button>
        <button id="sh-fuel" class="shock">\uD83D\uDD25 Fuel Winter</button>
        <button id="sh-vein" class="shock">\u26CF Vein Dry</button>
      </div>
      <button id="reset" class="reset">\u21BB Reset <span id="seedlabel"></span></button>
      <button id="about-btn" class="about-btn">?</button>
    </div>`;

  // wire speed
  controls.querySelectorAll('.spd').forEach((b) => {
    b.addEventListener('click', () => {
      controls.querySelectorAll('.spd').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      cb.onSpeed(Number((b as HTMLElement).dataset.spd));
    });
  });
  document.getElementById('sh-drought')!.addEventListener('click', () => cb.onShock('drought'));
  document.getElementById('sh-fuel')!.addEventListener('click', () => cb.onShock('fuelWinter'));
  document.getElementById('sh-vein')!.addEventListener('click', () => cb.onShock('veinDepleted'));
  document.getElementById('reset')!.addEventListener('click', () => cb.onReset());

  // ---- Onboarding ----
  onboard.innerHTML =
    'Two towns. Same people, same land, same luck. Different ways of deciding who makes what.';
  onboard.classList.remove('hidden');

  // ---- About panel ----
  aboutPanel.innerHTML = `
    <div class="about-inner">
      <h2>Why the market wins</h2>
      <p>A price is compressed knowledge. It gathers what thousands of people know
      and want into a single number that anyone can act on — and rewards them for
      acting. Delete the price and the knowledge still exists, scattered across a
      thousand heads, but no one can add it up. The planner here is not evil or
      stupid; it adapts every cycle with a sane rule. It is simply <em>blind</em>:
      it sees only late, aggregate warehouse totals, never the millions of local
      facts a price silently sums. Same people, same land, same shock — the only
      difference is whether a price is allowed to speak.</p>
      <p class="links">
        <a href="https://mises.org/library/economic-calculation-socialist-commonwealth" target="_blank" rel="noopener">Mises, <em>Economic Calculation in the Socialist Commonwealth</em> (1920)</a><br>
        <a href="https://www.econlib.org/library/Essays/hykKnw.html" target="_blank" rel="noopener">Hayek, <em>The Use of Knowledge in Society</em> (1945)</a>
      </p>
      <button id="about-close" class="reset">Close</button>
    </div>`;
  document.getElementById('about-btn')!.addEventListener('click', () =>
    aboutPanel.classList.remove('hidden'));
  aboutPanel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'about-close' || e.target === aboutPanel)
      aboutPanel.classList.add('hidden');
  });

  let onboardStage = 0;
  const startTime = performance.now();

  const toastQueue: Callout[] = [];
  let toastTimer = 0;

  function showNextToast() {
    if (toastQueue.length === 0) {
      toast.classList.add('hidden');
      return;
    }
    const c = toastQueue.shift()!;
    toast.innerHTML = `<span class="arrow ${c.town}">${c.town === 'market' ? '\u25C0' : '\u25B6'}</span> ${c.text}`;
    toast.className = `toast ${c.town}`;
    toastTimer = performance.now();
  }

  return {
    update(sim: Sim) {
      const s = scoreSnapshot(sim);
      (document.getElementById('daycount')!).textContent = String(Math.floor(s.day));
      (document.getElementById('pln-meals')!).textContent = Math.round(s.planned.missedMealsCumulative).toLocaleString();
      (document.getElementById('mkt-meals')!).textContent = Math.round(s.market.missedMealsCumulative).toLocaleString();
      document.getElementById('spark-output')!.innerHTML = sparkline(s.market.outputHistory, s.planned.outputHistory);
      document.getElementById('spark-unmet')!.innerHTML = sparkline(s.market.unmetHistory, s.planned.unmetHistory);
      document.getElementById('spark-happy')!.innerHTML = sparkline(
        s.market.happyHistory.map((h) => h * 100),
        s.planned.happyHistory.map((h) => h * 100),
      );

      // onboarding: after 15 sim-seconds (~day depends on speed) nudge drought
      const elapsed = (performance.now() - startTime) / 1000;
      if (onboardStage === 0 && elapsed > 4) {
        onboard.classList.add('fade');
        onboardStage = 1;
      }
      if (onboardStage === 1 && elapsed > 8) {
        onboard.innerHTML = 'Try ruining their harvest \u2192 press <b>Drought</b>.';
        onboard.classList.remove('fade');
        onboard.classList.add('nudge');
        onboardStage = 2;
      }

      // toast auto-dismiss after 6s
      if (!toast.classList.contains('hidden') && performance.now() - toastTimer > 6000) {
        showNextToast();
      }
    },
    pushCallouts(cs: Callout[]) {
      for (const c of cs) toastQueue.push(c);
      if (toast.classList.contains('hidden') && toastQueue.length) showNextToast();
    },
    setSeed(seed: number) {
      const lbl = document.getElementById('seedlabel');
      if (lbl) lbl.textContent = `#${seed}`;
      // reset shock button styling on a fresh seed
      const dr = document.getElementById('sh-drought');
      if (dr) { dr.classList.remove('used'); dr.classList.add('pulse'); }
      for (const id of ['sh-fuel', 'sh-vein']) {
        const b = document.getElementById(id);
        if (b) b.classList.remove('used');
      }
      onboard.classList.remove('hidden');
      onboard.innerHTML =
        'Two towns. Same people, same land, same luck. Different ways of deciding who makes what.';
      onboardStage = 0;
    },
    markShockUsed(id: string) {
      const map: Record<string, string> = {
        drought: 'sh-drought',
        fuelWinter: 'sh-fuel',
        veinDepleted: 'sh-vein',
      };
      const b = document.getElementById(map[id]);
      if (b) {
        b.classList.remove('pulse');
        b.classList.add('used');
      }
      if (id === 'drought') {
        onboard.classList.add('hidden');
      }
    },
  };
}
