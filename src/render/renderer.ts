// Pixi v8 renderer. READS sim state, never mutates it. Two 40x30 tile views
// side by side. NPCs are colored rects (job = color) so labor migration reads
// as a color flow. Price ticker over Market, quota signboard over Planned,
// ration queue + warehouse pile for Planned.
//
// Art is intentionally colored rects + text (SPEC allows this; do not block on
// sprite assets). The whole point renders fine with shapes.

import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from 'pixi.js';
import type { Sim } from '../sim/sim.ts';
import { townSnapshot, droughtActive } from '../sim/sim.ts';
import { WORLD_CONSTANTS as W } from '../sim/goods.ts';

const GRID_W = 40;
const GRID_H = 30;
const TILE = 12; // px per tile
const GAP = 24; // px between the two towns
const TOP = 40; // header band for tickers/signboards
const townPxW = GRID_W * TILE;
const townPxH = GRID_H * TILE;

const COLORS = {
  grass: 0x4a7c3a,
  grassDrought: 0x8a7a3a,
  field: 0x6b8f3a,
  fieldDrought: 0x9c8340,
  path: 0x8a7a5a,
  water: 0x2a5a8a,
  square: 0xb0a080,
  farmer: 0x39d353, // green
  miner: 0x3aa0ff, // blue
  protest: 0xd8324a, // red
  retrain: 0xf0d020, // yellow flash
  buildingMarket: 0xc07020,
  buildingHQ: 0x8060c0,
  warehouse: 0x907050,
  shop: 0xa05030,
  crate: 0xc8a060,
};

interface TownView {
  root: Container;
  fieldTiles: Graphics; // repainted on drought
  npcLayer: Container;
  npcGfx: Map<number, Graphics>;
  header: Container;
}

export interface Renderer {
  app: Application;
  market: TownView;
  planned: TownView;
  tickerText: Text;
  quotaText: Text;
  queueText: Text;
  warehouseGfx: Graphics;
  interpAlpha: number;
  destroy(): void;
}

function makeTextStyle(size: number, fill: number, weight: 'normal' | 'bold' = 'normal'): TextStyle {
  return new TextStyle({
    fontFamily: 'monospace',
    fontSize: size,
    fill,
    fontWeight: weight,
  });
}

function buildStaticTiles(drought: boolean): Graphics {
  const g = new Graphics();
  // base grass
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let color = COLORS.grass;
      // fields (farm zone) top-left block
      const inField = x >= 5 && x <= 13 && y >= 5 && y <= 12;
      const inMine = x >= 27 && x <= 34 && y >= 17 && y <= 24;
      if (inField) color = drought ? COLORS.fieldDrought : COLORS.field;
      else if (drought && y < 14) color = COLORS.grassDrought;
      if (inMine) color = 0x5a5a5a; // rocky mine ground
      // central town square
      if (x >= 17 && x <= 22 && y >= 12 && y <= 17) color = COLORS.square;
      g.rect(x * TILE, y * TILE, TILE, TILE).fill(color);
    }
  }
  return g;
}

function buildTownView(app: Application, offsetX: number, title: string, isMarket: boolean): TownView {
  const root = new Container();
  root.x = offsetX;
  root.y = TOP;
  app.stage.addChild(root);

  const fieldTiles = buildStaticTiles(false);
  root.addChild(fieldTiles);

  // center building
  const b = new Graphics();
  if (isMarket) {
    // market stalls
    b.rect(18 * TILE, 13 * TILE, 4 * TILE, 3 * TILE).fill(COLORS.buildingMarket);
  } else {
    // Planner HQ + warehouse + shop
    b.rect(18 * TILE, 13 * TILE, 2 * TILE, 3 * TILE).fill(COLORS.buildingHQ);
    b.rect(20 * TILE, 13 * TILE, 2 * TILE, 2 * TILE).fill(COLORS.warehouse);
    b.rect(20 * TILE, 15 * TILE, 2 * TILE, 1 * TILE).fill(COLORS.shop);
  }
  root.addChild(b);

  const npcLayer = new Container();
  root.addChild(npcLayer);

  // town title
  const header = new Container();
  const t = new Text({ text: title, style: makeTextStyle(16, 0xffffff, 'bold') });
  t.x = 0;
  t.y = -TOP + 4;
  header.addChild(t);
  root.addChild(header);

  return { root, fieldTiles, npcLayer, npcGfx: new Map(), header };
}

function npcColor(s: { job: string; protesting: boolean; retraining: boolean; switchedFlash: number }): number {
  if (s.protesting) return COLORS.protest;
  if (s.switchedFlash > 0) return COLORS.retrain;
  return s.job === 'farmer' ? COLORS.farmer : COLORS.miner;
}

export async function createRenderer(mount: HTMLElement): Promise<Renderer> {
  const app = new Application();
  const width = townPxW * 2 + GAP;
  const height = townPxH + TOP;
  await app.init({
    width,
    height,
    background: 0x1a1a24,
    antialias: false,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  mount.appendChild(app.canvas);

  const market = buildTownView(app, 0, 'MARKET TOWN', true);
  const planned = buildTownView(app, townPxW + GAP, 'PLANNED TOWN', false);

  // Price ticker over market
  const tickerText = new Text({ text: '', style: makeTextStyle(13, 0xffd050, 'bold') });
  tickerText.x = townPxW * 0.45;
  tickerText.y = 6;
  app.stage.addChild(tickerText);

  // Quota signboard over planned (a static-looking wooden sign)
  const signBg = new Graphics();
  signBg.roundRect(townPxW + GAP + townPxW * 0.42, 2, 170, 30, 4).fill(0x5a3a1a);
  app.stage.addChild(signBg);
  const quotaText = new Text({ text: '', style: makeTextStyle(11, 0xe8d8b0, 'bold') });
  quotaText.x = townPxW + GAP + townPxW * 0.42 + 6;
  quotaText.y = 6;
  app.stage.addChild(quotaText);

  // Ration queue line + warehouse pile (planned)
  const queueText = new Text({ text: '', style: makeTextStyle(11, 0xffffff) });
  queueText.x = planned.root.x + 20 * TILE + 30;
  queueText.y = planned.root.y + 16 * TILE + 4;
  app.stage.addChild(queueText);

  const warehouseGfx = new Graphics();
  warehouseGfx.x = planned.root.x + 20 * TILE;
  warehouseGfx.y = planned.root.y + 8 * TILE;
  app.stage.addChild(warehouseGfx);

  return {
    app,
    market,
    planned,
    tickerText,
    quotaText,
    queueText,
    warehouseGfx,
    interpAlpha: 1,
    destroy() {
      app.destroy(true, { children: true });
    },
  };
}

let lastDrought = false;

function syncTown(view: TownView, sim: Sim, town: 'market' | 'planned'): void {
  void town;
  const npcs = town === 'market' ? sim.world.market.npcs : sim.world.planned.npcs;
  const snap = townSnapshot(npcs);
  const seen = new Set<number>();
  for (const s of snap.npcs) {
    seen.add(s.id);
    let g = view.npcGfx.get(s.id);
    if (!g) {
      g = new Graphics();
      view.npcLayer.addChild(g);
      view.npcGfx.set(s.id, g);
    }
    g.clear();
    const size = TILE - 3;
    g.rect(0, 0, size, size).fill(npcColor(s));
    g.x = s.x * TILE + 1.5;
    g.y = s.y * TILE + 1.5;
    g.alpha = s.protesting ? 0.95 : 1;
  }
  // remove gone
  for (const [id, g] of view.npcGfx) {
    if (!seen.has(id)) {
      g.destroy();
      view.npcGfx.delete(id);
    }
  }
}

export function renderFrame(r: Renderer, sim: Sim): void {
  // Redraw drought fields if state changed
  const dr = droughtActive(sim);
  if (dr !== lastDrought) {
    lastDrought = dr;
    for (const view of [r.market, r.planned]) {
      view.fieldTiles.destroy();
      const g = buildStaticTiles(dr);
      view.root.addChildAt(g, 0);
      view.fieldTiles = g;
    }
  }

  syncTown(r.market, sim, 'market');
  syncTown(r.planned, sim, 'planned');

  // Price ticker
  const ms = sim.world.market.market!;
  const pg = ms.price.grain;
  const po = ms.price.ore;
  const gArrow = pg > W.START_PRICE.grain * 1.05 ? '\u25B2' : pg < W.START_PRICE.grain * 0.95 ? '\u25BC' : '=';
  const oArrow = po > W.START_PRICE.ore * 1.05 ? '\u25B2' : po < W.START_PRICE.ore * 0.95 ? '\u25BC' : '=';
  r.tickerText.text = `\uD83C\uDF3E ${pg.toFixed(1)}${gArrow}   \u26CF ${po.toFixed(1)}${oArrow}`;
  r.tickerText.style.fill = pg > W.START_PRICE.grain * 1.5 ? 0xff4040 : 0xffd050;

  // Quota signboard (static-looking; barely moves = the point)
  const p = sim.world.planned.planner!;
  r.quotaText.text = `QUOTA  \uD83C\uDF3E ${p.quota.grain.toFixed(0)}  \u26CF ${p.quota.ore.toFixed(0)}`;

  // Ration queue
  const q = p.queueLen;
  r.queueText.text = q > 0 ? `\uD83D\uDC65 ration line: ${q}` : '';

  // Warehouse pile (crates scale with grain stock)
  r.warehouseGfx.clear();
  const grainCrates = Math.min(20, Math.round(p.warehouse.grain / 20));
  const oreCrates = Math.min(20, Math.round(p.warehouse.ore / 15));
  for (let i = 0; i < grainCrates; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    r.warehouseGfx.rect(col * 6, -row * 6, 5, 5).fill(COLORS.farmer);
  }
  for (let i = 0; i < oreCrates; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    r.warehouseGfx.rect(40 + col * 6, -row * 6, 5, 5).fill(COLORS.miner);
  }
}
