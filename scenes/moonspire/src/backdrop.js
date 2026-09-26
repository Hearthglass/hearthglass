import { Surface, CLEAR, bayer, createNoise, clamp } from '../../shared/pixel-engine.js';
import { palette, LIGHT, SHADE } from './palette.js';

const c = name => palette.c(name);
const SKY = palette.ramp('sky');

/** The sky, its stars and the land below the horizon, rebuilt when the screen size changes. */
export function createBackdrop(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  const sky = new Surface(1, 1);
  const land = new Surface(1, 1);
  let stars = [];
  let clouds = [];
  let windows = [];
  const shooting = { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, next: 6 };
  let layout = null;

  function build(next) {
    layout = next;
    const { W, H, horizonY } = layout;
    sky.resize(W, H);
    land.resize(W, H);
    buildSky(W, H, horizonY);
    buildLand(W, H);
    buildStars(W, H, horizonY);
    buildClouds(W, H);
  }

  function buildSky(W, H, horizonY) {
    const d = sky.data;
    const bottom = horizonY + 6;
    for (let y = 0; y < H; y++) {
      const t = clamp(y / bottom, 0, 1);
      const p = Math.pow(t, 1.25) * (SKY.length - 1);
      for (let x = 0; x < W; x++) {
        // A faint horizontal wave keeps the bands from reading as ruled lines.
        const wobble = (noise.n1(x * 0.03 + y * 0.07) - 0.5) * 0.5;
        const q = clamp(p + wobble, 0, SKY.length - 1);
        let k = Math.floor(q);
        if (q - k > bayer(x, y)) k = Math.min(SKY.length - 1, k + 1);
        d[y * W + x] = SKY[k];
      }
    }
    // The Milky Way: a diagonal band of brighter, grainy sky with a darker dust lane.
    const ax = W * 0.05, ay = horizonY * 0.95, bx = W * 0.95, by = -H * 0.15;
    const lx = bx - ax, ly = by - ay, len = Math.hypot(lx, ly);
    const width = Math.max(16, H * 0.14);
    for (let y = 0; y < horizonY; y++) {
      for (let x = 0; x < W; x++) {
        const along = ((x - ax) * lx + (y - ay) * ly) / len;
        const across = ((x - ax) * -ly + (y - ay) * lx) / len;
        const bend = Math.sin(along * 0.012) * width * 0.35;
        const dist = (across - bend) / width;
        let band = Math.exp(-dist * dist * 2.2);
        const grain = noise.fbm2(x * 0.08, y * 0.08, 3);
        band *= 0.35 + grain * 0.95;
        // A dark rift runs along the middle, like the real thing.
        const rift = Math.exp(-Math.pow((dist + 0.08) / 0.12, 2)) * (noise.fbm2(x * 0.05 + 7, y * 0.05, 3) > 0.45 ? 0.7 : 0.2);
        band -= rift;
        const fade = clamp((horizonY - y) / (horizonY * 0.35), 0, 1);
        band *= fade;
        const i = y * W + x;
        if (band > 0.25 + bayer(x, y) * 0.35) d[i] = palette.lighter[d[i]];
        if (band > 0.62 + bayer(x + 2, y + 1) * 0.3) d[i] = palette.lighter[d[i]];
        if (band > 0.35 && random() < band * 0.05) d[i] = random() < 0.25 ? c('star1') : c('star0');
      }
    }
    // Dim, still background stars across the whole sky.
    const count = Math.round(W * horizonY / 90);
    for (let n = 0; n < count; n++) {
      const x = Math.floor(random() * W), y = Math.floor(random() * horizonY * 0.98);
      d[y * W + x] = random() < 0.2 ? c('star1') : c('star0');
    }
  }

  // Ridged multi-octave noise: sharp peaks and saddles rather than rolling hills.
  function ridge(x, base, amp, scale, sharp, seed) {
    let r = 0, a = 0.5, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      const v = 1 - Math.abs(2 * noise.n1(x * scale * f + seed + o * 17.3) - 1);
      r += v * v * a; norm += a; a *= 0.5; f *= 2.13;
    }
    r /= norm;
    const broad = noise.fbm1(x * scale * 0.3 + seed * 2.7, 3);
    const h = clamp((r * sharp + broad * (1 - sharp) - 0.28) * 1.75, 0, 1);
    return base - amp * h;
  }

  function buildLand(W, H) {
    land.clear(CLEAR);
    const { horizonY, groundY } = layout;
    const d = land.data;
    const farBase = horizonY + (groundY - horizonY) * 0.25;
    const farAmp = (groundY - horizonY) * 0.55 + H * 0.16;
    const farTop = new Float32Array(W);
    for (let x = 0; x < W; x++) farTop[x] = ridge(x, farBase, farAmp, 0.018, 0.7, 3.1);
    // Far range: faces turned to the moon (right) catch light, the others fall into shade;
    // both fade into the body of the mountain with dither, snow on the high summits.
    const slopeAt = x => (farTop[Math.min(W - 1, x + 3)] - farTop[Math.max(0, x - 3)]) / 6;
    for (let x = 0; x < W; x++) {
      const top = Math.round(farTop[x]);
      const slope = slopeAt(x);
      const summit = (farBase - farTop[x]) / farAmp;
      const snowLine = summit * 10 - 3 + noise.n1(x * 0.35) * 3;
      const litDepth = slope > 0.08 ? 3 + slope * 16 : 0;
      const shadeDepth = slope < -0.08 ? 4 - slope * 22 : 0;
      for (let y = Math.max(0, top); y < groundY; y++) {
        const depth = y - top;
        let color = c('far1');
        if (litDepth > 0) {
          const k = 1 - depth / litDepth;
          if (k > bayer(x, y) * 0.9) color = c('far2');
        } else if (shadeDepth > 0 && depth > 0) {
          const k = 1 - depth / shadeDepth;
          if (k > bayer(x, y) * 0.8) color = c('far0');
        }
        if (summit > 0.4 && depth < snowLine) {
          const edge = depth > snowLine - 2 && bayer(x, y) > 0.5;
          if (!edge) color = slope > -0.05 ? (depth < 2 || bayer(x, y) > 0.3 ? c('haze2') : c('haze1')) : (bayer(x, y) > 0.4 ? c('haze0') : c('far2'));
        }
        if (depth === 0 && slope > 0) color = summit > 0.4 ? c('star1') : c('far2');
        d[y * W + x] = color;
      }
    }
    // Valley mist between the ranges.
    const mistY = farBase + farAmp * 0.1;
    for (let y = Math.round(mistY - 10); y < groundY; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (d[i] === CLEAR) continue;
        const m = 1 - Math.abs(y - mistY) / 10 + (noise.fbm2(x * 0.05, y * 0.2) - 0.5);
        if (m > bayer(x, y) * 1.2) d[i] = SHADE.mist[d[i]];
      }
    }
    // A castle on the far range, windows lit.
    windows = [];
    const castleX = Math.round(clamp(layout.castleX, 30, W - 30));
    const hill = Math.round(Math.min(farTop[castleX - 12] ?? farBase, farTop[castleX] ?? farBase, farTop[castleX + 12] ?? farBase));
    drawCastle(castleX, hill + 3);
    // Near range with a forest crest.
    const nearBase = groundY - (groundY - horizonY) * 0.12;
    const nearAmp = (groundY - horizonY) * 0.35 + H * 0.04;
    const nearTop = new Float32Array(W);
    for (let x = 0; x < W; x++) nearTop[x] = ridge(x, nearBase, nearAmp, 0.014, 0.3, 11.7);
    for (let x = 0; x < W; x++) {
      const t = Math.round(nearTop[x]);
      for (let y = Math.max(0, t); y < groundY; y++) d[y * W + x] = y - t < 1 ? c('near1') : c('near0');
    }
    // Pines along the crest, in clumps: narrow triangles with a moonlit right edge.
    for (let x = 0; x < W;) {
      const clump = noise.n1(x * 0.06 + 40);
      if (clump < 0.42) { x += 2; continue; }
      const h = 4 + Math.round(random() * 5 + clump * 3);
      const base = Math.round(nearTop[Math.min(W - 1, x)]) + 1;
      for (let dy = 0; dy <= h; dy++) {
        const half = Math.floor(dy * 0.42 + (dy % 3 === 2 ? 0.6 : 0));
        const y = base - h + dy;
        for (let dx = -half; dx <= half; dx++) {
          const px = x + dx;
          if (px < 0 || px >= W || y < 0) continue;
          d[y * W + px] = dx === half && dy > 1 && half > 0 ? c('near2') : c('near1');
        }
      }
      x += 2 + Math.floor(random() * 4);
    }
  }

  function drawCastle(cx, base) {
    const d = land.data, W = land.w;
    const put = (x, y, color) => { if (x >= 0 && y >= 0 && x < W && y < land.h) d[y * W + x] = color; };
    const block = (x0, y0, w, h, color) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, color); };
    const dark = c('near1'), lit = c('near2');
    // curtain wall
    block(cx - 13, base - 7, 27, 9, dark);
    for (let x = cx - 13; x < cx + 14; x += 3) put(x, base - 8, dark);
    // towers: [dx, width, height, roof]
    const towers = [[-14, 5, 14, 5], [-4, 7, 22, 7], [8, 5, 16, 5], [14, 3, 11, 0]];
    for (const [dx, w, h, roof] of towers) {
      const x0 = cx + dx;
      block(x0, base - h, w, h, dark);
      for (let x = x0 + 1; x < x0 + w - 1; x++) put(x, base - h, lit);
      if (roof) {
        for (let k = 0; k < roof; k++) block(x0 - 1 + Math.ceil(k * 0.5), base - h - 1 - k, w + 2 - Math.ceil(k * 0.5) * 2, 1, k === 0 ? dark : dark);
        put(x0 + (w >> 1), base - h - roof - 1, dark);
        put(x0 + (w >> 1), base - h - roof - 2, dark);
      } else for (let x = x0; x < x0 + w; x += 2) put(x, base - h - 1, dark);
      // lit windows
      for (let wy = base - h + 3; wy < base - 3; wy += 5) {
        const wx = x0 + (w >> 1);
        if (random() < 0.7) windows.push({ x: wx, y: wy, phase: random() * 10, speed: 0.5 + random() * 2 });
      }
    }
    windows.push({ x: cx - 8, y: base - 4, phase: 1, speed: 1.3 }, { x: cx + 2, y: base - 4, phase: 3, speed: 0.8 });
  }

  function buildStars(W, H, horizonY) {
    stars = [];
    const count = Math.round(W * horizonY / 130);
    for (let n = 0; n < count; n++) {
      const bright = random();
      stars.push({
        x: Math.floor(random() * W), y: Math.floor(random() * horizonY * 0.92),
        level: bright < 0.08 ? 3 : bright < 0.3 ? 2 : 1,
        phase: random() * Math.PI * 2, speed: 0.6 + random() * 2.2,
      });
    }
  }

  // A moonlit cloud: puffy lit top, flat shadowed underside, dithered wisps trailing off.
  function makeCloud(w, h) {
    const s = new Surface(w, h, CLEAR);
    const seed = random() * 100;
    const core = h - 3;
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const env = Math.pow(Math.sin(Math.PI * u), 0.7);
      const bumps = 0.45 + 0.55 * noise.n1(x * 0.16 + seed) + 0.25 * Math.max(0, Math.sin(x * 0.35 + seed));
      const top = Math.round(core - (core - 1) * env * Math.min(1, bumps));
      const bottom = core + (env > 0.35 ? 2 : env > 0.15 ? 1 : 0);
      for (let y = top; y <= bottom; y++) {
        const d = y - top;
        let color;
        if (d === 0) color = env > 0.45 ? c('haze2') : c('haze1');
        else if (d === 1) color = bayer(x, y) > 0.35 ? c('haze1') : c('haze0');
        else if (d <= 3) color = bayer(x, y) > 0.5 ? c('haze0') : c('sky8');
        else color = bayer(x, y) > 0.6 ? c('sky7') : c('sky6');
        if (y >= bottom - 1 && d > 1) color = bayer(x, y) > 0.5 ? c('sky6') : c('sky5');
        // feathered ends
        if (env < 0.28 && bayer(x, y) > env * 3.2) continue;
        s.data[y * w + x] = color;
      }
    }
    // loose wisps under and beside the body
    for (let k = 0; k < 2; k++) {
      const y = h - 1 - k, x0 = Math.floor(random() * w * 0.3), x1 = Math.floor(w * (0.6 + random() * 0.4));
      for (let x = x0; x < x1; x++) if (bayer(x, y + k) > 0.45 && s.data[y * w + x] === CLEAR) s.data[y * w + x] = c('sky6');
    }
    return s;
  }

  function buildClouds(W, H) {
    clouds = [];
    const n = Math.max(3, Math.round(W / 90));
    for (let k = 0; k < n; k++) {
      const w = 40 + Math.floor(random() * 60), h = 8 + Math.floor(random() * 7);
      clouds.push({
        sprite: makeCloud(w, h),
        x: random() * (W + w) - w,
        y: H * 0.06 + random() * layout.horizonY * 0.55,
        speed: 1.2 + random() * 2.6,
      });
    }
  }

  function update(dt, time) {
    for (const cloud of clouds) {
      cloud.x -= cloud.speed * dt;
      if (cloud.x < -cloud.sprite.w - 4) {
        cloud.x = layout.W + 4 + random() * 40;
        cloud.y = layout.H * 0.06 + random() * layout.horizonY * 0.55;
      }
    }
    if (shooting.active) {
      shooting.age += dt;
      shooting.x += shooting.vx * dt;
      shooting.y += shooting.vy * dt;
      if (shooting.age > shooting.life) shooting.active = false;
    } else if ((shooting.next -= dt) <= 0) {
      launchShootingStar();
    }
  }

  function launchShootingStar(x, y) {
    const { W, horizonY } = layout;
    Object.assign(shooting, {
      active: true,
      x: x ?? W * (0.2 + random() * 0.7), y: y ?? horizonY * (0.05 + random() * 0.35),
      vx: -(90 + random() * 90) * (random() < 0.3 ? -1 : 1), vy: 30 + random() * 40,
      age: 0, life: 0.5 + random() * 0.5, next: 7 + random() * 18,
    });
  }

  function drawSky(surface) { surface.data.set(sky.data); }

  function drawStars(surface, time, dim = 0) {
    const ramp = [c('star0'), c('star1'), c('star2'), c('star3')];
    for (const s of stars) {
      const tw = Math.sin(time * s.speed + s.phase);
      let level = s.level + (tw > 0.75 ? 1 : tw < -0.6 ? -1 : 0) - dim;
      if (level <= 0) continue;
      level = Math.min(3, level);
      const color = ramp[level];
      surface.pset(s.x, s.y, color);
      if (s.level === 3 && tw > 0.55) {
        const arm = tw > 0.9 ? 2 : 1;
        for (let k = 1; k <= arm; k++) {
          const cc = ramp[Math.max(0, level - k)];
          surface.pset(s.x - k, s.y, cc); surface.pset(s.x + k, s.y, cc);
          surface.pset(s.x, s.y - k, cc); surface.pset(s.x, s.y + k, cc);
        }
      }
    }
    if (shooting.active) {
      const t = shooting.age / shooting.life;
      const len = 14 * (1 - Math.abs(t - 0.4));
      const speed = Math.hypot(shooting.vx, shooting.vy);
      const ux = shooting.vx / speed, uy = shooting.vy / speed;
      for (let k = 0; k < len; k++) {
        const color = k < 2 ? c('star3') : k < len * 0.4 ? c('star2') : k < len * 0.75 ? c('star1') : c('star0');
        surface.pset(shooting.x - ux * k, shooting.y - uy * k, color);
      }
    }
  }

  function drawClouds(surface) {
    for (const cloud of clouds) surface.blit(cloud.sprite, cloud.x, cloud.y);
  }

  function drawLand(surface, time) {
    surface.blit(land, 0, 0);
    for (const w of windows) {
      const f = Math.sin(time * w.speed + w.phase) + Math.sin(time * w.speed * 2.3 + w.phase * 3) * 0.5;
      surface.pset(w.x, w.y, f > 0.9 ? c('fire5') : f > -0.6 ? c('fire4') : c('fire3'));
      surface.pset(w.x, w.y + 1, c('fire2'));
    }
  }

  return {
    build, update, drawSky, drawStars, drawClouds, drawLand, launchShootingStar,
    get clouds() { return clouds; },
  };
}

export { LIGHT };
