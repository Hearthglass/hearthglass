import { Surface, CLEAR, bayer, createNoise, clamp, sprite, opaqueRuns, blitRuns } from '../../shared/pixel-engine.js';
import { palette, LIGHT, SHADE } from './palette.js';

const c = name => palette.c(name);
const SKY = palette.ramp('sky');
const NEB = palette.ramp('neb');
const CLOUD = palette.ramp('cloud');
const VALE = palette.ramp('vale');

// Bats, two wingbeats each, in the fine (360-row) and coarse (180-row) grids.
const BAT_KEY = { b: 'ink0', d: 'near1', e: 'fire4' };
const BATS = {
  2: [
    sprite(palette, BAT_KEY, ['b.........b', 'bb.......bb', '.bbbdbdbbb.', '...bbbbb...', '....b.b....']),
    sprite(palette, BAT_KEY, ['...........', '....bdb....', '.bbbbbbbbb.', 'bb..bbb..bb', 'b...b.b...b']),
  ],
  1: [
    sprite(palette, BAT_KEY, ['b.....b', '.bbdbb.', '..b.b..']),
    sprite(palette, BAT_KEY, ['..bdb..', '.bbbbb.', 'b.....b']),
  ],
};

/**
 * Everything beyond the observatory wall: the sky and its stars, clouds, three mountain
 * ranges, a river valley with a village, the castle and the forest. The still parts are
 * baked when the screen size changes; windows, water, smoke, fog and bats move per frame.
 */
export function createBackdrop(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  const sky = new Surface(1, 1);
  const skyHalo = new Surface(1, 1);
  const land = new Surface(1, 1);
  let landRuns = new Int32Array(0);
  let stars = [], clouds = [], windows = [], chimneys = [], flags = [], river = [];
  let fog = null;
  const bats = [];
  let nextBats = 9;
  const shooting = { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, next: 6 };
  let layout = null, k = 1, u = 1;

  function build(next) {
    layout = next;
    ({ k, u } = layout);
    const { W, H } = layout;
    sky.resize(W, H);
    land.resize(W, H);
    buildSky(W, H);
    buildLand(W, H);
    landRuns = opaqueRuns(land);
    // the moon's halo, baked into a second sky for while the moon is whole
    skyHalo.resize(W, H);
    skyHalo.data.set(sky.data);
    skyHalo.glow(layout.moonX, layout.moonY, layout.moonR * 3, LIGHT.moonHalo, 0.9, 1, 1, layout.moonR + 0.6);
    buildStars(W);
    buildClouds(W);
    buildFog(W);
    bats.length = 0;
  }

  // ---- sky ---------------------------------------------------------------------------

  function buildSky(W, H) {
    const { horizonY, moonX } = layout;
    const d = sky.data;
    const bottom = horizonY + 8 * k;
    for (let y = 0; y < H; y++) {
      const t = clamp(y / bottom, 0, 1);
      for (let x = 0; x < W; x++) {
        // The horizon warms a little on the moon's side; a faint wave breaks up the bands.
        const moonSide = Math.exp(-(((x - moonX) / (W * 0.55)) ** 2)) * t * t * 1.4;
        const wobble = (noise.n1(x * 0.02 / k + y * 0.05 / k) - 0.5) * 0.6;
        const q = clamp(Math.pow(t, 1.1) * (SKY.length - 2.2) + moonSide + wobble, 0, SKY.length - 1);
        let i = Math.floor(q);
        if (q - i > bayer(x, y)) i = Math.min(SKY.length - 1, i + 1);
        d[y * W + x] = SKY[i];
      }
    }
    // The Milky Way rises from the lower left and leaves the moon's side of the sky dark.
    const ax = W * 0.0, ay = horizonY * 1.05, bx = W * 0.66, by = -H * 0.12;
    const lx = bx - ax, ly = by - ay, len = Math.hypot(lx, ly);
    const width = Math.max(18, H * 0.13);
    for (let y = 0; y < horizonY; y++) {
      for (let x = 0; x < W; x++) {
        const along = ((x - ax) * lx + (y - ay) * ly) / len;
        const across = ((x - ax) * -ly + (y - ay) * lx) / len;
        const bend = Math.sin(along * 0.009 / k) * width * 0.3;
        const dist = (across - bend) / width;
        let band = Math.exp(-dist * dist * 2.4);
        const grain = noise.fbm2(x * 0.045 / k, y * 0.045 / k, 4);
        band *= 0.25 + grain * 1.05;
        // dark dust lanes wander along the core
        const lane = noise.fbm2(x * 0.03 / k + 7, y * 0.06 / k, 4);
        const rift = Math.exp(-(((dist + 0.1) / 0.16) ** 2)) * (lane > 0.47 ? 0.75 : 0.15);
        band = (band - rift) * clamp((horizonY - y) / (horizonY * 0.3), 0, 1) * clamp(y / (H * 0.08), 0.3, 1);
        const i = y * W + x;
        if (band > 0.2 + bayer(x, y) * 0.3) d[i] = palette.lighter[d[i]];
        if (band > 0.45 + bayer(x + 1, y + 2) * 0.25) d[i] = palette.lighter[d[i]];
        if (band > 0.62) {
          const v = clamp((band - 0.62) / 0.5 * NEB.length + bayer(x, y) - 0.5, 0, NEB.length - 1);
          d[i] = NEB[Math.floor(v)];
        }
        if (band < -0.15 && bayer(x, y) > 0.5) d[i] = palette.darker[d[i]];
        // the band is made of countless faint stars
        if (band > 0.3 && random() < band * 0.07) d[i] = random() < 0.3 ? c('star2') : random() < 0.5 ? c('star1') : c('neb3');
      }
    }
    // Dim, still background stars across the whole sky.
    const count = Math.round(W * horizonY / (70 * k));
    for (let n = 0; n < count; n++) {
      const x = Math.floor(random() * W), y = Math.floor(random() * horizonY * 0.98);
      d[y * W + x] = random() < 0.25 ? c('star1') : c('star0');
    }
  }

  function buildStars(W) {
    stars = [];
    const { horizonY } = layout;
    const count = Math.round(W * horizonY / (150 * k * k) * (u > 1 ? 1.6 : 1));
    for (let n = 0; n < count; n++) {
      const bright = random();
      stars.push({
        x: Math.floor(random() * W), y: Math.floor(random() * horizonY * 0.9),
        level: bright < 0.06 ? 3 : bright < 0.28 ? 2 : 1,
        tint: random() < 0.22 ? Math.floor(random() * 3) : -1,
        phase: random() * Math.PI * 2, speed: 0.6 + random() * 2.2,
      });
    }
  }

  // ---- clouds ------------------------------------------------------------------------

  // A cloud as a heap of puffs under one silhouette, lit from the moon (up and to the
  // right): a silver crown, soft inner puff edges, a violet body and a torn dark underside.
  function makeCloud(w, h) {
    const s = new Surface(w, h, CLEAR);
    const base = Math.round(h * 0.8);
    const puffs = [];
    // long, low banks: a few big overlapping puffs squashed flat, one crown higher than the rest
    const n = 2 + Math.floor(w / (26 * k));
    const peak = 0.3 + random() * 0.4;
    const FLAT = 0.62;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n + (random() - 0.5) * 0.12 / n;
      const env = Math.max(0.2, 1 - Math.abs(t - peak) * 1.6);
      const rx = w / n * (0.75 + random() * 0.35) * (0.7 + env * 0.5);
      const r = Math.min(h * 0.7 / FLAT, rx);
      puffs.push({ x: t * w, y: base - r * FLAT * (0.2 + env * 0.35), r, rx: r, ry: r * FLAT });
    }
    const top = new Float32Array(w).fill(Infinity);
    for (let x = 0; x < w; x++) for (const p of puffs) {
      const dx = (x - p.x) / p.rx;
      if (Math.abs(dx) < 1) top[x] = Math.min(top[x], p.y - Math.sqrt(1 - dx * dx) * p.ry);
    }
    for (let x = 0; x < w; x++) {
      if (!Number.isFinite(top[x])) continue;
      const slope = ((top[Math.min(w - 1, x + 1)] || top[x]) - (top[Math.max(0, x - 1)] || top[x])) / 2;
      const facing = clamp(0.6 - slope * 0.9, 0, 1.4); // rising to the right faces the moon
      const t0 = Math.max(0, Math.ceil(top[x]));
      const underside = base + Math.round(noise.n1(x * 0.1 / k + h) * 2.5 * k);
      for (let y = t0; y <= Math.min(h - 1, underside); y++) {
        const depth = (y - top[x]) / k;
        let v = 4.2 + facing * 1.2 - depth * 0.55;
        if (depth < 1) v += 1;
        // inner puffs show as faint lit arcs inside the body
        for (const p of puffs) {
          const d = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry);
          if (y < p.y && Math.abs(d - 1) * p.ry < 0.7 && y > top[x] + 2 * k && x > p.x - p.rx * 0.1) v += 1;
        }
        if (y > base - k) v = Math.min(v, 1.6);
        if (y > base) v = 0.8;
        v = Math.max(v, 1.2);
        // feathered ends
        const edge = Math.min(x, w - 1 - x) / (w * 0.1);
        if (edge < 1 && bayer(x, y) > edge) continue;
        s.data[y * w + x] = CLOUD[clamp(Math.round(v + bayer(x, y) - 0.5), 0, CLOUD.length - 1)];
      }
    }
    // a wisp trailing under the body
    const wy = Math.min(h - 1, base + Math.round(1.5 * k));
    for (let x = Math.round(w * 0.1); x < w * (0.5 + random() * 0.4); x++) if (bayer(x, wy) > 0.5 && s.data[wy * w + x] === CLEAR) s.data[wy * w + x] = CLOUD[1];
    return s;
  }

  function buildClouds(W) {
    clouds = [];
    const n = Math.max(3, Math.round(W / (95 * k)));
    for (let i = 0; i < n; i++) {
      const w = Math.round((44 + random() * 70) * k), h = Math.round((12 + random() * 8) * k);
      clouds.push({ sprite: makeCloud(w, h), x: random() * (W + w) - w, y: placeCloudY(), speed: (1.2 + random() * 2.4) * k });
    }
  }
  const placeCloudY = () => layout.H * 0.04 + random() * layout.horizonY * 0.5;

  // ---- land ------------------------------------------------------------------------------

  // Ridged multi-octave noise: sharp peaks and saddles rather than rolling hills.
  function ridge(x, base, amp, scale, sharp, seed) {
    let r = 0, a = 0.5, f = 1, norm = 0;
    for (let o = 0; o < 5; o++) {
      const v = 1 - Math.abs(2 * noise.n1(x * scale * f + seed + o * 17.3) - 1);
      r += v * v * a; norm += a; a *= 0.5; f *= 2.13;
    }
    r /= norm;
    const broad = noise.fbm1(x * scale * 0.3 + seed * 2.7, 3);
    const h = clamp((r * sharp + broad * (1 - sharp) - 0.28) * 1.75, 0, 1);
    return base - amp * h;
  }

  function put(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < land.w && y < land.h) land.data[y * land.w + x] = color;
  }
  function block(x0, y0, w, h, color) {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(x, y, color);
  }

  function buildLand(W) {
    land.clear(CLEAR);
    windows = []; chimneys = []; flags = []; river = [];
    const { railY, moonX, horizonY } = layout;
    const d = land.data;
    const bottom = layout.groundY;

    // Far range: snow-capped, moonlit faces toward the moon, the rest in blue shade.
    const valleyTop = railY - 32 * k;
    const farBase = valleyTop - 2 * k;
    const farAmp = farBase - horizonY + 48 * k;
    const farTop = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const underMoon = Math.exp(-(((x - moonX) / (layout.moonR * 3.2)) ** 2)) * 0.5;
      farTop[x] = farBase - (farBase - ridge(x, farBase, farAmp, 0.011 / k, 0.72, 3.1)) * (1 - underMoon);
    }
    const slopeAt = x => (farTop[Math.min(W - 1, x + 3)] - farTop[Math.max(0, x - 3)]) / 6;
    for (let x = 0; x < W; x++) {
      const top = Math.round(farTop[x]);
      const slope = slopeAt(x);
      const summit = (farBase - farTop[x]) / farAmp;
      const gully = noise.n1(x * 0.21 / k + 5);
      const snowLine = (summit * 14 - 5 + noise.n1(x * 0.3 / k) * 4 + (gully > 0.62 ? 7 : 0)) * k;
      const litDepth = slope > 0.06 ? (4 + slope * 18) * k : 0;
      const shadeDepth = slope < -0.06 ? (5 - slope * 24) * k : 0;
      for (let y = Math.max(0, top); y < bottom; y++) {
        const depth = y - top;
        let color = c('far1');
        // strata: faint horizontal ledges catch the light on the lit faces
        const ledge = noise.n2(x * 0.05 / k, y * 0.35 / k) > 0.7;
        if (litDepth > 0) {
          const q = 1 - depth / litDepth;
          color = q > bayer(x, y) * 0.9 ? (q > 0.75 ? c('far4') : c('far3')) : ledge ? c('far2') : c('far1');
        } else if (shadeDepth > 0) {
          const q = 1 - depth / shadeDepth;
          if (q > bayer(x, y) * 0.8) color = c('far0');
        } else if (ledge && bayer(x, y) > 0.5) color = c('far2');
        if (summit > 0.32 && depth < snowLine) {
          const edge = depth > snowLine - 3 * k && bayer(x, y) > 0.5;
          if (!edge) {
            if (slope > -0.04) color = depth < 1.5 * k ? c('snow3') : bayer(x, y) > 0.55 ? c('snow2') : c('snow1');
            else color = bayer(x, y) > 0.4 ? c('snow0') : c('far3');
          }
        }
        if (depth === 0) color = summit > 0.32 ? (slope > 0 ? c('snow3') : c('snow1')) : slope > 0 ? c('far4') : c('far2');
        d[y * W + x] = color;
      }
    }
    // Haze pools at the foot of the far range.
    hazeBand(farBase - 6 * k, 14 * k, SHADE.mist, 0.07);

    // Middle ridge, bluer and darker, with the castle on its highest shoulder.
    const midBase = valleyTop + 4 * k;
    const midAmp = 30 * k;
    const midTop = new Float32Array(W);
    for (let x = 0; x < W; x++) midTop[x] = ridge(x, midBase, midAmp, 0.009 / k, 0.35, 11.7);
    for (let x = 0; x < W; x++) {
      const t = Math.round(midTop[x]);
      const slope = (midTop[Math.min(W - 1, x + 2)] - midTop[Math.max(0, x - 2)]) / 4;
      for (let y = Math.max(0, t); y < bottom; y++) {
        const depth = y - t;
        let color = depth > 20 * k ? c('mid0') : c('mid1');
        if (slope > 0.05 && depth < (3 + slope * 12) * k && bayer(x, y) < 1 - depth / ((3 + slope * 12) * k)) color = c('mid3');
        else if (noise.n2(x * 0.08 / k, y * 0.1 / k) > 0.66 && bayer(x, y) > 0.5) color = c('mid2');
        if (depth === 0) color = slope > 0 ? c('mid4') : c('mid2');
        d[y * W + x] = color;
      }
    }
    // tree clumps on the ridge
    for (let x = 0; x < W; x++) {
      if (noise.n1(x * 0.07 / k + 21) < 0.55) continue;
      const h = Math.round((1 + noise.n1(x * 0.5) * 2.5) * k);
      for (let y = 0; y < h; y++) put(x, midTop[x] - y, y === h - 1 && bayer(x, y) > 0.5 ? c('mid2') : c('mid0'));
    }
    const castleX = Math.round(clamp(layout.castleX, 30 * k, W - 30 * k));
    let hill = Infinity;
    for (let x = castleX - 14 * k; x <= castleX + 14 * k; x++) hill = Math.min(hill, midTop[Math.round(clamp(x, 0, W - 1))]);
    drawCastle(castleX, Math.round(hill + 4 * k));

    // The valley floor, fields and hedgerows fading into mist, the river winding through.
    for (let x = 0; x < W; x++) {
      const top = Math.round(Math.max(valleyTop + noise.n1(x * 0.02 / k) * 4 * k, midTop[x] + 4 * k));
      for (let y = top; y < bottom; y++) {
        const t = (y - valleyTop) / (30 * k);
        const field = noise.n2(x * 0.04 / k, y * 0.25 / k);
        let v = 1.4 + t * 1.2 + (field > 0.62 ? 0.8 : field < 0.3 ? -0.6 : 0) + bayer(x, y) - 0.5;
        if (noise.n2(x * 0.3 / k, y * 0.9 / k) > 0.78) v -= 1.2; // hedges and copses
        d[y * W + x] = VALE[clamp(Math.round(v), 0, 4)];
      }
    }
    buildRiver(W, valleyTop);
    buildVillage(Math.round(layout.villageX), valleyTop);

    // The near forest, two rows of pines behind the wall.
    const rows = [
      { base: railY - 4 * k, amp: 3 * k, dark: c('near1'), mid: c('near2'), lit: c('near3'), size: 0.5, seed: 40, gap: 0.55 },
      { base: railY + 4 * k, amp: 4 * k, dark: c('near0'), mid: c('near1'), lit: c('near2'), size: 0.8, seed: 80, gap: 0.35 },
    ];
    for (const row of rows) {
      const top = new Float32Array(W);
      for (let x = 0; x < W; x++) top[x] = row.base - noise.fbm1(x * 0.01 / k + row.seed, 3) * row.amp;
      for (let x = 0; x < W; x++) for (let y = Math.round(top[x]); y < bottom; y++) put(x, y, row.dark);
      for (let x = 0; x < W;) {
        const clump = noise.n1(x * 0.05 / k + row.seed);
        if (clump < row.gap) { x += 2; continue; }
        const h = (6 + random() * 7 + clump * 5) * k * row.size;
        pine(x, top[Math.min(W - 1, x)] + 2 * k, h, row);
        x += Math.max(2, Math.round((2 + random() * 4) * k));
      }
    }
  }

  function pine(x, base, h, row) {
    const tiers = Math.max(2, Math.round(h / (3.5 * k)));
    for (let dy = 0; dy <= h; dy++) {
      const t = dy / h;
      const tier = (t * tiers) % 1;
      const half = Math.floor(t * h * 0.36 + tier * 1.4 * k - (dy < 1 ? 0 : 0));
      const y = Math.round(base - h + dy);
      for (let dx = -half; dx <= half; dx++) {
        let color = row.dark;
        if (dx === half && half > 0) color = row.lit;
        else if (dx > half * 0.35 && tier > 0.45) color = row.mid;
        put(x + dx, y, color);
      }
    }
  }

  function hazeBand(y0, h, lut, freq) {
    const d = land.data, W = land.w;
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(land.h, y0 + h); y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (d[i] === CLEAR) continue;
        const m = 1 - Math.abs(y - (y0 + h / 2)) / (h / 2) + (noise.fbm2(x * freq / k, y * 0.2 / k) - 0.5) * 1.2;
        if (m > bayer(x, y) * 1.2) d[i] = lut[d[i]];
      }
    }
  }

  function buildRiver(W, valleyTop) {
    const { moonX } = layout;
    for (let x = 0; x < W; x++) {
      const y = valleyTop + 12 * k + Math.sin(x * 0.011 / k + 1.3) * 4 * k + Math.sin(x * 0.029 / k) * 2 * k;
      const w = (1.6 + (Math.sin(x * 0.007 / k) + 1) * 1.1) * k;
      for (let yy = 0; yy < w; yy++) {
        const py = Math.round(y + yy);
        const nearMoon = Math.abs(x - moonX) < layout.moonR * 0.9;
        const glitter = nearMoon && bayer(x, py) < 0.45 * (1 - Math.abs(x - moonX) / (layout.moonR * 0.9));
        put(x, py, glitter ? c('cloud5') : yy < 1 ? c('cloud4') : yy < 2 * k && bayer(x, py) > 0.5 ? c('cloud4') : c('cloud3'));
        const pull = 1 - Math.abs(x - moonX) / (layout.moonR * 0.9);
        if ((nearMoon && random() < 0.25 * pull + 0.05) || random() < 0.03) river.push({ x, y: py, phase: random() * 10, moon: nearMoon });
      }
      put(x, Math.round(y + w), c('vale0'));
    }
  }

  function buildVillage(vx, valleyTop) {
    const houses = 7;
    let x = vx - 22 * k;
    for (let i = 0; i < houses; i++) {
      const w = Math.round((4 + random() * 3) * k), h = Math.round((3 + random() * 2) * k);
      const steeple = i === 3;
      const base = Math.round(valleyTop + (9 + Math.sin(i * 1.7) * 2) * k);
      const hh = steeple ? h + 5 * k : h;
      block(x, base - hh, w, hh, c('vale2'));
      block(x + w - Math.max(1, Math.round(k)), base - hh, Math.max(1, Math.round(k)), hh, c('vale4'));
      // roof
      const roofH = Math.round(steeple ? 5 * k : 2.5 * k);
      for (let r = 0; r < roofH; r++) {
        const inset = Math.round(r * (w / 2) / roofH);
        for (let xx = x - 1 + inset; xx <= x + w - inset; xx++) put(xx, base - hh - 1 - r, xx >= x + w / 2 ? c('mid3') : c('near2'));
      }
      if (random() < 0.8) windows.push({ x: x + Math.round(w * 0.35), y: base - Math.round(h * 0.6), phase: random() * 10, speed: 0.3 + random(), off: 0 });
      if (!steeple && random() < 0.6) {
        const cx = x + Math.round(w * 0.7);
        block(cx, base - hh - roofH, Math.max(1, Math.round(k)), roofH, c('near2'));
        chimneys.push({ x: cx, y: base - hh - roofH - 1, seed: random() * 10 });
      }
      x += w + Math.round((1 + random() * 3) * k);
    }
    // orchards and hedges around the houses
    for (let i = 0; i < 16; i++) {
      const tx = vx - 30 * k + random() * 70 * k, ty = valleyTop + (9 + random() * 7) * k;
      const r = (1 + random()) * k;
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) put(tx + xx, ty + yy, yy < 0 && xx > 0 ? c('vale3') : c('vale1'));
    }
  }

  function drawCastle(cx, base) {
    const U = u, dark = c('mid1'), body = c('mid2'), lit = c('mid4'), deep = c('mid0');
    const wall = (x0, y0, w, h) => {
      block(x0, y0, w, h, body);
      block(x0, y0, U, h, deep);
      block(x0 + w - U, y0, U, h, lit);
      if (U > 1) for (let y = y0 + 3; y < y0 + h; y += 3) for (let x = x0 + U; x < x0 + w - U; x++) if ((x + y) % 5 === 0) put(x, y, dark);
    };
    // curtain wall with crenels
    wall(cx - 16 * U, base - 8 * U, 33 * U, 10 * U);
    for (let x = cx - 16 * U; x < cx + 17 * U; x += 3 * U) block(x, base - 9 * U, 2 * U, U, x > cx ? lit : body);
    // towers: [dx, width, height, roof height]
    const towers = [[-18, 6, 16, 7], [-6, 8, 26, 10], [7, 6, 19, 7], [15, 4, 13, 0]];
    for (const [dx, w, h, roof] of towers) {
      const x0 = cx + dx * U, tw = w * U, th = h * U;
      wall(x0, base - th, tw, th);
      if (roof) {
        const rh = roof * U;
        for (let r = 0; r < rh; r++) {
          const half = (tw / 2 + U) * (1 - r / rh);
          const mid = x0 + tw / 2;
          for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) put(x, base - th - 1 - r, x > mid ? c('mid3') : x > mid - half * 0.5 ? dark : deep);
        }
        const tip = base - th - rh - 1;
        for (let y = 0; y < 3 * U; y++) put(x0 + tw / 2, tip - y, dark);
        if (dx === -6) flags.push({ x: Math.round(x0 + tw / 2) + 1, y: tip - 3 * U + 1 });
      } else for (let x = x0; x < x0 + tw; x += 2 * U) block(x, base - th - U, U, U, body);
      for (let wy = base - th + 4 * U; wy < base - 4 * U; wy += 6 * U) {
        if (random() < 0.75) windows.push({ x: Math.round(x0 + tw / 2 - (U > 1 ? 1 : 0)), y: wy, phase: random() * 10, speed: 0.5 + random() * 2, off: 0, tall: true });
      }
    }
    // the gate, lit from inside
    block(cx - 2 * U, base - 5 * U, 4 * U, 5 * U, deep);
    windows.push({ x: cx - U + (U > 1 ? 1 : 0), y: base - 3 * U, phase: 2, speed: 0.7, off: 0 });
  }

  // Fog that drifts along the valley: a mask twice the screen's width, scrolled.
  function buildFog(W) {
    const h = Math.round(14 * k), w = W * 2;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // seamless across the wrap: blend the noise with itself one period over
      const t = x / w;
      const n = noise.fbm2(x * 0.018 / k, y * 0.2 / k, 3) * (1 - t) + noise.fbm2((x - w) * 0.018 / k, y * 0.2 / k, 3) * t;
      const shape = 1 - Math.abs(y - h / 2) / (h / 2);
      mask[y * w + x] = Math.round(clamp((n - 0.42) * 3 * shape, 0, 1) * 255);
    }
    fog = { mask, w, h, y: Math.round(layout.railY - 30 * k), x: 0 };
  }

  // ---- motion -------------------------------------------------------------------------

  function update(dt) {
    for (const cloud of clouds) {
      cloud.x -= cloud.speed * dt;
      if (cloud.x < -cloud.sprite.w - 4) { cloud.x = layout.W + 4 + random() * 40 * k; cloud.y = placeCloudY(); }
    }
    if (fog) fog.x = (fog.x + dt * 2.2 * k) % fog.w;
    for (const w of windows) {
      // now and then someone in the valley puts out a light, and later lights it again
      if (w.off > 0) w.off -= dt;
      else if (random() < dt * 0.004) w.off = 6 + random() * 20;
    }
    if (shooting.active) {
      shooting.age += dt;
      shooting.x += shooting.vx * dt;
      shooting.y += shooting.vy * dt;
      if (shooting.age > shooting.life) shooting.active = false;
    } else if ((shooting.next -= dt) <= 0) launchShootingStar();
    // bats in twos and threes, crossing the sky
    for (const b of bats) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y = b.y0 + Math.sin(b.t * b.wave + b.phase) * 6 * k + Math.sin(b.t * 7 + b.phase) * k;
    }
    for (let i = bats.length - 1; i >= 0; i--) if (bats[i].x < -20 * k || bats[i].x > layout.W + 20 * k) bats.splice(i, 1);
    if ((nextBats -= dt) <= 0) { nextBats = 20 + random() * 30; launchBats(); }
  }

  function launchBats() {
    const { W, horizonY } = layout;
    const dir = random() < 0.5 ? 1 : -1;
    const n = 1 + Math.floor(random() * 3);
    const y0 = horizonY * (0.25 + random() * 0.5);
    for (let i = 0; i < n; i++) {
      bats.push({
        x: dir > 0 ? -10 * k - i * 14 * k : W + 10 * k + i * 14 * k, y0: y0 + (random() - 0.5) * 16 * k, y: y0,
        vx: dir * (28 + random() * 12) * k, t: 0, wave: 1.5 + random(), phase: random() * 6, flap: 9 + random() * 4,
      });
    }
  }

  function launchShootingStar(x, y) {
    const { W, horizonY } = layout;
    Object.assign(shooting, {
      active: true,
      x: x ?? W * (0.1 + random() * 0.8), y: y ?? horizonY * (0.05 + random() * 0.35),
      vx: -(90 + random() * 90) * k * (random() < 0.3 ? -1 : 1), vy: (30 + random() * 40) * k,
      age: 0, life: 0.5 + random() * 0.5, next: 7 + random() * 18,
    });
  }

  // ---- drawing ------------------------------------------------------------------------

  function drawSky(surface, halo = false) { surface.data.set((halo ? skyHalo : sky).data); }

  function drawStars(surface, time, dim = 0) {
    const ramp = [c('star0'), c('star1'), c('star2'), c('star3'), c('star4')];
    const tints = [c('tint0'), c('tint1'), c('tint2')];
    for (const s of stars) {
      const tw = Math.sin(time * s.speed + s.phase);
      let level = s.level + (tw > 0.75 ? 1 : tw < -0.6 ? -1 : 0) - dim;
      if (level <= 0) continue;
      level = Math.min(4, level);
      surface.pset(s.x, s.y, s.tint >= 0 && level >= 2 ? tints[s.tint] : ramp[level]);
      if (s.level === 3 && tw > 0.45) {
        // a four-point glint, and at the fine grid a fainter diagonal cross
        const arm = (tw > 0.85 ? 2 : 1) * u;
        for (let a = 1; a <= arm; a++) {
          const cc = ramp[Math.max(0, level - 1 - Math.floor((a - 1) / u))];
          surface.pset(s.x - a, s.y, cc); surface.pset(s.x + a, s.y, cc);
          surface.pset(s.x, s.y - a, cc); surface.pset(s.x, s.y + a, cc);
        }
        if (u > 1 && tw > 0.8) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) surface.pset(s.x + dx, s.y + dy, ramp[1]);
      }
    }
    if (shooting.active) {
      const t = shooting.age / shooting.life;
      const len = 16 * k * (1 - Math.abs(t - 0.4));
      const speed = Math.hypot(shooting.vx, shooting.vy);
      const ux = shooting.vx / speed, uy = shooting.vy / speed;
      for (let i = 0; i < len; i++) {
        const color = i < 2 * u ? c('star4') : i < len * 0.35 ? c('star3') : i < len * 0.7 ? c('star2') : c('star0');
        surface.pset(shooting.x - ux * i, shooting.y - uy * i, color);
        if (u > 1 && i < len * 0.3) surface.pset(shooting.x - ux * i, shooting.y - uy * i + 1, c('star1'));
      }
    }
  }

  function drawClouds(surface) {
    for (const cloud of clouds) surface.blit(cloud.sprite, cloud.x, cloud.y);
  }

  function drawLand(surface, time) {
    blitRuns(surface, land, landRuns);
    // water: moonlight glitters in the reflection, stray glints elsewhere
    for (const g of river) {
      const f = Math.sin(time * (g.moon ? 3 : 1.4) + g.phase * 7);
      if (g.moon) { if (f > 0.35) surface.pset(g.x, g.y, f > 0.8 ? c('moon6') : c('moon3')); }
      else if (f > 0.93) surface.pset(g.x, g.y, c('cloud6'));
    }
    for (const w of windows) {
      if (w.off > 0) continue;
      const f = Math.sin(time * w.speed + w.phase) + Math.sin(time * w.speed * 2.3 + w.phase * 3) * 0.5;
      surface.pset(w.x, w.y, f > 0.9 ? c('fire6') : f > -0.6 ? c('fire5') : c('fire4'));
      if (w.tall) surface.pset(w.x, w.y + 1, c('fire3'));
      if (u > 1 && w.tall) { surface.pset(w.x + 1, w.y, c('fire4')); surface.pset(w.x + 1, w.y + 1, c('fire2')); }
    }
    // pennants on the keep
    const step = Math.floor(time * 4);
    for (const f of flags) {
      const len = 4 * u;
      for (let i = 0; i < len; i++) {
        const wave = Math.round(Math.sin(i * 0.9 / u - step * 1.3) * 0.6 * u);
        surface.pset(f.x + i, f.y + wave, i < len / 2 ? c('cloak4') : c('cloak3'));
        if (u > 1 && i < len - 2) surface.pset(f.x + i, f.y + wave + 1, c('cloak2'));
      }
    }
    // chimney smoke curls up and leans with the breeze
    for (const ch of chimneys) {
      for (let p = 0; p < 6; p++) {
        const age = ((time * 0.35 + ch.seed + p / 6) % 1);
        const y = ch.y - age * 14 * k;
        const x = ch.x + Math.sin(age * 5 + ch.seed) * k + age * age * 8 * k;
        if (bayer(Math.round(x), Math.round(y)) > age * 1.1) {
          surface.pmap(x, y, SHADE.fog);
          if (u > 1 && age > 0.3) surface.pmap(x + 1, y, SHADE.fog);
        }
      }
    }
    // drifting valley fog
    if (fog) {
      const { mask, w, h } = fog, d = surface.data, W = surface.w, ox = Math.floor(fog.x);
      for (let y = 0; y < h; y++) {
        const sy = fog.y + y;
        if (sy < 0 || sy >= surface.h) continue;
        for (let x = 0; x < W; x++) {
          const m = mask[y * w + ((x + ox) % w)];
          if (m && m / 255 > bayer(x, sy)) { const i = sy * W + x; d[i] = SHADE.fog[d[i]]; }
        }
      }
    }
  }

  function drawBats(surface, time) {
    const frames = BATS[u > 1 ? 2 : 1];
    for (const b of bats) {
      const f = frames[Math.floor(b.t * b.flap) % 2];
      surface.blit(f, b.x - (f.w >> 1), b.y, b.vx < 0);
    }
  }

  return {
    build, update, drawSky, drawStars, drawClouds, drawLand, drawBats, launchShootingStar, launchBats,
    get clouds() { return clouds; },
    get bats() { return bats; },
    get windows() { return windows; },
  };
}

export { LIGHT };
