import { Surface, CLEAR, sprite, bayer, createNoise, clamp, opaqueRuns, blitRuns } from '../../shared/pixel-engine.js';
import { palette, INK, LIGHT, SHADE } from './palette.js';

const c = name => palette.c(name);
const STONE = palette.ramp('stone');
const VERD = palette.ramp('verd');
const BRASS = palette.ramp('brass');
const WOOD = palette.ramp('wood');
const MOSS = palette.ramp('moss');
const FIREFLY_LIMIT = 40;
const POTIONS = ['cyan', 'green', 'pink'];

// The coarse-grid owl, for Eco.
const OWL_KEY = { 1: 'owl0', 2: 'owl1', 3: 'owl2', 4: 'owl3', 5: 'owl4', y: 'gold3', Y: 'gold4', e: 'ink0', n: 'gold1', f: 'gold2' };
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
const OWL_COARSE = {
  still: sprite(palette, OWL_KEY, OWL_ROWS),
  blink: sprite(palette, OWL_KEY, OWL_ROWS.map((row, i) => (i === 4 ? '2433443342' : i === 5 ? '2422442242' : row))),
  left: sprite(palette, OWL_KEY, OWL_ROWS.map((row, i) => (i === 4 ? '2yY44Yy442' : i === 5 ? '2ey44ye442' : i === 6 ? '234nn44322' : row))),
  right: sprite(palette, OWL_KEY, OWL_ROWS.map((row, i) => (i === 4 ? '244yY44Yy2' : i === 5 ? '244ey44ye2' : i === 6 ? '22344nn432' : row))),
};

// The fine-grid owl: a tawny owl with ear tufts, facial discs and a streaked breast.
function makeOwl(look, blink) {
  const s = new Surface(21, 26, CLEAR);
  const O = i => c(`owl${i}`);
  const shadeBody = (cx, rx, y0, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (s.data[i] !== O(2)) continue;
      const nx = (x - cx) / rx;
      if (nx < -0.55) s.data[i] = O(1);
      else if (nx > 0.62) s.data[i] = O(3);
    }
  };
  s.ellipse(10, 16, 7, 8, O(2));
  shadeBody(10, 7, 8, 24);
  s.ellipse(10, 18, 4, 5, O(4));
  for (let y = 14; y <= 22; y++) for (let x = 6; x <= 14; x++) {
    const i = y * s.w + x;
    if (s.data[i] !== O(4)) continue;
    if ((x + (y >> 1)) % 3 === 0 && y % 2 === 0) s.data[i] = O(3);
    if (y > 20 && (x + y) % 2) s.data[i] = O(5);
  }
  for (let y = 12; y <= 21; y += 3) { s.pset(4, y, O(3)); s.pset(5, y + 1, O(3)); s.pset(16, y, O(0)); s.pset(15, y + 1, O(1)); }
  s.ellipse(10, 8, 7, 5, O(2));
  shadeBody(10, 7, 3, 12);
  s.poly([3, 6, 4, 0, 8, 4], O(2)); s.poly([17, 6, 16, 0, 12, 4], O(2));
  s.pset(4, 1, O(1)); s.pset(16, 1, O(3));
  s.disc(7, 8, 3, O(3)); s.disc(13, 8, 3, O(3));
  s.disc(7, 8, 2, O(4)); s.disc(13, 8, 2, O(4));
  s.pset(10, 6, O(1)); s.pset(9, 5, O(1)); s.pset(11, 5, O(1));
  if (blink) {
    s.hline(5, 9, 8, O(1)); s.hline(11, 15, 8, O(1));
    s.hline(6, 8, 9, O(3)); s.hline(12, 14, 9, O(3));
  } else {
    for (const ex of [7, 13]) {
      s.disc(ex, 8, 1.5, c('gold3'));
      s.pset(ex + 1, 7, c('gold4'));
      s.rect(ex + look - (look < 0 ? 0 : 0), 8, 1, 2, INK);
      s.pset(ex + look + (look >= 0 ? -1 : 1), 8, INK);
      s.pset(ex - 1, 7, c('star4'));
    }
  }
  s.pset(10, 10, c('gold2')); s.pset(10, 11, c('gold1')); s.pset(9, 10, c('gold1'));
  s.hline(7, 9, 24, c('gold2')); s.hline(11, 13, 24, c('gold2'));
  s.pset(7, 24, c('gold3')); s.pset(11, 24, c('gold3'));
  s.outline(INK);
  return s;
}
const OWL_FINE = { still: makeOwl(0, false), blink: makeOwl(0, true), left: makeOwl(-1, false), right: makeOwl(1, false) };

/**
 * The top of the wizard's observatory tower: a copper-domed turret, the balustrade and
 * floor, the tower face below with its lit oculus, and the things he keeps up here (a
 * brass telescope on the moon, an orrery, books, potions, a lantern and a brazier), plus
 * the owl and the fireflies. The stonework is baked on resize; the rest moves.
 */
export function createObservatory(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  const wall = new Surface(1, 1);
  let wallRuns = new Int32Array(0);
  const flyer = new Surface(1, 1);
  let layout = null, k = 1, u = 1;
  let posts = [], slits = [], potions = [];
  const S = v => Math.round(v * k);
  const brazier = { x: 0, y: 0, flare: 0, flameStep: -1, flames: new Int8Array(25) };
  const owl = {
    state: 'perch', x: 0, y: 0, perchX: 0, perchY: 0, t: 0, dir: 1,
    blinkIn: 2, look: 0, lookIn: 3, vx: 0, vy: 0, waypoint: 0, path: [], flap: 0, hop: 0,
  };
  const turret = { on: false, cx: 0, r: 0, top: 0, x1: 0, doorX: 0, windowY: 0 };
  const lantern = { on: false, x: 0, y: 0, angle: 0, swing: 0, sprite: null };
  const scope = { on: false, x: 0, y: 0, angle: 0, glint: 0 };
  const orrery = { on: false, x: 0, y: 0, spin: 0, speed: 0 };
  const books = { on: false, x: 0, y: 0, candleX: 0, candleY: 0 };
  const oculus = { on: false, x: 0, y: 0, r: 0 };
  const moths = [];
  const fireflies = [];

  function build(next) {
    layout = next;
    ({ k, u } = layout);
    const { W, H, groundY } = layout;
    wall.resize(W, H);
    wall.clear(CLEAR);
    flyer.resize(40 * u, 28 * u, CLEAR);
    placeThings();
    drawBalustrade();
    drawFloor();
    drawFront();
    if (turret.on) drawTurret();
    if (scope.on) drawTelescope();
    if (orrery.on) drawPedestal();
    if (books.on) drawBooksAndPotions();
    wallRuns = opaqueRuns(wall);
    brazier.x = layout.brazierX; brazier.y = groundY;
    // The owl sits on the first post past the orrery (or the telescope).
    const beyond = orrery.on ? orrery.x + S(16) : scope.on ? scope.x + S(24) : layout.wizardX + S(30);
    const perch = posts.find(p => p.x > beyond && p.x < W - S(8)) || posts[posts.length - 1];
    const owlImg = owlSprites().still;
    owl.perchX = perch ? perch.x + Math.floor(perch.w / 2) - Math.floor(owlImg.w / 2) : W - S(20);
    owl.perchY = (perch ? perch.top : layout.railY) - owlImg.h + (u > 1 ? 2 : 0);
    if (owl.state === 'perch') { owl.x = owl.perchX; owl.y = owl.perchY; } else owl.state = 'perch';
    owl.x = owl.perchX; owl.y = owl.perchY;
    fireflies.length = 0;
    const count = Math.max(5, Math.round(W / (40 * k)));
    for (let i = 0; i < count; i++) {
      fireflies.push({ x: random() * W, y: groundY - S(8) - random() * (groundY * 0.3), phase: random() * 10, seed: random() * 100, speed: (4 + random() * 6) * k, glow: 0 });
    }
    moths.length = 0;
    if (lantern.on) for (let i = 0; i < 2; i++) moths.push({ a: random() * 6, r: S(6 + random() * 6), speed: 2 + random() * 2, seed: random() * 10, x: 0, y: 0 });
  }

  const owlSprites = () => (u > 1 ? OWL_FINE : OWL_COARSE);

  function placeThings() {
    const { W, groundY, wizardX, moonX, moonY } = layout;
    // A turret needs room to the wizard's left; it stands half off the screen's edge.
    turret.r = S(34);
    turret.x1 = Math.round(wizardX - S(72));
    turret.on = W > layout.H * 1.05 && turret.x1 > S(26);
    turret.cx = turret.x1 - turret.r;
    turret.top = groundY - S(96);
    turret.doorX = Math.round(turret.cx + turret.r * 0.42);
    turret.windowY = groundY - S(52);
    lantern.on = turret.on;
    lantern.x = turret.x1 + S(9); lantern.y = groundY - S(50);
    lantern.sprite = makeLantern();
    books.on = turret.on;
    books.x = turret.x1 + S(21); books.y = groundY - 1;
    scope.x = Math.round(wizardX + S(62)); scope.y = groundY - S(28);
    scope.on = scope.x + S(26) < W;
    scope.angle = Math.atan2(moonY - scope.y, moonX - scope.x);
    orrery.x = Math.round(wizardX + S(104)); orrery.y = groundY - S(21);
    orrery.on = orrery.x + S(20) < W && orrery.x < moonX + layout.moonR * 3;
    oculus.r = S(9);
    oculus.x = Math.round(clamp(W * 0.62, wizardX + S(40), W - S(20)));
    oculus.y = groundY + S(20);
    oculus.on = layout.H - groundY > S(34) && oculus.x < W - S(12);
  }

  // ---- stonework --------------------------------------------------------------------

  /** A dressed stone: noisy, with a lit right edge and top, a shaded bottom, chips and cracks. */
  function stoneShade(x, y, x0, y0, x1, y1, id, base) {
    const n = noise.n2(x * 0.35 / k + id * 13, y * 0.35 / k);
    let v = base + (n - 0.5) * 2.2 + ((id * 7) % 5 - 2) * 0.3;
    if (y - y0 < k) v += 1.2;
    if (x1 - x < k) v += 0.8;
    if (y1 - y < k) v -= 1;
    if (x - x0 < k * 0.6) v -= 0.6;
    if (bayer(x * 3 + id, y * 5) > 0.95) v -= 1.5; // pits
    return STONE[clamp(Math.round(v + bayer(x, y) - 0.5), 1, 9)];
  }

  function crackAt(x, y, len) {
    let a = Math.PI / 2 + (random() - 0.5);
    for (let i = 0; i < len; i++) {
      wall.pset(x, y, STONE[1]);
      if (u > 1) wall.pmap(x + 1, y, palette.lighter);
      a += (random() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
    }
  }

  function drawBalustrade() {
    const { W, railY, floorBack } = layout;
    const start = turret.on ? turret.x1 - S(4) : 0;
    const P = S(38), pw = S(7);
    posts = [];
    for (let x = start + S(10); x < W + P; x += P) posts.push({ x, w: pw, top: railY - S(3) });
    const railH = S(3.5), plinthY = floorBack - S(3);
    // balusters: turned stone, lit on the moon side
    const step = S(4.5), bw = 2.6 * k;
    for (let bx = start; bx < W; bx += step) {
      if (posts.some(p => bx + bw >= p.x - S(1) && bx - bw <= p.x + p.w + S(1))) continue;
      for (let y = railY + railH; y < plinthY; y++) {
        const t = (y - railY - railH) / (plinthY - railY - railH);
        const bulge = 0.45 + 0.55 * Math.sin(clamp((t - 0.25) / 0.7, 0, 1) * Math.PI) - (t < 0.12 ? 0.15 : 0);
        const half = Math.max(0.6, bw * bulge);
        for (let x = Math.round(bx - half); x <= Math.round(bx + half); x++) {
          const q = (x - bx) / half;
          const v = 4.5 + q * 2.3 + (t > 0.9 ? -1 : 0);
          wall.pset(x, y, STONE[clamp(Math.round(v + bayer(x, y) - 0.5), 1, 8)]);
        }
      }
    }
    // posts with capstones
    for (const p of posts) {
      for (let y = p.top; y < floorBack; y++) for (let x = p.x; x < p.x + p.w; x++) {
        let v = stoneShade(x, y, p.x, p.top, p.x + p.w - 1, floorBack, p.x, 4.6);
        if (y < p.top + S(2.5)) v = x > p.x + p.w - S(2.5) ? STONE[8] : STONE[7];
        wall.pset(x, y, v);
      }
      for (let x = p.x - S(1); x < p.x + p.w + S(1); x++) {
        wall.pset(x, p.top - 1, x > p.x + p.w - S(2) ? STONE[9] : STONE[8]);
        if (u > 1) wall.pset(x, p.top - 2, STONE[7]);
      }
    }
    // the rail: a lit top, a plain face and a dark underside
    for (let x = start; x < W; x++) {
      for (let y = railY; y < railY + railH; y++) {
        const d = y - railY;
        let v = d === 0 ? 8 : d < k ? 7 : d >= railH - k * 0.8 ? 3 : 5 + (noise.n2(x * 0.3 / k, y * 0.3 / k) > 0.6 ? 1 : 0);
        if (x % S(22) === 0 && d > 0) v = 3;
        wall.pset(x, y, STONE[v]);
      }
      // the plinth the balusters stand on
      for (let y = plinthY; y < floorBack; y++) wall.pset(x, y, STONE[y === plinthY ? 7 : 4]);
    }
    // ivy spilling over the rail in a few places
    for (let n = 0; n < Math.max(2, Math.round(W / (160 * k))); n++) {
      const x = start + random() * (W - start);
      if (Math.abs(x - layout.wizardX) < S(20)) continue;
      ivy(x, railY, S(10 + random() * 18), S(12 + random() * 14));
    }
  }

  /** A clump of ivy: leaves heaped along a ledge, trailing strands hanging down. */
  function ivy(x0, y0, width, hang) {
    const leaf = (x, y, lit) => {
      x = Math.round(x); y = Math.round(y);
      const col = lit ? MOSS[4] : MOSS[2];
      wall.pset(x, y, col);
      if (u > 1) { wall.pset(x + 1, y, lit ? MOSS[3] : MOSS[1]); wall.pset(x, y + 1, MOSS[1]); wall.pset(x + 1, y + 1, MOSS[0]); }
    };
    for (let i = 0; i < width * 1.6; i++) {
      const x = x0 + random() * width, y = y0 - random() * S(2) + random() * S(3);
      leaf(x, y, random() < 0.45);
    }
    const strands = 2 + Math.floor(random() * 3);
    for (let s = 0; s < strands; s++) {
      let x = x0 + random() * width, y = y0 + S(2);
      const len = hang * (0.5 + random() * 0.6);
      for (let i = 0; i < len; i++) {
        wall.pset(x, y, MOSS[0]);
        if (i % Math.max(2, S(2)) === 0) leaf(x + (random() < 0.5 ? -1 : 1) * k, y, random() < 0.3);
        y += 1; x += Math.sin(i * 0.3 + s) * 0.3;
      }
    }
  }

  function drawFloor() {
    const { W, groundY, floorBack } = layout;
    // Flagstones in shallow perspective: joints lean out from the middle of the screen.
    const depth = groundY - floorBack;
    const rows = [0, Math.round(depth * 0.45), depth];
    for (let r = 0; r < 2; r++) {
      const y0 = floorBack + rows[r], y1 = floorBack + rows[r + 1];
      const len = S(r ? 26 : 20), off = r * S(11);
      for (let y = y0; y < y1; y++) {
        const t = (y - floorBack) / depth;
        for (let x = 0; x < W; x++) {
          const px = x + (x - W / 2) * -0.06 * t;
          const slab = Math.floor((px + off) / len);
          const joint = ((px + off) % len + len) % len < 1 || y === y0;
          let v = 5 + t * 0.8 + (noise.n2(slab * 3.1, r * 7 + x * 0.12 / k) - 0.5) * 1.6;
          if (joint) v = 3;
          if (y === y0 && r === 0) v = 2;
          const i = y * W + x;
          wall.data[i] = STONE[clamp(Math.round(v + bayer(x, y) - 0.5), 1, 8)];
          if (joint && noise.n2(x * 0.2 / k, y * 0.5) > 0.66) wall.data[i] = MOSS[1];
        }
      }
    }
    // The cornice: a bright lip, a moulded face, and a row of dentils in its shadow.
    const face = S(3);
    for (let x = 0; x < W; x++) {
      wall.pset(x, groundY, bayer(x, groundY) > 0.75 ? STONE[9] : STONE[8]);
      for (let y = 1; y <= face; y++) wall.pset(x, groundY + y, STONE[y === 1 ? 7 : y === face ? 4 : 6]);
      for (let y = face + 1; y <= face + S(3); y++) wall.pset(x, groundY + y, STONE[1]);
      if (noise.n1(x * 0.3 / k + 99) > 0.7) wall.pset(x, groundY, MOSS[3]);
    }
    const dent = S(3), gap = S(2.5);
    for (let x = 0; x < W; x += dent + gap) {
      for (let y = face + 1; y <= face + S(2.5); y++) for (let dx = 0; dx < dent; dx++) {
        wall.pset(x + dx, groundY + y, STONE[dx === dent - 1 ? 6 : y === face + 1 ? 3 : 5]);
      }
    }
  }

  function drawFront() {
    const { W, H, groundY } = layout;
    const top = groundY + S(7);
    const courseH = S(7);
    slits = [];
    for (let y = top; y < H; y++) {
      const ly = y - top, course = Math.floor(ly / courseH);
      const cy0 = top + course * courseH;
      let x = -((course * 37) % 17) * k;
      let id = course * 101;
      while (x < W) {
        const len = S(12 + noise.n1(id * 0.73) * 12);
        const x1 = x + len;
        for (let px = Math.max(0, Math.round(x)); px < Math.min(W, Math.round(x1)); px++) {
          const mortar = y === cy0 + courseH - 1 || px === Math.round(x1) - 1;
          let color = mortar ? STONE[0] : stoneShade(px, y, x, cy0, x1 - 1, cy0 + courseH - 1, id, 4.4);
          // rain has run down from the cornice in dark streaks
          const streak = noise.n1(px * 0.35 / k + 40) > 0.72 && ly < S(18) * noise.n1(px * 0.2 / k + 3) * 1.6;
          if (streak && !mortar && bayer(px, y) > 0.35 + ly / S(40)) color = palette.darker[color];
          if (course === 0 && !mortar && y === cy0 && noise.n1(px * 0.3 / k + 7) > 0.78) color = MOSS[2];
          // the wall falls away into the dark
          const fade = ly / Math.max(1, H - top);
          if (fade > 0.25 + bayer(px, y) * 0.45) color = SHADE.dim[color];
          if (fade > 0.6 + bayer(px + 2, y) * 0.35) color = SHADE.deep[color];
          wall.data[y * W + px] = color;
        }
        if (y === cy0 && random() < 0.04) crackAt(x + len * 0.5, cy0 + 1, S(4 + random() * 5));
        x = x1; id++;
      }
    }
    // a shadow cast by the cornice
    for (let y = top; y < top + S(3); y++) for (let x = 0; x < W; x++) if (bayer(x, y) > (y - top) / S(3)) wall.pmap(x, y, SHADE.shadow);
    if (oculus.on) drawOculus();
    // arrow slits glowing with lamplight inside
    if (H - top > S(24)) {
      for (let x = Math.round(W * 0.1); x < W; x += Math.round(clamp(W * 0.33, 90 * k, 170 * k))) {
        if (Math.abs(x - layout.wizardX) < S(12) || (oculus.on && Math.abs(x - oculus.x) < S(20))) continue;
        const sy = top + S(8), h = S(12), w = Math.max(1, S(1));
        for (let y = sy - S(1); y < sy + h + S(1); y++) for (let dx = -S(1); dx <= w; dx++) wall.pset(x + dx, y, STONE[1]);
        for (let y = sy; y < sy + h; y++) for (let dx = 0; dx < w; dx++) wall.pset(x + dx, y, c('fire2'));
        for (let dx = -S(2); dx <= w + S(1); dx++) wall.pset(x + dx, sy - S(1) - 1, STONE[7]);
        slits.push({ x, y: sy + S(2), w, h: h - S(2), phase: random() * 6 });
      }
    }
  }

  function drawOculus() {
    const { x, y, r } = oculus;
    // voussoirs around a round window, the light inside behind a cross of lead
    const outer = r + S(3.5);
    for (let dy = -outer; dy <= outer; dy++) for (let dx = -outer; dx <= outer; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > outer + 0.5) continue;
      let color;
      if (d > r + 0.5) {
        const a = Math.atan2(dy, dx), seg = Math.floor((a + Math.PI) / (Math.PI / 6));
        const edge = Math.abs(((a + Math.PI) % (Math.PI / 6)) - Math.PI / 12) > Math.PI / 12 - 0.12 / k;
        color = edge ? STONE[1] : STONE[clamp(Math.round(5 + (dx / outer) * 2 - (dy / outer) + (seg % 2) * 0.6), 2, 9)];
      } else if (d > r - k * 0.8) color = c('iron1');
      else if (Math.abs(dx) < k * 0.6 || Math.abs(dy) < k * 0.6) color = c('iron0');
      else color = d < r * 0.5 ? c('fire5') : dx + dy < 0 ? c('fire4') : c('fire3');
      wall.pset(x + dx, y + dy, color);
    }
  }

  function drawTurret() {
    const { groundY, floorBack } = layout;
    const { cx, r, top } = turret;
    const courseH = S(7);
    // the drum: a lit cylinder of curved courses
    for (let x = Math.max(0, Math.round(cx - r)); x <= turret.x1; x++) {
      const nx = clamp((x - cx) / r, -1, 1), nz = Math.sqrt(1 - nx * nx);
      const light = nx * 0.75 + nz * 0.35;
      const curve = nz * S(2.5);
      for (let y = top; y <= groundY; y++) {
        const ly = y - top - curve;
        const course = Math.floor(ly / courseH);
        const theta = Math.asin(nx) + course * 0.19;
        const block = Math.floor(theta / 0.3);
        const jointX = Math.abs((theta / 0.3) - Math.round(theta / 0.3)) * r * 0.3 * nz < 0.55;
        const jointY = ((ly % courseH) + courseH) % courseH < 1;
        let v = 3.6 + light * 3 + (noise.n2(block * 5.3, course * 3.7) - 0.5) * 1.6;
        if (jointX || jointY) v -= 2;
        if (((ly % courseH) + courseH) % courseH < 2 && !jointY) v += 0.6;
        if (x === turret.x1) v = 8;
        let color = STONE[clamp(Math.round(v + bayer(x, y) - 0.5), 1, 9)];
        if (y > groundY - S(10) && noise.n2(x * 0.15 / k, y * 0.2 / k) > 0.62 + (groundY - y) / S(20) && bayer(x, y) > 0.3) color = MOSS[light > 0.4 ? 2 : 1];
        wall.pset(x, y, color);
      }
    }
    // the cornice ring under the dome
    for (let x = Math.max(0, Math.round(cx - r - S(3))); x <= turret.x1 + S(3); x++) {
      const nx = clamp((x - cx) / (r + S(3)), -1, 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx));
      const light = nx * 0.75 + nz * 0.35;
      for (let y = 0; y < S(5); y++) {
        const yy = top - S(4) + y + Math.round(nz * S(2.5));
        const v = y === 0 ? 8 : y < S(2) ? 5 + light * 3 : y === S(5) - 1 ? 2 : 4 + light * 2.5;
        wall.pset(x, yy, STONE[clamp(Math.round(v + bayer(x, yy) - 0.5), 1, 9)]);
      }
    }
    drawDome();
    // the door: planks under a stone arch, lamplight in the gap below
    const dw = S(15), dh = S(28), dx0 = turret.doorX - (dw >> 1), dTop = groundY - dh;
    const arch = dw / 2;
    for (let y = dTop - S(3); y <= groundY; y++) for (let x = dx0 - S(3); x <= dx0 + dw + S(3); x++) {
      const ax = x - (dx0 + dw / 2), ay = y - (dTop + arch);
      const inArch = ay > 0 ? Math.abs(ax) <= arch : Math.hypot(ax, ay) <= arch;
      const inSurround = ay > 0 ? Math.abs(ax) <= arch + S(3) : Math.hypot(ax, ay) <= arch + S(3);
      if (!inSurround) continue;
      let color;
      if (!inArch) {
        const a = Math.atan2(ay, ax), seg = Math.floor(a / 0.4);
        color = ay > 0 ? STONE[ax > 0 ? 7 : 5] : STONE[seg % 2 ? 6 : 7];
        if (ay <= 0 && Math.abs((a / 0.4) - Math.round(a / 0.4)) < 0.12) color = STONE[2];
      } else {
        const plank = Math.floor((x - dx0) / S(3.5));
        const seam = (x - dx0) % S(3.5) === 0;
        color = seam ? WOOD[1] : WOOD[clamp(3 + (plank % 2) + (ax > arch * 0.4 ? 1 : 0) + (bayer(x, y) > 0.8 ? -1 : 0), 1, 6)];
        const band = Math.abs(y - (dTop + dh * 0.35)) < k * 0.8 || Math.abs(y - (dTop + dh * 0.78)) < k * 0.8;
        if (band) color = (x + y) % S(4) === 0 ? c('iron4') : c('iron2');
        if (y >= groundY - Math.max(1, S(0.6))) color = c('fire4');
      }
      wall.pset(x, y, color);
    }
    // ring handle
    const hx = dx0 + dw - S(4), hy = dTop + Math.round(dh * 0.58);
    wall.ring(hx, hy, S(1.5), c('iron3'));
    wall.pset(hx, hy - S(1.5), c('iron4'));
    // a round window above the door
    const wr = S(5);
    for (let y = -wr - S(2); y <= wr + S(2); y++) for (let x = -wr - S(2); x <= wr + S(2); x++) {
      const d = Math.hypot(x, y);
      if (d > wr + S(2) + 0.4) continue;
      const color = d > wr + 0.4 ? STONE[x + y > 0 ? 7 : 5] : Math.abs(x) < k * 0.6 || Math.abs(y) < k * 0.6 ? c('iron0') : d < wr * 0.5 ? c('fire5') : c('fire4');
      wall.pset(turret.doorX + x, turret.windowY + y, color);
    }
    // lantern bracket
    const by = lantern.y - S(2);
    wall.line(turret.x1, by, lantern.x + S(1), by, c('iron2'));
    wall.line(turret.x1, by + S(4), turret.x1 + S(5), by, c('iron1'));
    if (u > 1) wall.line(turret.x1, by - 1, lantern.x + S(1), by - 1, c('iron3'));
    wall.pset(lantern.x + S(1), by + 1, c('iron3'));
    // ivy climbing the turret's lit side
    let x = turret.x1 - S(4), y = groundY;
    for (let i = 0; i < S(70); i++) {
      wall.pset(x, y, MOSS[0]);
      if (i % Math.max(2, S(2.2)) === 0) {
        for (const side of [-1, 1]) if (random() < 0.8) {
          const lx = Math.round(x + side * S(1.5)), ly = Math.round(y);
          wall.pset(lx, ly, side > 0 ? MOSS[4] : MOSS[2]);
          if (u > 1) { wall.pset(lx + side, ly, MOSS[3]); wall.pset(lx, ly - 1, MOSS[2]); }
        }
      }
      y -= 1; x += Math.sin(i * 0.08) * 0.35 - 0.05;
    }
    void floorBack;
  }

  function drawDome() {
    const { cx, r, top } = turret;
    const rx = r + S(1), ry = S(30);
    const base = top - S(4);
    const slitA = 0.28, slitW = 0.1;
    for (let y = base - ry; y <= base; y++) for (let x = Math.max(0, Math.round(cx - rx)); x <= Math.round(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - base) / ry;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz = Math.sqrt(1 - q);
      const light = nx * 0.6 - ny * 0.55 + nz * 0.4;
      // meridian ribs at fixed longitudes
      const lon = Math.asin(clamp(nx / Math.sqrt(Math.max(0.0001, 1 - ny * ny)), -1, 1));
      const rib = Math.abs(lon / 0.35 - Math.round(lon / 0.35)) < 0.09;
      const slit = Math.abs(lon - slitA) < slitW && ny > -0.93;
      let color;
      if (slit) {
        const edge = Math.abs(lon - slitA) > slitW - 0.03;
        color = edge ? VERD[4] : ny > -0.2 ? c('ink0') : c('sky1');
      } else {
        let v = 0.6 + light * 2.8 + (noise.n2(x * 0.2 / k, y * 0.2 / k) - 0.5) * 0.8;
        if (rib) v += light > 0.4 ? 1.1 : -1;
        if (q > 0.9) v -= 0.8;
        color = VERD[clamp(Math.round(v + bayer(x, y) - 0.5), 0, 5)];
        // copper streaks where rain has run
        if (!rib && noise.n2(x * 0.5 / k, y * 0.05 / k) > 0.74) color = VERD[clamp(Math.round(v) - 1, 0, 5)];
      }
      wall.pset(x, y, color);
    }
    // finial: a brass spire with a star on top
    const fx = Math.round(cx), fy = base - ry;
    for (let y = 0; y < S(9); y++) {
      const half = y < S(3) ? S(1.2) : 0;
      for (let x = -half; x <= half; x++) wall.pset(fx + x, fy - y, x > 0 ? BRASS[4] : BRASS[2]);
    }
    const sy = fy - S(11);
    wall.pset(fx, sy, c('gold5'));
    for (let a = 1; a <= S(2); a++) {
      const col = a > S(1) ? c('gold3') : c('gold4');
      wall.pset(fx - a, sy, col); wall.pset(fx + a, sy, col); wall.pset(fx, sy - a, col); wall.pset(fx, sy + a, col);
    }
  }

  function drawTelescope() {
    const { groundY, floorBack } = layout;
    const hx = scope.x, hy = scope.y;
    // tripod: two front legs and one back, brass-shod feet
    const legs = [[-S(11), groundY - 1, WOOD[3]], [S(10), groundY - 1, WOOD[5]], [S(2), floorBack + S(1), WOOD[2]]];
    for (const [dx, fy, col] of legs) {
      wall.thick(hx, hy + S(2), hx + dx, fy, Math.max(1, k * 1.3), col);
      if (u > 1) wall.line(hx + 1, hy + S(2), hx + dx + 1, fy, palette.lighter[col]);
      wall.pset(hx + dx, fy, BRASS[3]);
    }
    // the mount
    wall.disc(hx, hy + S(1), S(2.2), BRASS[1]);
    wall.disc(hx, hy + S(1), S(1.4), BRASS[3]);
    // the tube, tapering from the dew shield to the eyepiece, lit along its upper side
    const ux = Math.cos(scope.angle), uy = Math.sin(scope.angle), nx = -uy, ny = ux;
    const front = S(30), back = S(13);
    for (let t = -back; t <= front; t += 0.5) {
      const f = (t + back) / (front + back);
      let rad = (2 + f * 1.4) * k;
      if (t > front - S(6)) rad += k * 0.8;
      const band = [0.12, 0.45, 0.8].some(b => Math.abs(f - b) < 0.02);
      for (let s = -rad; s <= rad; s += 0.5) {
        const q = s / rad;
        const lit = -q * Math.sign(ny || 1);
        let v = 2 + lit * 1.6;
        if (band) v += 1;
        if (t > front - S(6)) v -= 0.7;
        wall.pset(hx + ux * t + nx * s, hy + uy * t + ny * s, BRASS[clamp(Math.round(v), 0, 4)]);
      }
    }
    // lens, eyepiece and focuser
    const lx = hx + ux * front, ly = hy + uy * front;
    wall.pset(lx, ly, c('cyan3')); wall.pset(lx - nx * k, ly - ny * k, c('cyan4'));
    const ex = hx - ux * back, ey = hy - uy * back;
    wall.thick(ex, ey, ex - ux * S(4), ey - uy * S(4), Math.max(1, S(1.8)), c('iron2'));
    wall.pset(ex - ux * S(4), ey - uy * S(4), c('iron4'));
    wall.disc(hx - ux * S(6) + nx * S(3), hy - uy * S(6) + ny * S(3), S(1), BRASS[3]);
    scope.lensX = lx; scope.lensY = ly;
  }

  function drawPedestal() {
    const { groundY } = layout;
    const x = orrery.x;
    const parts = [
      [S(7), S(2.5), groundY - S(2.5)], // base
      [S(4), S(13), groundY - S(15.5)], // shaft
      [S(6.5), S(2.5), groundY - S(18)], // capital
    ];
    for (const [half, h, y0] of parts) {
      for (let y = y0; y < y0 + h; y++) for (let dx = -half; dx <= half; dx++) {
        const q = dx / half;
        let v = 4.8 + q * 2.6 + (y === y0 ? 1.4 : 0) + (y === y0 + h - 1 ? -1.2 : 0);
        if (half === S(4) && Math.abs(dx) % S(2.5) === 0 && dx !== 0) v -= 1; // fluting
        wall.pset(x + dx, y, STONE[clamp(Math.round(v + bayer(x + dx, y) - 0.5), 1, 9)]);
      }
    }
    // the orrery's brass stem and foot
    wall.rect(x - S(3), groundY - S(19), S(6), S(1), BRASS[2]);
    wall.hline(x - S(3), x + S(3), groundY - S(19) - 1, BRASS[4]);
    for (let y = groundY - S(28); y < groundY - S(19); y++) { wall.pset(x, y, BRASS[3]); if (u > 1) wall.pset(x - 1, y, BRASS[1]); }
  }

  function drawBooksAndPotions() {
    const { groundY } = layout;
    // a stack of books, the candle on top
    const specs = [[S(15), S(3.5), c('book1'), c('book3')], [S(13), S(3), c('robe2'), c('robe4')], [S(14), S(3.5), c('wood3'), c('wood5')], [S(11), S(3), c('violet1'), c('violet2')]];
    let y = groundY;
    let x = books.x;
    for (const [w, h, dark, light] of specs) {
      const x0 = x + Math.round((random() - 0.5) * 2 * k);
      for (let yy = y - h; yy < y; yy++) for (let xx = x0; xx < x0 + w; xx++) {
        const edge = xx >= x0 + w - S(2); // the page edges face us on the right
        let color = edge ? (yy === y - h ? c('paper3') : (yy % 2 ? c('paper1') : c('paper2'))) : yy === y - h ? light : dark;
        if (!edge && xx === x0 + S(2)) color = c('gold3'); // gilt band on the spine
        wall.pset(xx, yy, color);
      }
      y -= h;
      x = x0;
    }
    books.candleX = x + S(6); books.candleY = y;
    // candle: a stub with wax run down one side
    for (let yy = y - S(6); yy < y; yy++) for (let dx = -S(1.5); dx <= S(1.5); dx++) {
      wall.pset(books.candleX + dx, yy, dx > 0 ? c('paper3') : dx < 0 ? c('paper1') : c('paper2'));
    }
    wall.pset(books.candleX - S(1.5), y - S(3), c('paper3'));
    wall.pset(books.candleX, y - S(6) - 1, c('ink0'));
    books.candleTop = y - S(6) - 1;
    // a small crate of potions beside them
    const cx = turret.x1 + S(2), cw = S(16), ch = S(8), cy = groundY - ch;
    for (let yy = cy; yy < groundY; yy++) for (let xx = cx; xx < cx + cw; xx++) {
      const plank = Math.floor((yy - cy) / S(2.7));
      let color = WOOD[3 + (plank % 2)];
      if ((yy - cy) % S(2.7) === 0) color = WOOD[1];
      if (xx < cx + S(1.5) || xx >= cx + cw - S(1.5)) color = xx < cx + S(1.5) ? WOOD[2] : WOOD[5];
      wall.pset(xx, yy, color);
    }
    potions = [];
    const shapes = [[S(4), 'round'], [S(10), 'tall'], [S(14), 'vial']];
    shapes.forEach(([dx, kind], i) => {
      const color = POTIONS[i];
      const R = palette.ramp(color);
      const px = cx + dx, base = cy;
      if (kind === 'round') {
        const r = S(3);
        wall.disc(px, base - r, r, R[1]);
        for (let dy = -r; dy <= r; dy++) for (let ddx = -r; ddx <= r; ddx++) {
          if (ddx * ddx + dy * dy > (r + 0.5) ** 2) continue;
          if (dy > -r * 0.2) wall.pset(px + ddx, base - r + dy, ddx > r * 0.3 ? R[3] : R[2]);
        }
        wall.rect(px - S(0.8), base - 2 * r - S(3), Math.max(1, S(1.6)), S(3), c('cloud4'));
        wall.pset(px, base - 2 * r - S(3) - 1, WOOD[5]);
        wall.pset(px - S(1.5), base - r - S(1.5), c('star4'));
        potions.push({ x: px, y: base - r, color, r });
      } else if (kind === 'tall') {
        const w = S(2.5), h = S(10);
        for (let yy = base - h; yy < base; yy++) for (let ddx = -w; ddx <= w; ddx++) {
          const liquid = yy > base - h * 0.7;
          wall.pset(px + ddx, yy, liquid ? (ddx > w * 0.3 ? R[3] : R[2]) : c('cloud3'));
        }
        wall.rect(px - S(1), base - h - S(3), Math.max(1, S(2)), S(3), c('cloud4'));
        wall.rect(px - S(1), base - h - S(3) - Math.max(1, S(1)), Math.max(1, S(2)), Math.max(1, S(1)), WOOD[4]);
        wall.vline(px - w + S(1), base - h + S(1), base - S(2), c('star3'));
        potions.push({ x: px, y: base - h * 0.4, color, r: w });
      } else {
        const w = S(1.5), h = S(6);
        for (let yy = base - h; yy < base; yy++) for (let ddx = -w; ddx <= w; ddx++) wall.pset(px + ddx, yy, yy > base - h * 0.6 ? R[3] : c('cloud3'));
        wall.pset(px, base - h - 1, WOOD[5]);
        potions.push({ x: px, y: base - h * 0.3, color, r: w });
      }
    });
  }

  function makeLantern() {
    const w = S(8) | 1, h = S(13);
    const s = new Surface(w + 2, h + S(6), CLEAR);
    const cx = (s.w - 1) / 2;
    // chain
    for (let y = 0; y < S(4); y++) s.pset(cx, y, y % 2 ? c('iron1') : c('iron3'));
    const top = S(4);
    // cap
    for (let y = 0; y < S(3); y++) { const half = Math.round((y + 1) * (w / 2) / S(3)); s.hline(cx - half, cx + half, top + y, y === 0 ? c('iron3') : c('iron2')); }
    // glass with the flame's light, framed in iron
    const g0 = top + S(3), g1 = top + S(3) + S(7);
    for (let y = g0; y < g1; y++) for (let x = 1; x < s.w - 1; x++) {
      const frame = x === 1 || x === s.w - 2 || Math.abs(x - cx) < 0.6;
      const t = (y - g0) / (g1 - g0);
      s.pset(x, y, frame ? (x === s.w - 2 ? c('iron3') : c('iron1')) : t > 0.3 && t < 0.8 && Math.abs(x - cx) < w * 0.3 ? c('fire6') : c('fire5'));
    }
    s.hline(1, s.w - 2, g1, c('iron2'));
    s.hline(2, s.w - 3, g1 + 1, c('iron1'));
    s.pset(cx, g1 + 2, c('iron2'));
    s.outline(INK);
    return s;
  }

  // ---- behaviour ----------------------------------------------------------------------

  function startle() {
    if (owl.state !== 'perch') return false;
    owl.state = 'fly';
    owl.t = 0;
    owl.flap = 0;
    const { W, H, moonX, moonY, moonR } = layout;
    const cx = clamp(moonX, S(40), W - S(40)), cy = clamp(moonY, S(20), H * 0.4);
    const r = Math.max(moonR + S(16), S(30));
    owl.path = [
      [owl.x + S(10), owl.y - S(22)],
      [cx - r * 1.1, cy + r * 0.4], [cx, cy - r * 0.9], [cx + r * 1.1, cy + r * 0.2], [cx + r * 0.2, cy + r * 1.05],
      [cx - r * 0.8, cy + r * 0.5],
      [owl.perchX + S(30), owl.perchY - S(30)], [owl.perchX + S(1), owl.perchY - S(4)], [owl.perchX, owl.perchY],
    ];
    owl.waypoint = 0;
    owl.vx = S(20); owl.vy = -S(40);
    return true;
  }

  function update(dt, time, pointer) {
    brazier.flare = Math.max(0, brazier.flare - dt * 0.8);
    orrery.speed = Math.max(0.25, orrery.speed - dt * 1.4);
    orrery.spin += orrery.speed * dt;
    lantern.swing *= Math.exp(-dt * 0.9);
    lantern.angle = Math.sin(time * 2.6) * lantern.swing + Math.sin(time * 1.1) * 0.035;
    scope.glint = Math.max(0, scope.glint - dt);
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
      const speed = last ? Math.max(S(12), Math.min(S(55), d * 3)) : S(58);
      const q = 1 - Math.exp(-dt * (last ? 8 : 2.6));
      owl.vx += ((dx / (d || 1)) * speed - owl.vx) * q;
      owl.vy += ((dy / (d || 1)) * speed - owl.vy) * q;
      owl.x += owl.vx * dt; owl.y += owl.vy * dt;
      if (Math.abs(owl.vx) > 4 * k) owl.dir = owl.vx > 0 ? 1 : -1;
      owl.flap += dt * (owl.vy < -5 * k || last ? 9 : owl.vy > 20 * k ? 0 : 5);
      if (d < (last ? 0.8 * k : 7 * k)) {
        if (last) { owl.state = 'perch'; owl.x = owl.perchX; owl.y = owl.perchY; owl.hop = 1; owl.look = 0; }
        else owl.waypoint++;
      }
    }
    for (const f of fireflies) {
      f.phase += dt;
      let tx = f.x + (noise.n1(f.seed + f.phase * 0.3) - 0.5) * f.speed * 2 * dt * 10;
      let ty = f.y + (noise.n1(f.seed + 50 + f.phase * 0.3) - 0.5) * f.speed * 1.4 * dt * 10;
      if (pointer.active && Math.hypot(pointer.x - f.x, pointer.y - f.y) < S(50)) {
        tx += (pointer.x - f.x) * dt * 0.6; ty += (pointer.y - f.y) * dt * 0.6;
      }
      f.x = clamp(tx, 2, layout.W - 2);
      f.y = clamp(ty, layout.groundY * 0.55, layout.groundY - 3 * k);
      const pulse = Math.sin(f.phase * 1.7 + f.seed);
      f.glow = pulse > 0.2 ? (pulse - 0.2) / 0.8 : 0;
    }
    const lp = lanternPoint();
    for (const m of moths) {
      m.a += dt * m.speed;
      m.x = lp.x + Math.cos(m.a) * m.r + Math.sin(time * 7 + m.seed) * 2 * k;
      m.y = lp.y + Math.sin(m.a * 1.3) * m.r * 0.6 + Math.cos(time * 9 + m.seed) * k;
    }
  }

  /** The lantern's flame, where it hangs at the current swing. */
  function lanternPoint() {
    const d = S(11);
    return { x: lantern.x + Math.sin(-lantern.angle) * d, y: lantern.y + Math.cos(lantern.angle) * d };
  }

  // ---- per-frame drawing -----------------------------------------------------------------

  function drawWall(surface) { blitRuns(surface, wall, wallRuns); }

  function drawLights(surface, time) {
    for (const s of slits) {
      const f = Math.sin(time * 3 + s.phase) + Math.sin(time * 7.3 + s.phase * 2) * 0.5;
      for (let y = 0; y < s.h; y++) for (let dx = 0; dx < s.w; dx++) surface.pset(s.x + dx, s.y + y, y < S(2) ? c('fire3') : f > 0.8 ? c('fire5') : c('fire4'));
    }
    if (oculus.on) {
      const f = Math.sin(time * 2.1) + Math.sin(time * 5.7) * 0.4;
      if (f > 0.9) surface.pset(oculus.x - S(2), oculus.y - S(2), c('fire6'));
    }
  }

  function drawProps(surface, time) {
    if (orrery.on) drawOrrery(surface);
    if (books.on) {
      // candle flame, two frames of flicker
      const step = Math.floor(time * 10);
      const lean = (step % 5 === 0 ? 1 : 0) * Math.max(1, Math.round(k * 0.6));
      const fx = books.candleX, fy = books.candleTop - 1;
      const h = S(3) + (step % 3 === 0 ? 1 : 0);
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const half = t < 0.6 && u > 1 ? 1 : 0;
        for (let dx = -half; dx <= half; dx++) surface.pset(fx + dx + (t > 0.5 ? lean : 0), fy - y, t < 0.35 ? c('fire6') : dx ? c('fire4') : c('fire5'));
      }
      for (const p of potions) {
        // now and then a bubble climbs through the potion
        const b = (time * 0.6 + p.x * 0.13) % 1;
        if (b < 0.5) surface.pset(p.x + Math.round(Math.sin(b * 20) * 0.5 * k), p.y + p.r - b * p.r * 2.4, c(`${p.color}4`));
      }
    }
    if (lantern.on) {
      const s = lantern.sprite;
      surface.blitRotated(s, lantern.x, lantern.y, (s.w - 1) / 2, 0, lantern.angle);
      for (const m of moths) {
        surface.pset(m.x, m.y, c('paper3'));
        if (u > 1) surface.pset(m.x + (Math.floor(time * 20 + m.seed) % 2 ? 1 : -1), m.y, c('paper1'));
      }
    }
    if (scope.on && scope.glint > 0) {
      const r = Math.round(scope.glint * 3 * u);
      for (let a = 0; a <= r; a++) {
        surface.pset(scope.lensX + a, scope.lensY, c('star4')); surface.pset(scope.lensX - a, scope.lensY, c('star4'));
        surface.pset(scope.lensX, scope.lensY + a, c('star4')); surface.pset(scope.lensX, scope.lensY - a, c('star4'));
      }
    }
  }

  function drawOrrery(surface) {
    const cx = orrery.x, cy = layout.groundY - S(33);
    const rings = [
      { rx: S(13), ry: S(4), speed: 0.7, planet: c('cyan3'), pr: 1.3, moon: true },
      { rx: S(8), ry: S(2.6), speed: 1.6, planet: c('robe5'), pr: 1 },
    ];
    // back halves of the rings, then planets behind the sun, the sun, then the front
    const planet = (ring, front) => {
      const a = orrery.spin * ring.speed * 2;
      const px = cx + Math.cos(a) * ring.rx, py = cy + Math.sin(a) * ring.ry;
      if ((Math.sin(a) > 0) !== front) return;
      surface.disc(px, py, ring.pr * k, ring.planet);
      surface.pset(px + Math.round(ring.pr * k * 0.5), py - Math.round(ring.pr * k * 0.5), c('star3'));
      if (ring.moon) {
        const ma = orrery.spin * 6;
        surface.pset(px + Math.cos(ma) * S(3), py + Math.sin(ma) * S(1.5), c('moon5'));
      }
      // its arm to the axis
      surface.line(cx, cy, px, py, BRASS[1]);
    };
    const ring = (r, front) => {
      const steps = Math.round(r.rx * 7);
      for (let n = 0; n < steps; n++) {
        const a = (n / steps) * Math.PI * 2;
        if ((Math.sin(a) > 0) !== front) continue;
        surface.pset(cx + Math.cos(a) * r.rx, cy + Math.sin(a) * r.ry, front ? BRASS[3] : BRASS[1]);
      }
    };
    for (const r of rings) ring(r, false);
    for (const r of rings) planet(r, false);
    surface.disc(cx, cy, S(2.6), c('gold3'));
    surface.disc(cx + Math.round(k * 0.5), cy - Math.round(k * 0.5), S(1.5), c('gold4'));
    surface.pset(cx + S(1), cy - S(1), c('gold5'));
    for (const r of rings) ring(r, true);
    for (const r of rings) planet(r, true);
    // a tilted meridian hoop around the whole
    const R = S(15);
    for (let n = 0; n < R * 5; n++) {
      const a = (n / (R * 5)) * Math.PI * 2;
      const x = cx + Math.cos(a) * R * 0.28 + Math.sin(a) * R * 0.1, y = cy + Math.sin(a) * R * 0.75;
      if (y < cy + S(9)) surface.pset(x, y, Math.cos(a) > 0 ? BRASS[4] : BRASS[2]);
    }
  }

  function drawBrazier(surface, time) {
    const x = Math.round(brazier.x), g = brazier.y;
    // tripod with curled feet
    surface.thick(x - S(4.5), g - 1, x - S(2), g - S(10), Math.max(1, k), c('iron1'));
    surface.thick(x + S(4.5), g - 1, x + S(2), g - S(10), Math.max(1, k), c('iron3'));
    surface.line(x, g - 1, x, g - S(10), c('iron0'));
    surface.pset(x - S(5.5), g - 1, c('iron3')); surface.pset(x + S(5.5), g - 1, c('iron4'));
    if (u > 1) { surface.pset(x - S(5.5) - 1, g - 2, c('iron2')); surface.pset(x + S(5.5) + 1, g - 2, c('iron3')); }
    // bowl, riveted, with a lit rim
    const rows = S(4.5);
    for (let r = 0; r < rows; r++) {
      const half = Math.round(S(6.5) - r * (S(6.5) - S(3.5)) / rows);
      const y = g - S(13) + r;
      for (let dx = -half; dx <= half; dx++) {
        const q = dx / half;
        let color = r === 0 ? c('iron4') : r === rows - 1 ? c('iron0') : q > 0.55 ? c('iron3') : q < -0.5 ? c('iron0') : c('iron1');
        if (u > 1 && r === 2 && dx % 4 === 0 && Math.abs(q) < 0.8) color = c('iron4');
        surface.pset(x + dx, y, color);
      }
    }
    // flames at the sprite clock
    const step = Math.floor(time * 12);
    const cols = Math.min(25, S(6.5) * 2 + 1), mid = (cols - 1) >> 1;
    if (step !== brazier.flameStep) {
      brazier.flameStep = step;
      for (let i = 0; i < cols; i++) {
        const col = (i - mid) / k;
        const base = Math.max(0, 7 - Math.abs(col) * 1.1);
        const n = noise.n2(col * 0.55, step * 0.45);
        brazier.flames[i] = Math.round((base * (0.55 + n * 0.8) + brazier.flare * (9 - Math.abs(col)) * 0.9) * k);
      }
    }
    for (let i = 1; i < cols - 1; i++) {
      const h = brazier.flames[i];
      const col = i - mid;
      for (let yy = 0; yy < h; yy++) {
        const f = yy / Math.max(1, h);
        const lean = Math.round(Math.sin(step * 0.9 + yy * 0.5 / k + col / k) * f * 1.2 * k);
        const color = f < 0.18 ? c('fire6') : f < 0.4 ? c('fire5') : f < 0.62 ? c('fire4') : f < 0.82 ? c('fire3') : c('fire2');
        surface.pset(x + col + lean, g - S(14) - yy, color);
      }
    }
    // coals
    for (let dx = -S(5.5); dx <= S(5.5); dx++) surface.pset(x + dx, g - S(13), (dx + step) % 3 === 0 ? c('fire5') : (dx + step) % 3 === 1 ? c('fire3') : c('fire2'));
  }

  function drawOwl(surface) {
    const sprites = owlSprites();
    if (owl.state === 'perch') {
      const blink = owl.blinkIn < 0;
      const img = blink ? sprites.blink : owl.look < 0 ? sprites.left : owl.look > 0 ? sprites.right : sprites.still;
      surface.blit(img, Math.round(owl.x), Math.round(owl.y - owl.hop * k));
      return;
    }
    // In flight: body and head, with wings drawn at the flap angle, then outlined.
    flyer.clear(CLEAR);
    const U = u, cx = 20 * U, cy = 14 * U, d = owl.dir;
    const phase = Math.floor(owl.flap * 3) % 4;
    const wingY = [-7, -2, 4, -2][phase] * U;
    const wingX = [9, 11, 9, 11][phase] * U;
    for (const side of [-1, 1]) {
      const tip = side * wingX;
      const near = side === d;
      flyer.thick(cx + side * 2 * U, cy - U, cx + tip * 0.55, cy - U + wingY * 0.6, 3.2 * U, near ? c('owl3') : c('owl2'));
      flyer.thick(cx + tip * 0.55, cy - U + wingY * 0.6, cx + tip, cy + wingY, Math.max(1, 1.6 * (U - 1) + 1), near ? c('owl3') : c('owl2'));
      flyer.line(cx + tip * 0.55, cy + wingY * 0.6, cx + tip * 0.9, cy + U + wingY, c('owl1'));
      if (U > 1) flyer.line(cx + side * 2 * U, cy - 2 * U, cx + tip * 0.55, cy - 2 * U + wingY * 0.6, near ? c('owl4') : c('owl3'));
    }
    flyer.ellipse(cx, cy + U, 3 * U, 3 * U, c('owl3'));
    flyer.pset(cx, cy + 2 * U, c('owl5')); flyer.pset(cx, cy + 3 * U, c('owl4'));
    flyer.disc(cx + d * U, cy - 3 * U, 2 * U, c('owl2'));
    if (U > 1) flyer.disc(cx + d * 2, cy - 6, 2, c('owl4'));
    flyer.pset(cx + d * 2 * U, cy - 3 * U, c('gold3'));
    flyer.pset(cx, cy - 3 * U, c('gold3'));
    flyer.pset(cx + d * 3 * U, cy - 2 * U, c('gold1'));
    flyer.pset(cx - U, cy + 5 * U, c('owl2')); flyer.pset(cx + U, cy + 5 * U, c('owl2'));
    flyer.outline(INK);
    surface.blit(flyer, Math.round(owl.x) + 5 * U - cx, Math.round(owl.y) + 6 * U - cy);
  }

  function drawFireflies(surface) {
    for (const f of fireflies) {
      if (f.glow <= 0) continue;
      surface.glow(f.x, f.y, 4 * k, LIGHT.firefly, f.glow);
      surface.pset(f.x, f.y, f.glow > 0.5 ? c('green4') : c('green3'));
    }
  }

  function lightFire(surface, time) {
    const flick = 0.75 + Math.sin(time * 9) * 0.06 + Math.sin(time * 23) * 0.05 + brazier.flare * 0.5;
    surface.glow(brazier.x, brazier.y - S(15), (34 + brazier.flare * 14) * k, LIGHT.fire, flick);
    for (const s of slits) surface.glow(s.x, s.y + s.h / 2, S(8), LIGHT.fire, 0.5 + Math.sin(time * 3 + s.phase) * 0.1);
    if (oculus.on) surface.glow(oculus.x, oculus.y, oculus.r * 2.2, LIGHT.lamp, 0.6 + Math.sin(time * 2.1) * 0.08, 1, 1, oculus.r + S(3));
    if (turret.on) {
      surface.glow(turret.doorX, layout.groundY, S(12), LIGHT.lamp, 0.55, 1, 0.4);
      surface.glow(turret.doorX, turret.windowY, S(10), LIGHT.lamp, 0.45, 1, 1, S(6));
    }
    if (lantern.on) {
      const p = lanternPoint();
      surface.glow(p.x, p.y, S(26), LIGHT.lamp, 0.7 + Math.sin(time * 11) * 0.05 + Math.sin(time * 4.3) * 0.05);
    }
    if (books.on) {
      surface.glow(books.candleX, books.candleTop - S(2), S(11), LIGHT.lamp, 0.6 + Math.sin(time * 13) * 0.08);
      for (const p of potions) surface.glow(p.x, p.y, S(6), LIGHT.potion[p.color], 0.55 + Math.sin(time * 1.3 + p.x) * 0.2);
    }
  }

  return {
    build, update, drawWall, drawLights, drawProps, drawBrazier, drawOwl, drawFireflies, lightFire, startle,
    brazier, owl, orrery, scope, lantern, turret,
    flare() { brazier.flare = 1; return true; },
    spinOrrery() { orrery.speed = 6; return true; },
    swingLantern() { lantern.swing = Math.min(0.5, lantern.swing + 0.3); return true; },
    glint() { scope.glint = 1; },
    addFirefly(x, y) {
      if (!layout || fireflies.length >= FIREFLY_LIMIT) return false;
      fireflies.push({
        x: x ?? random() * layout.W, y: clamp(y ?? layout.groundY - S(12), layout.groundY * 0.55, layout.groundY - 3 * k),
        phase: 0, seed: random() * 100, speed: (4 + random() * 6) * k, glow: 0,
      });
      return true;
    },
    containsOwl(x, y) {
      const img = owlSprites().still;
      return owl.state === 'perch' && x >= owl.x - 2 * k && x <= owl.x + img.w + 2 * k && y >= owl.y - 2 * k && y <= owl.y + img.h + k;
    },
    containsBrazier(x, y) { return Math.abs(x - brazier.x) < S(8) && y > brazier.y - S(24) && y < brazier.y + 1; },
    containsOrrery(x, y) { return orrery.on && Math.abs(x - orrery.x) < S(16) && y > layout.groundY - S(50) && y < layout.groundY; },
    containsTelescope(x, y) {
      if (!scope.on) return false;
      const dx = x - scope.x, dy = y - scope.y;
      const along = dx * Math.cos(scope.angle) + dy * Math.sin(scope.angle);
      const across = -dx * Math.sin(scope.angle) + dy * Math.cos(scope.angle);
      return (along > -S(14) && along < S(31) && Math.abs(across) < S(5)) || (Math.abs(dx) < S(11) && dy > 0 && y < layout.groundY);
    },
    containsLantern(x, y) {
      if (!lantern.on) return false;
      const p = lanternPoint();
      return Math.abs(x - p.x) < S(6) && Math.abs(y - p.y) < S(9);
    },
    fireIntensity(time) { return 0.55 + Math.sin(time * 9) * 0.08 + brazier.flare * 0.4; },
  };
}
