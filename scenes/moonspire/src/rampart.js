import { Surface, CLEAR, sprite, bayer, createNoise, clamp, lerp } from '../../shared/pixel-engine.js';
import { palette, INK, LIGHT, SHADE } from './palette.js';

const c = name => palette.c(name);
const FIREFLY_LIMIT = 40;

const OWL_KEY = { 1: 'owl1', 2: 'owl2', 3: 'owl3', 4: 'owl4', 5: 'owl5', y: 'gold3', Y: 'gold4', e: 'ink0', n: 'gold1', f: 'gold2' };
const OWL_ROWS = [
  '.1......1.',
  '.21....12.',
  '.22222222.',
  '2244334422',
  '24yY44Yy42',
  '24ey44ye42',
  '2234nn4322',
  '.23455432.',
  '.23545432.',
  '.23454532.',
  '.12333321.',
  '..f....f..',
];
const OWL = sprite(palette, OWL_KEY, OWL_ROWS);
const OWL_BLINK = sprite(palette, OWL_KEY, OWL_ROWS.map((row, i) => (i === 4 ? '2433443342' : i === 5 ? '2422442242' : row)));
const OWL_LEFT = sprite(palette, OWL_KEY, OWL_ROWS.map((row, i) => (i === 4 ? '2yY44Yy442' : i === 5 ? '2ey44ye442' : i === 6 ? '234nn44322' : row)));
const OWL_RIGHT = sprite(palette, OWL_KEY, OWL_ROWS.map((row, i) => (i === 4 ? '244yY44Yy2' : i === 5 ? '244ey44ye2' : i === 6 ? '22344nn432' : row)));

/** The wall-walk: battlements and brickwork (static), the brazier, the owl and the fireflies. */
export function createRampart(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  const wall = new Surface(1, 1);
  const flyer = new Surface(40, 28, CLEAR);
  let layout = null;
  let merlons = [];
  let slits = [];
  const brazier = { x: 0, y: 0, flare: 0, flameStep: -1, flames: new Int8Array(13) };
  const owl = {
    state: 'perch', x: 0, y: 0, perchX: 0, perchY: 0, t: 0, dir: 1,
    blinkIn: 2, look: 0, lookIn: 3, vx: 0, vy: 0, waypoint: 0, path: [], flap: 0, hop: 0,
  };
  const fireflies = [];

  function build(next) {
    layout = next;
    const { W, H, groundY, wizardX, brazierX } = layout;
    wall.resize(W, H);
    wall.clear(CLEAR);
    // Battlements: never in front of the wizard, his staff, or the brazier.
    merlons = [];
    const period = 26, width = 13, height = 13;
    const blocked = (x0, x1) => (x1 > wizardX - 16 && x0 < wizardX + 24) || (x1 > brazierX - 9 && x0 < brazierX + 9);
    for (let x = ((wizardX + 30) % period) - period; x < W + period; x += period) {
      if (!blocked(x, x + width)) merlons.push({ x, w: width, h: height });
    }
    for (const m of merlons) drawMerlon(m, groundY);
    drawFloor(W, H, groundY);
    // The owl sits on the first battlement past the wizard's reach.
    const perch = merlons.find(m => m.x > wizardX + 24) || merlons[merlons.length - 1];
    owl.perchX = perch ? perch.x + Math.floor(perch.w / 2) - 5 : W - 20;
    owl.perchY = groundY - height - OWL.h;
    if (owl.state === 'perch') { owl.x = owl.perchX; owl.y = owl.perchY; }
    brazier.x = brazierX; brazier.y = groundY;
    fireflies.length = 0;
    const count = Math.max(5, Math.round(W / 40));
    for (let k = 0; k < count; k++) {
      fireflies.push({
        x: random() * W, y: groundY - 8 - random() * (groundY * 0.3),
        phase: random() * 10, seed: random() * 100, speed: 4 + random() * 6, glow: 0,
      });
    }
  }

  function brickShade(x, y, x0, y0, id) {
    const n = noise.n2(x * 0.5 + id * 13, y * 0.5);
    const speck = bayer(x * 3 + id, y * 5) > 0.93;
    let color = id % 3 === 0 ? c('stone2') : c('stone3');
    if (n > 0.72) color = palette.lighter[color];
    if (n < 0.22 || speck) color = palette.darker[color];
    if (y === y0) color = palette.lighter[color];
    if (x === x0) color = palette.darker[palette.darker[color]] === c('stone0') ? c('stone1') : palette.darker[color];
    return color;
  }

  function drawMerlon(m, groundY) {
    const top = groundY - m.h;
    for (let y = top; y < groundY; y++) for (let x = m.x; x < m.x + m.w; x++) {
      const ly = y - top, lx = x - m.x;
      const course = Math.floor((ly - 2) / 5);
      const offset = course % 2 ? 6 : 0;
      const brick = Math.floor((lx + offset) / 7);
      const mortarY = ly > 1 && (ly - 2) % 5 === 4;
      const mortarX = ly > 1 && (lx + offset) % 7 === 6;
      let color;
      if (ly === 0) color = lx > m.w - 4 ? c('stone6') : c('stone5');
      else if (ly === 1) color = c('stone4');
      else if (mortarY || mortarX) color = c('stone1');
      else color = brickShade(x, y, m.x, top + 2 + course * 5, course * 5 + brick);
      // lit on the moon side, shadowed on the other
      if (lx === m.w - 1 && ly > 0) color = palette.lighter[color];
      if (lx === 0 && ly > 0) color = c('stone1');
      wall.pset(x, y, color);
    }
    // a little moss on the cap
    for (let x = m.x; x < m.x + m.w; x++) {
      if (noise.n1(x * 0.7 + m.x) > 0.62) {
        wall.pset(x, top, c('moss2'));
        if (noise.n1(x * 1.3) > 0.6) wall.pset(x, top + 1, c('moss1'));
      }
    }
  }

  function drawFloor(W, H, groundY) {
    // The wall-walk slab.
    for (let x = 0; x < W; x++) {
      wall.pset(x, groundY, bayer(x, groundY) > 0.8 ? c('stone6') : c('stone5'));
      wall.pset(x, groundY + 1, c('stone4'));
      wall.pset(x, groundY + 2, x % 19 === 0 ? c('stone2') : c('stone3'));
      wall.pset(x, groundY + 3, c('stone1'));
      if (noise.n1(x * 0.4 + 99) > 0.66) wall.pset(x, groundY, c('moss2'));
      if (noise.n1(x * 0.4 + 99) > 0.74) wall.pset(x, groundY + 1, c('moss1'));
    }
    // Brick courses to the bottom of the screen, fading into the dark.
    const top = groundY + 4;
    slits = [];
    for (let y = top; y < H; y++) {
      const ly = y - top;
      const course = Math.floor(ly / 6);
      const offset = (course % 2) * 8 + ((course * 5) % 3);
      for (let x = 0; x < W; x++) {
        const bx = x + offset;
        const brick = Math.floor(bx / 16);
        const mortar = ly % 6 === 5 || bx % 16 === 15;
        let color = mortar ? c('stone0') : brickShade(x, y, brick * 16 - offset, top + course * 6, course * 31 + brick);
        const mossy = noise.n2(x * 0.08, y * 0.25) > 0.66 && ly < 18;
        if (mossy && !mortar && bayer(x, y) > 0.35) color = noise.n2(x * 0.3, y * 0.3) > 0.5 ? c('moss1') : c('moss0');
        const fade = (y - top) / Math.max(1, H - top);
        if (fade > 0.35 + bayer(x, y) * 0.5) color = SHADE.dim[color];
        wall.pset(x, y, color);
      }
    }
    // Arrow slits glowing with the lamplight inside the tower.
    if (H - top > 22) {
      for (let x = Math.round(W * 0.12); x < W; x += Math.round(clamp(W * 0.37, 90, 160))) {
        if (Math.abs(x - layout.wizardX) < 10) continue;
        const sy = top + 7;
        for (let y = sy; y < sy + 11; y++) {
          wall.pset(x, y, c('stone0'));
          wall.pset(x + 1, y, y < sy + 2 ? c('stone0') : c('fire2'));
          wall.pset(x + 2, y, c('stone0'));
        }
        wall.hline(x - 1, x + 3, sy - 1, c('stone4'));
        slits.push({ x: x + 1, y: sy + 2, h: 8, phase: random() * 6 });
      }
    }
  }

  function startle() {
    if (owl.state !== 'perch') return false;
    owl.state = 'fly';
    owl.t = 0;
    owl.flap = 0;
    const { W, H, moonX, moonY, moonR } = layout;
    const cx = clamp(moonX, 40, W - 40), cy = clamp(moonY, 20, H * 0.4);
    const r = Math.max(moonR + 16, 30);
    owl.path = [
      [owl.x + 10, owl.y - 22],
      [cx - r * 1.1, cy + r * 0.4], [cx, cy - r * 0.9], [cx + r * 1.1, cy + r * 0.2], [cx + r * 0.2, cy + r * 1.05],
      [cx - r * 0.8, cy + r * 0.5],
      [owl.perchX + 30, owl.perchY - 30], [owl.perchX + 1, owl.perchY - 4], [owl.perchX, owl.perchY],
    ];
    owl.waypoint = 0;
    owl.vx = 20; owl.vy = -40;
    return true;
  }

  function update(dt, time, pointer) {
    brazier.flare = Math.max(0, brazier.flare - dt * 0.8);
    // owl
    owl.t += dt;
    if (owl.state === 'perch') {
      owl.blinkIn -= dt;
      if (owl.blinkIn < -0.15) owl.blinkIn = 1.5 + random() * 4;
      owl.lookIn -= dt;
      if (owl.lookIn < 0) { owl.look = [-1, 0, 0, 1][Math.floor(random() * 4)]; owl.lookIn = 1.5 + random() * 3.5; }
      owl.hop = Math.max(0, owl.hop - dt * 4);
    } else if (owl.state === 'fly') {
      const [wx, wy] = owl.path[owl.waypoint];
      const dx = wx - owl.x, dy = wy - owl.y, d = Math.hypot(dx, dy);
      const last = owl.waypoint === owl.path.length - 1;
      const speed = last ? Math.max(12, Math.min(55, d * 3)) : 58;
      const k = 1 - Math.exp(-dt * (last ? 8 : 2.6));
      owl.vx += ((dx / (d || 1)) * speed - owl.vx) * k;
      owl.vy += ((dy / (d || 1)) * speed - owl.vy) * k;
      owl.x += owl.vx * dt; owl.y += owl.vy * dt;
      if (Math.abs(owl.vx) > 4) owl.dir = owl.vx > 0 ? 1 : -1;
      // flap on the climbs, glide on the descents
      owl.flap += dt * (owl.vy < -5 || last ? 9 : owl.vy > 20 ? 0 : 5);
      if (d < (last ? 0.8 : 7)) {
        if (last) { owl.state = 'perch'; owl.x = owl.perchX; owl.y = owl.perchY; owl.hop = 1; owl.look = 0; }
        else owl.waypoint++;
      }
    }
    // fireflies drift, and come a little toward a still pointer
    for (const f of fireflies) {
      f.phase += dt;
      let tx = f.x + (noise.n1(f.seed + f.phase * 0.3) - 0.5) * f.speed * 2 * dt * 10;
      let ty = f.y + (noise.n1(f.seed + 50 + f.phase * 0.3) - 0.5) * f.speed * 1.4 * dt * 10;
      if (pointer.active && Math.hypot(pointer.x - f.x, pointer.y - f.y) < 50) {
        tx += (pointer.x - f.x) * dt * 0.6; ty += (pointer.y - f.y) * dt * 0.6;
      }
      f.x = clamp(tx, 2, layout.W - 2);
      f.y = clamp(ty, layout.groundY * 0.55, layout.groundY - 3);
      const pulse = Math.sin(f.phase * 1.7 + f.seed);
      f.glow = pulse > 0.2 ? (pulse - 0.2) / 0.8 : 0;
    }
  }

  function drawWall(surface) { surface.blit(wall, 0, 0); }

  function drawBrazier(surface, time) {
    const x = Math.round(brazier.x), g = brazier.y;
    // tripod
    surface.line(x - 4, g - 1, x - 2, g - 9, c('iron1'));
    surface.line(x + 4, g - 1, x + 2, g - 9, c('iron2'));
    surface.line(x, g - 1, x, g - 9, c('iron0'));
    surface.pset(x - 5, g - 1, c('iron2')); surface.pset(x + 5, g - 1, c('iron2'));
    // bowl
    for (let k = 0; k < 4; k++) {
      const half = 6 - Math.floor(k * 0.75);
      surface.hline(x - half, x + half, g - 12 + k, k === 0 ? c('iron3') : k === 3 ? c('iron0') : c('iron1'));
      surface.pset(x + half, g - 12 + k, c('iron3'));
      surface.pset(x - half, g - 12 + k, c('iron0'));
    }
    // flames at the sprite clock
    const step = Math.floor(time * 12);
    if (step !== brazier.flameStep) {
      brazier.flameStep = step;
      for (let k = 0; k < 13; k++) {
        const col = k - 6;
        const base = Math.max(0, 7 - Math.abs(col) * 1.1);
        const n = noise.n2(col * 0.55, step * 0.45);
        brazier.flames[k] = Math.round(base * (0.55 + n * 0.8) + brazier.flare * (9 - Math.abs(col)) * 0.9);
      }
    }
    for (let k = 1; k < 12; k++) {
      const h = brazier.flames[k];
      const col = k - 6;
      for (let yy = 0; yy < h; yy++) {
        const f = yy / Math.max(1, h);
        const lean = Math.round(Math.sin(step * 0.9 + yy * 0.5 + col) * f * 1.2);
        const color = f < 0.2 ? c('fire5') : f < 0.45 ? c('fire4') : f < 0.72 ? c('fire3') : c('fire2');
        surface.pset(x + col + lean, g - 13 - yy, color);
      }
    }
    // coals
    for (let k = -5; k <= 5; k++) surface.pset(x + k, g - 12, (k + step) % 3 === 0 ? c('fire4') : c('fire2'));
  }

  function drawSlits(surface, time) {
    for (const s of slits) {
      const f = Math.sin(time * 3 + s.phase) + Math.sin(time * 7.3 + s.phase * 2) * 0.5;
      for (let y = 0; y < s.h; y++) surface.pset(s.x, s.y + y, y < 2 ? c('fire2') : f > 0.8 ? c('fire4') : c('fire3'));
    }
  }

  function drawOwl(surface, time) {
    if (owl.state === 'perch') {
      const blink = owl.blinkIn < 0;
      const img = blink ? OWL_BLINK : owl.look < 0 ? OWL_LEFT : owl.look > 0 ? OWL_RIGHT : OWL;
      surface.blit(img, Math.round(owl.x), Math.round(owl.y - owl.hop));
      return;
    }
    // In flight: body and head, with wings drawn at the flap angle, then outlined.
    flyer.clear(CLEAR);
    const cx = 20, cy = 14, d = owl.dir;
    const phase = Math.floor(owl.flap * 3) % 4; // 0 up, 1 mid, 2 down, 3 mid
    const wingY = [-7, -2, 4, -2][phase];
    const wingX = [9, 11, 9, 11][phase];
    for (const side of [-1, 1]) {
      const tip = side * wingX;
      flyer.thick(cx + side * 2, cy - 1, cx + tip * 0.55, cy - 1 + wingY * 0.6, 3.2, side === d ? c('owl3') : c('owl2'));
      flyer.line(cx + tip * 0.55, cy - 1 + wingY * 0.6, cx + tip, cy + wingY, side === d ? c('owl3') : c('owl2'));
      flyer.line(cx + tip * 0.55, cy + wingY * 0.6, cx + tip * 0.9, cy + 1 + wingY, c('owl1'));
    }
    flyer.ellipse(cx, cy + 1, 3, 3, c('owl3'));
    flyer.pset(cx, cy + 2, c('owl5')); flyer.pset(cx, cy + 3, c('owl4'));
    flyer.disc(cx + d, cy - 3, 2, c('owl2'));
    flyer.pset(cx + d * 2, cy - 3, c('gold3'));
    flyer.pset(cx, cy - 3, c('gold3'));
    flyer.pset(cx + d * 3, cy - 2, c('gold1'));
    flyer.pset(cx - 1, cy + 5, c('owl2')); flyer.pset(cx + 1, cy + 5, c('owl2'));
    flyer.outline(INK);
    surface.blit(flyer, Math.round(owl.x) + 5 - cx, Math.round(owl.y) + 6 - cy);
  }

  function drawFireflies(surface) {
    for (const f of fireflies) {
      if (f.glow <= 0) continue;
      surface.glow(f.x, f.y, 4, LIGHT.firefly, f.glow);
      surface.pset(f.x, f.y, f.glow > 0.5 ? c('green4') : c('green3'));
    }
  }

  function lightFire(surface, time) {
    const flick = 0.75 + Math.sin(time * 9) * 0.06 + Math.sin(time * 23) * 0.05 + brazier.flare * 0.5;
    surface.glow(brazier.x, brazier.y - 14, 34 + brazier.flare * 14, LIGHT.fire, flick);
    for (const s of slits) surface.glow(s.x, s.y + 4, 7, LIGHT.fire, 0.5 + Math.sin(time * 3 + s.phase) * 0.1);
  }

  return {
    build, update, drawWall, drawBrazier, drawSlits, drawOwl, drawFireflies, lightFire, startle,
    brazier, owl,
    flare() { brazier.flare = 1; return true; },
    addFirefly(x, y) {
      if (!layout || fireflies.length >= FIREFLY_LIMIT) return false;
      fireflies.push({
        x: x ?? random() * layout.W, y: clamp(y ?? layout.groundY - 12, layout.groundY * 0.55, layout.groundY - 3),
        phase: 0, seed: random() * 100, speed: 4 + random() * 6, glow: 0,
      });
      return true;
    },
    containsOwl(x, y) {
      return owl.state === 'perch' && x >= owl.x - 2 && x <= owl.x + OWL.w + 2 && y >= owl.y - 2 && y <= owl.y + OWL.h + 1;
    },
    containsBrazier(x, y) { return Math.abs(x - brazier.x) < 8 && y > brazier.y - 24 && y < brazier.y + 1; },
    fireIntensity(time) { return 0.55 + Math.sin(time * 9) * 0.08 + brazier.flare * 0.4; },
  };
}
