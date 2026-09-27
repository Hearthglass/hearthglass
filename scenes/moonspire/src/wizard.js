import { Surface, CLEAR, sprite, clamp, approach, lerp, bayer } from '../../shared/pixel-engine.js';
import { palette, INK, RIM, SHADE } from './palette.js';

const c = name => palette.c(name);

// The wizard is assembled each frame into a layer of his own, origin at his feet, then
// outlined, rim-lit from the gem, the moon and the brazier, and stamped into the scene.
// His pose lives in design units (the coarse grid); drawing multiplies by the grid scale U,
// so on the fine grid he has twice the pixels to spend on detail.
export const LAYER_W = 128, LAYER_H = 104;
const OX0 = 52, OY0 = 98;

const FACE_KEY = { v: 'beard1', w: 'beard2', W: 'beard3', H: 'beard4', k: 'skin1', s: 'skin2', S: 'skin3', e: 'ink0' };
const FACE_ROWS = [
  '.vwwwwkssss..',
  'vwwwwksssssS.',
  'vwwwWkWWWssS.',
  'vwwwwkseSsSSS',
  'vwwwwksssSSSS',
  'vwwwwkkssssk.',
  'vwwWWWWWWWW..',
  '.vwWWWHWWWWW.',
  '.vwwWWWWWWW..',
  '..vwwWWWWW...',
];
// The fine face: long hair behind, a bushy brow, a bright eye, a big lit nose and a
// moustache that spills into the beard.
const FINE_KEY = { ...FACE_KEY, X: 'beard5', T: 'skin4', r: 'skin0', g: 'star4' };
const FINE_ROWS = [
  '..vvvwwwwwwwkksssssss.....',
  '.vvwwwwwwwwwkssssssssss...',
  'vvwwwwwwwwwkkssssssssssS..',
  'vwwwwwwWwwwksssssssssssS..',
  'vwwwwwWWwwwkWWHHWWssssSS..',
  'vwwwwwWwwwwkWWWWWWWWsssSS.',
  'vwwwwwwwwwwkksegssssrSSSS.',
  'vwwwWwwwwwwkkseekssrSSTTS.',
  'vwwwWWwwwwwkkssssrSSSTTSSS',
  'vwwwwWwwwwwkksssssrSSSSSSS',
  'vwwwwwwwwwkkssssssrrSSSSS.',
  'vwwwwwwwwwkkksssWWWWrrrk..',
  'vwwwwwWWWWWWWWWWWWWWWWW...',
  'vwwwwWWWWWWHHWWWWWWWWWWW..',
  '.vwwwWWWWWHHHHWWWWXWWWWWW.',
  '.vwwwwWWWWWHHWWWWWWWWWWW..',
  '..vwwwwWWWWWWWWWWWWWWW....',
  '..vwwwwwWWWWWWWWWWWW......',
  '...vwwwwwWWWWWWWWW........',
  '....vwwwwwWWWWWW..........',
];
const edit = (rows, changes) => rows.map((row, y) => {
  let out = row;
  for (const [ry, x, text] of changes) if (ry === y) out = out.slice(0, x) + text + out.slice(x + text.length);
  return out;
});
const FACES = {
  1: {
    still: sprite(palette, FACE_KEY, FACE_ROWS),
    blink: sprite(palette, { ...FACE_KEY, e: 'skin1' }, FACE_ROWS),
    glow: sprite(palette, { ...FACE_KEY, e: 'cyan5' }, FACE_ROWS),
    wide: sprite(palette, FACE_KEY, edit(FACE_ROWS, [[2, 6, 'WWWW'], [3, 6, 'ee']])),
  },
  2: {
    still: sprite(palette, FINE_KEY, FINE_ROWS),
    blink: sprite(palette, { ...FINE_KEY, e: 'skin1', g: 'skin1' }, edit(FINE_ROWS, [[7, 13, 'kkk']])),
    glow: sprite(palette, { ...FINE_KEY, e: 'cyan5', g: 'star4' }, FINE_ROWS),
    wide: sprite(palette, FINE_KEY, edit(FINE_ROWS, [[3, 12, 'WWHHWW'], [4, 12, 'kWWWWWW'], [5, 12, 'ksesgs'], [6, 12, 'keeees'], [7, 12, 'ksees']])),
  },
};

// Gem crystals: 0 lit face, 1 body, 2 shade, 3 glint.
const GEMS = {
  1: {
    small: [[0, -2, 0], [-1, -1, 0], [0, -1, 0], [1, -1, 1], [-1, 0, 1], [0, 0, 0], [1, 0, 2], [0, 1, 2]],
    big: [[0, -3, 0], [-1, -2, 1], [0, -2, 0], [1, -2, 2], [-2, -1, 1], [-1, -1, 0], [0, -1, 0], [1, -1, 1], [2, -1, 2], [-2, 0, 1], [-1, 0, 0], [0, 0, 0], [1, 0, 1], [2, 0, 2], [-1, 1, 1], [0, 1, 1], [1, 1, 2], [0, 2, 2]],
  },
  2: {
    small: gemFromRows(['...0...', '..001..', '..0012.', '.30012.', '.300112', '0001112', '.001112', '.00112.', '..0112.', '..012..', '...2...']),
    big: gemFromRows(['....0....', '...001...', '...0012..', '..30012..', '..300112.', '.3000112.', '.30001122', '000001112', '.00001112', '.0000112.', '..000112.', '..00112..', '...0112..', '...012...', '....2....']),
  },
};
function gemFromRows(rows) {
  const out = [], h = rows.length, w = rows[0].length;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') out.push([x - (w >> 1), y - (h >> 1), Number(ch)]); }));
  return out;
}
const GEM_COLORS = {
  cyan: ['cyan5', 'cyan4', 'cyan2', 'star4'], green: ['green4', 'green3', 'green2', 'star4'], violet: ['violet4', 'violet3', 'violet1', 'star4'],
};

// Runes stitched into the hem, three pixels tall, one glyph every six columns.
const HEM_GLYPHS = [
  ['x.x', '.x.', 'x.x'], ['xxx', 'x..', 'xxx'], ['.x.', 'xxx', '.x.'], ['x..', 'xxx', '..x'], ['xx.', 'x.x', '.xx'],
];
// Gold stars scattered over the robe, in design units from the feet.
const ROBE_STARS = [[-5, -10], [2, -14], [-2, -6], [5, -8], [-8, -4], [1, -3.5], [6, -13], [-4, -14.5], [3, -21], [-3, -24]];

const POSE_KEYS = ['bob', 'lean', 'gripX', 'gripY', 'staff', 'backX', 'backY', 'sway', 'beard', 'hatBend', 'hatTilt', 'headY', 'crouch'];

function makePose() {
  return { bob: 0, lean: 0, gripX: 9, gripY: -21, staff: 0.06, backX: -5, backY: -17, sway: 0, beard: 0, hatBend: -1.75, hatTilt: -0.12, headY: 0, crouch: 0 };
}

/** Draw the pointed hat with its brim centred at (bx, by). Works in the layer and loose in the scene. */
const HAT_MAX = 64;
const hatSpine = new Float32Array(HAT_MAX * 5); // x, y, angle, width, distance
const HAT_STARS = [[5, -0.25, 1], [8.5, 0.3, 0], [12, -0.3, 0], [15.5, 0.15, 0], [10.2, -0.55, 0]];

export function drawHat(s, bx, by, tilt, bend, clipBelow = by - 1, U = 1) {
  // The cone is a curved spine with a tapering width. Every pixel near it is coloured by
  // how far along the spine it is (band, stars, tip) and how far across (shade to light).
  const samples = U > 1 ? 60 : 44;
  const L = 20 * U, w0 = 6.4 * U, step = L / (samples - 1);
  let x = bx, y = by - 1, a = tilt;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < samples; i++) {
    const d = i * step, t = d / L;
    const w = w0 * Math.pow(1 - t, 1.1) + 0.45 * U;
    hatSpine.set([x, y, a, w, d], i * 5);
    minX = Math.min(minX, x - w); maxX = Math.max(maxX, x + w); minY = Math.min(minY, y - w); maxY = Math.max(maxY, y + w);
    a = tilt + bend * t * t;
    x += Math.sin(a) * step; y -= Math.cos(a) * step;
  }
  const last = (samples - 1) * 5;
  for (let py = Math.floor(minY) - 1; py <= Math.ceil(maxY) + 1; py++) {
    if (py > clipBelow) continue;
    for (let px = Math.floor(minX) - 1; px <= Math.ceil(maxX) + 1; px++) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i <= last; i += 5) {
        const dx = px - hatSpine[i], dy = py - hatSpine[i + 1];
        const e = dx * dx + dy * dy;
        if (e < bestD) { bestD = e; best = i; }
      }
      const sa = hatSpine[best + 2], w = hatSpine[best + 3], d = hatSpine[best + 4] / U;
      const dx = px - hatSpine[best], dy = py - hatSpine[best + 1];
      const along = dx * Math.sin(sa) - dy * Math.cos(sa);
      const across = dx * Math.cos(sa) + dy * Math.sin(sa);
      if (best === 0 && along < -0.5) continue;
      if (best === last && along > 0.6) continue;
      if (Math.abs(across) > w + 0.3) continue;
      const u = across / w;
      const dither = U > 1 ? bayer(px, py) : 0.5;
      let color;
      if (d > 0.4 && d < 2.9) {
        // the hatband, embroidered on the fine grid
        color = u < -0.45 ? c('gold1') : u > 0.35 ? c('gold4') : c('gold3');
        if (U > 1 && Math.abs(d - 1.65) < 0.3 && Math.round(across) % 3 === 0) color = u > 0 ? c('gold5') : c('gold2');
      } else {
        let v = 4 + u * 1.7;
        if (u > 0.4 && d > 3 && d < 14) v += 0.9;
        if (d > 11 && d < 13.5 && Math.abs(u) < 0.5) v -= 1.6; // a crease where the tip folds over
        if (U > 1 && d > 13.5 && d < 14.3 && u > -0.2) v += 0.8;
        color = c(`robe${clamp(Math.floor(v + dither), 1, 6)}`);
      }
      s.pset(px, py, color);
    }
  }
  // gold stars on the cone and a bead at the tip
  for (const [d, u, big] of U > 1 ? HAT_STARS : [[8, 0.2, 0]]) {
    const i = Math.min(last, Math.round((d * U) / step) * 5);
    const sx = hatSpine[i] + Math.cos(hatSpine[i + 2]) * hatSpine[i + 3] * u, sy = hatSpine[i + 1] + Math.sin(hatSpine[i + 2]) * hatSpine[i + 3] * u;
    s.pset(sx, sy, c('gold5'));
    if (big) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.pset(sx + ox, sy + oy, c('gold3'));
  }
  s.pset(hatSpine[last], hatSpine[last + 1], c('gold4'));
  if (U > 1) s.pset(hatSpine[last] + 1, hatSpine[last + 1], c('gold2'));
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  // brim: a flattened ellipse, lit on top, dark underneath
  const rx = 10.5 * U;
  for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
    const q = 1 - (dx / (rx + 0.5)) ** 2;
    if (q <= 0) continue;
    const h = Math.max(1, Math.round(2 * U * Math.sqrt(q)));
    const x = bx + Math.round(dx * cos), y0 = by + Math.round(dx * sin);
    for (let dy = -h + 1; dy <= U; dy++) {
      let color = c('robe4');
      if (dy > 0) color = dy === U ? c('robe1') : c('robe2');
      else if (dy === -h + 1) color = dx > -6 * U ? c('robe6') : c('robe4');
      else if (U > 1 && dy === -h + 2 && dx > -3 * U) color = c('robe5');
      if (dx < -rx * 0.55 && dy === 0) color = c('robe3');
      s.pset(x, y0 + dy, color);
    }
  }
}

export function createWizard() {
  let U = 1, OX = OX0, OY = OY0;
  let layer = new Surface(LAYER_W, LAYER_H, CLEAR);
  const pose = makePose();
  const shown = makePose();
  const target = makePose();
  const wizard = {
    state: 'idle', stateTime: 0,
    charge: 0, aimX: 0, aimY: -60, // aim relative to feet, in screen pixels
    spin: 0, lookX: 1, blinkIn: 3, blinking: 0,
    hatOn: true, eyesGlow: 0, soot: 0,
    fired: false, pendingFire: null,
    shownStep: -1, tremble: 0,
    glowColor: 'cyan',
  };

  function setScale(scale) {
    U = scale;
    OX = OX0 * U; OY = OY0 * U;
    layer = new Surface(LAYER_W * U, LAYER_H * U, CLEAR);
    api.layer = layer;
    api.origin = { x: OX, y: OY };
  }

  function set(state) { wizard.state = state; wizard.stateTime = 0; wizard.fired = false; }

  // Shoulder of the staff arm in feet-relative design units.
  const shoulder = () => ({ x: 3 + pose.lean, y: -27 + pose.bob + pose.crouch });

  function aimPose(reach) {
    const sh = shoulder();
    let dx = wizard.aimX / U - sh.x, dy = wizard.aimY / U - sh.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // Never point back through himself or down into the floor.
    if (dx < 0.15) dx = 0.15;
    if (dy > 0.1) dy = 0.1;
    const l2 = Math.hypot(dx, dy);
    dx /= l2; dy /= l2;
    return { gripX: sh.x + dx * reach, gripY: sh.y + dy * reach, staff: Math.atan2(dx, -dy) };
  }

  function update(dt, time) {
    wizard.stateTime += dt;
    const st = wizard.state, t = wizard.stateTime;
    Object.assign(target, makePose());
    const breathe = Math.sin(time * 2.2);
    target.bob = breathe > 0.2 ? 1 : 0;
    target.sway = Math.sin(time * 0.9) * 0.8;
    target.beard = Math.sin(time * 1.3 + 1) * 0.7;
    target.hatBend = -1.75 + Math.sin(time * 1.1) * 0.08;
    wizard.eyesGlow = Math.max(0, wizard.eyesGlow - dt * 2);
    switch (st) {
      case 'idle':
        target.staff = 0.06 + Math.sin(time * 0.7) * 0.03;
        break;
      case 'charge': {
        const k = wizard.charge;
        const aim = aimPose(9);
        target.gripX = lerp(8, aim.gripX, 0.35); target.gripY = -34 - k * 3;
        target.staff = lerp(0.2, aim.staff * 0.7, 0.5) - 0.1;
        target.bob = 0; target.crouch = k * 1.5;
        target.backX = -11 - k * 2; target.backY = -26 - k * 3;
        target.sway = Math.sin(time * (6 + k * 10)) * (1 + k * 2.2) - k * 1.5;
        target.beard = Math.sin(time * (7 + k * 8)) * (0.8 + k * 1.8) - k * 1.5;
        target.hatBend = -1.75 + Math.sin(time * (9 + k * 9)) * (0.12 + k * 0.35) + k * 0.4;
        wizard.eyesGlow = Math.max(wizard.eyesGlow, k);
        wizard.tremble = k > 0.55 ? (k - 0.55) * 2.2 : 0;
        break;
      }
      case 'cast': {
        const aim = aimPose(12);
        Object.assign(target, aim);
        target.lean = 2; target.backX = -15; target.backY = -25; target.bob = 0;
        target.sway = -2.5; target.beard = -2.2; target.hatBend = -1.4;
        if (!wizard.fired && t > 0.07) { wizard.fired = true; wizard.pendingFire = 'bolt'; }
        if (t > 0.4) set('recover');
        break;
      }
      case 'recover': {
        const aim = aimPose(10);
        const k = clamp(t / 0.5, 0, 1);
        target.gripX = lerp(aim.gripX, 9, k); target.gripY = lerp(aim.gripY, -21, k); target.staff = lerp(aim.staff, 0.06, k);
        target.backX = lerp(-13, -5, k); target.backY = lerp(-24, -17, k);
        if (t > 0.55) set('idle');
        break;
      }
      case 'twirl': {
        wizard.spin += dt * 14 * Math.min(1, t * 3) * (t > 0.8 ? Math.max(0, (1.05 - t) * 4) : 1);
        target.gripX = 10; target.gripY = -27; target.staff = wizard.spin;
        target.backX = -10; target.backY = -24;
        target.hatBend = -1.75 + Math.sin(t * 20) * 0.25;
        if (!wizard.fired && t > 0.25) { wizard.fired = true; wizard.pendingFire = 'twirl'; }
        if (t > 1.05) { wizard.spin = 0; pose.staff = 0.06; shown.staff = 0.06; set('idle'); }
        break;
      }
      case 'shock':
        target.gripX = 5; target.gripY = -31; target.staff = -0.35;
        target.backX = -9; target.backY = -34; target.lean = -2; target.bob = 0; target.headY = -1;
        target.sway = -1.5; target.beard = 1.5;
        if (t > 1.6) set('idle');
        break;
      case 'look':
        target.headY = -1; target.staff = 0.1;
        if (t > 2.2) set('idle');
        break;
      case 'mend': {
        const aim = aimPose(12);
        Object.assign(target, aim);
        target.gripY -= 3; target.backX = -12; target.backY = -30;
        target.sway = Math.sin(time * 5) * 1.5; target.beard = Math.sin(time * 5.5) * 1.2;
        target.hatBend = -1.6 + Math.sin(time * 7) * 0.12;
        wizard.eyesGlow = 1;
        break;
      }
      case 'singed':
        // the spell went off in his face: staff drooping, hat wilted, a little unsteady
        target.gripX = 8; target.gripY = -19; target.staff = -0.3 + Math.sin(time * 3) * 0.05;
        target.backX = -6; target.backY = -17; target.lean = -1 + Math.round(Math.sin(time * 2.5)); target.headY = 1;
        target.hatBend = -2.35; target.hatTilt = -0.3; target.bob = 0;
        target.beard = Math.sin(time * 9) * 0.6;
        if (t > 2.6) set('recover');
        break;
      case 'stretch': {
        const k = Math.sin(clamp(t / 1.8, 0, 1) * Math.PI);
        target.gripY = -21 - k * 4; target.backX = -6 - k * 3; target.backY = -17 - k * 14; target.lean = -k;
        target.headY = -Math.round(k);
        if (t > 1.9) set('idle');
        break;
      }
    }
    // Ease every parameter toward its target; faster when casting.
    const rate = st === 'cast' ? 30 : st === 'twirl' ? 60 : st === 'charge' ? 10 : st === 'shock' ? 16 : 7;
    for (const key of POSE_KEYS) pose[key] = key === 'staff' && st === 'twirl' ? target.staff : approach(pose[key], target[key], rate, dt);
    wizard.soot = Math.max(0, wizard.soot - dt * 0.16);
    wizard.blinkIn -= dt;
    if (wizard.blinkIn <= 0) { wizard.blinking = 0.13; wizard.blinkIn = 2.5 + Math.random() * 4; }
    wizard.blinking = Math.max(0, wizard.blinking - dt);
  }

  /** Sample the pose onto the 12 fps sprite clock (faster for a twirl), with a charge tremble. */
  function sample(time) {
    const fps = wizard.state === 'twirl' ? 24 : 12;
    const step = Math.floor(time * fps);
    if (step === wizard.shownStep) return false;
    wizard.shownStep = step;
    for (const key of POSE_KEYS) shown[key] = pose[key];
    if (wizard.tremble > 0 && wizard.state === 'charge') {
      shown.lean += (step % 2 ? 1 : -1) * Math.round(wizard.tremble * 0.8);
    }
    return true;
  }

  function staffEnds(p) {
    const len = 46, grip = 0.42;
    const ux = Math.sin(p.staff), uy = -Math.cos(p.staff);
    const gx = p.gripX, gy = p.gripY;
    return {
      bx: gx - ux * len * grip, by: gy - uy * len * grip,
      tx: gx + ux * len * (1 - grip), ty: gy + uy * len * (1 - grip), ux, uy,
    };
  }

  /** Gem centre relative to the feet in screen pixels, from the pose on screen. */
  function gem() {
    const e = staffEnds(shown);
    return { x: (e.tx + e.ux * 3) * U, y: (e.ty + e.uy * 3) * U };
  }

  function drawStaff(s, p, glow) {
    const e = staffEnds(p);
    const bx = OX + e.bx * U, by = OY + e.by * U, tx = OX + e.tx * U, ty = OY + e.ty * U;
    const px = Math.round(Math.cos(p.staff)), py = Math.round(Math.sin(p.staff));
    const at = (k, side = 0) => [bx + (tx - bx) * k + px * side, by + (ty - by) * k + py * side];
    if (U > 1) {
      // a three-pixel shaft: shadowed side, body, lit side, with grain and a leather grip
      s.line(bx - px, by - py, tx - px, ty - py, c('wood2'));
      s.line(bx, by, tx, ty, c('wood4'));
      s.line(bx + px, by + py, tx + px, ty + py, c('wood5'));
      for (let k = 0.05; k < 0.95; k += 0.09) s.pset(...at(k + (k * 7 % 0.03), 0), c('wood3'));
      for (const k of [0.16, 0.7, 0.86]) { s.pset(...at(k, 0), c('wood1')); s.pset(...at(k + 0.012, 1), c('wood2')); }
      for (let k = 0.36; k <= 0.52; k += 0.022) {
        const band = Math.round(k * 90) % 2;
        for (const side of [-1, 0, 1]) s.pset(...at(k, side), band ? c('wood1') : side > 0 ? c('wood3') : c('wood2'));
      }
      for (const k of [0.34, 0.54]) for (const side of [-1, 0, 1]) s.pset(...at(k, side), side > 0 ? c('gold4') : c('gold2'));
      s.pset(...at(0, 0), c('iron3')); s.pset(...at(0.01, 0), c('iron2'));
    } else {
      s.line(bx, by, tx, ty, c('wood3'));
      s.line(bx + px, by + py, tx + px, ty + py, c('wood4'));
      for (const k of [0.18, 0.66]) s.pset(...at(k), c('wood1'));
      for (const k of [0.38, 0.44, 0.5]) s.pset(...at(k, 1), c('wood1'));
    }
    // the claw that holds the gem
    const ux = e.ux, uy = e.uy, nx = -uy, ny = ux;
    for (const side of U > 1 ? [-1, -0.35, 1] : [-1, 1]) {
      for (let k = 0; k <= 5 * U; k++) {
        const q = k / U;
        const spread = (q < 3 ? q * 0.9 : 2.7 - (q - 3) * 0.6) * U * Math.abs(side) * (side < 0 && side > -1 ? 1.3 : 1);
        const sgn = Math.sign(side);
        const color = q > 3.6 ? c('wood6') : side > 0 ? c('wood5') : c('wood3');
        s.pset(tx + ux * k + nx * spread * sgn, ty + uy * k + ny * spread * sgn, color);
        if (U > 1 && q < 3) s.pset(tx + ux * k + nx * (spread - 1) * sgn, ty + uy * k + ny * (spread - 1) * sgn, c('wood2'));
      }
    }
    // the gem: a faceted crystal, bigger when charged
    const gx = tx + ux * 3 * U, gy = ty + uy * 3 * U;
    const shape = GEMS[U > 1 ? 2 : 1][glow > 0.55 ? 'big' : 'small'];
    const cols = (GEM_COLORS[wizard.glowColor] || GEM_COLORS.cyan).map(c);
    for (const [dx, dy, shade] of shape) s.pset(gx + dx, gy + dy, cols[shade]);
    return { gx, gy };
  }

  function drawArm(s, sx, sy, hx, hy, near) {
    const dx = hx - sx, dy = hy - sy, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const wx = hx - ux * 1.8 * U, wy = hy - uy * 1.8 * U;
    const base = near ? c('robe4') : c('robe3');
    s.thick(sx, sy, wx, wy, 4.2 * U, base);
    // top-edge highlight and, on the fine grid, a fold along the underside
    if (near) s.line(sx - uy * 1.2 * U + ux, sy - ux * 1.2 * U + uy - 1, wx - uy * 1.5 * U, wy - 1, c('robe5'));
    if (U > 1) {
      s.line(sx + nx * 1.4 * U, sy + ny * 1.4 * U, wx + nx * 1.2 * U, wy + ny * 1.2 * U, near ? c('robe3') : c('robe2'));
      if (near) s.line(sx - nx * 1.8 * U + ux * 2, sy - ny * 1.8 * U + uy * 2, wx - nx * 1.9 * U, wy - ny * 1.9 * U, c('robe6'));
    }
    // bell cuff with gold trim
    s.disc(wx, wy, 2.6 * U, base);
    for (let t = -2 * U; t <= 2 * U; t++) {
      s.pset(wx + nx * t + ux * 0.8 * U, wy + ny * t + uy * 0.8 * U, near ? c('gold3') : c('gold2'));
      if (U > 1) s.pset(wx + nx * t + ux * (0.8 * U - 1), wy + ny * t + uy * (0.8 * U - 1), near ? c('gold4') : c('gold2'));
    }
    s.disc(hx, hy, 1.4 * U, near ? c('skin2') : c('skin1'));
    s.pset(hx, hy - U, near ? c('skin3') : c('skin2'));
    if (U > 1) {
      // knuckles and a thumb
      s.pset(hx + ux * 2, hy + uy * 2, near ? c('skin1') : c('skin0'));
      s.pset(hx + nx * 2 + ux, hy + ny * 2 + uy, near ? c('skin1') : c('skin0'));
      s.pset(hx - nx * 2, hy - ny * 2 - 1, near ? c('skin4') : c('skin2'));
      s.pset(hx + 1, hy - 2, near ? c('skin4') : c('skin3'));
    }
  }

  function drawBody(s, p) {
    const bob = (p.bob + p.crouch) * U, L = Math.round(p.lean * U), sway = p.sway * U;
    const sy = -29 * U + bob;
    const X = v => OX + v * U, Y = v => OY + v * U;
    const pts = [
      X(-5) + L, OY + sy, X(5) + L, OY + sy,
      X(6) + L * 0.5, Y(-17) + bob * 0.5, X(9) + sway, Y(-1), X(9) + sway, Y(0.5),
      X(-11) + sway * 0.6, Y(0.5), X(-10) + sway * 0.5, Y(-3), X(-7), Y(-17) + bob * 0.5,
    ];
    const mark = c('robe4');
    s.poly(pts, mark);
    // Shade each row across its width: dark back, lit front edge, folds, trims.
    const top = Math.round(OY + sy), bottom = OY;
    const d = s.data, W = s.w;
    const hem = U > 1 ? 5 : 2;
    const beltY = Math.round(Y(-17) + Math.round(bob * 0.5 / U) * U);
    for (let y = top; y <= bottom; y++) {
      let x0 = -1, x1 = -1;
      for (let x = X(-16); x < X(16); x++) if (d[y * W + x] === mark) { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 < 0) continue;
      const span = Math.max(1, x1 - x0);
      const below = (y - Y(-17)) / (17 * U); // 0 at waist, 1 at hem
      const fold1 = 0.55 + sway / U * 0.02 * below, fold2 = 0.28 + sway / U * 0.015 * below;
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / span;
        const dither = U > 1 ? bayer(x, y) : ((x + y) & 1 ? 0.8 : 0.2);
        let v = u < 0.14 ? 1.6 : u < 0.4 ? 2.6 + (u - 0.14) * 3 : u > 0.9 ? 5.2 : 4;
        if (U > 1 && u > 0.72 && u <= 0.9) v = 4.4;
        let color = c(`robe${clamp(Math.floor(v + dither - 0.5), 1, 6)}`);
        // folds swing with the hem
        if (below > 0.1) {
          if (Math.abs(u - fold1) < 0.5 / span + 0.02 && (U > 1 || y % 3 !== 0)) color = c('robe2');
          if (U > 1 && Math.abs(u - fold1 - 1.2 / span) < 0.5 / span) color = c('robe5');
          if (Math.abs(u - fold2) < 0.5 / span + 0.02) color = c('robe1');
          // front opening trimmed in gold
          if (Math.abs(u - 0.8) < 0.6 / span * (U > 1 ? 1.6 : 1)) color = U > 1 && u > 0.8 ? c('gold4') : c('gold3');
        }
        if (y > bottom - hem) {
          const r = bottom - y;
          if (U > 1) {
            // an embroidered hem: a gold rule, a band of runes, a gold edge
            if (r === 4) color = c('gold4');
            else if (r === 0) color = u < 0.3 ? c('gold1') : c('gold2');
            else {
              const col = x - X(-11) + 60;
              const glyph = HEM_GLYPHS[Math.floor(col / 6) % HEM_GLYPHS.length];
              const gx = col % 6;
              const on = gx < 3 && glyph[3 - r]?.[gx] === 'x';
              color = on ? (u < 0.3 ? c('gold2') : c('gold3')) : u < 0.25 ? c('robe1') : c('robe2');
            }
          } else color = u < 0.3 ? c('gold1') : y === bottom - 1 ? c('gold4') : c('gold3');
        }
        if (y <= top + U && u > 0.3) color = y === top ? c('robe6') : c('robe4');
        d[y * W + x] = color;
      }
      // belt with a buckle
      if (y >= beltY - (U > 1 ? 1 : 0) && y <= beltY + (U > 1 ? 1 : 0)) {
        for (let x = x0; x <= x1; x++) d[y * W + x] = U > 1 ? (y < beltY ? c('wood4') : y > beltY ? c('wood1') : c('wood2')) : c('wood1');
      }
    }
    // stars on the robe, only where the cloth shows
    if (U > 1) {
      const cloth = new Set([1, 2, 3, 4, 5, 6].map(i => c(`robe${i}`)));
      for (const [sx, sy2] of ROBE_STARS) {
        const x = Math.round(X(sx) + sway * (sy2 > -17 ? (sy2 + 17) / 17 * 0.5 : 0)), y = Math.round(Y(sy2) + (sy2 < -17 ? bob : bob * 0.5));
        if (!cloth.has(s.get(x, y))) continue;
        s.pset(x, y, c('gold4'));
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cloth.has(s.get(x + ox, y + oy))) s.pset(x + ox, y + oy, c('gold2'));
      }
    }
    // buckle, pouch and a tucked scroll
    let bx0 = -1, bx1 = -1;
    for (let x = X(-16); x < X(16); x++) { const v = s.get(x, beltY); if (v === c('wood2') || v === c('wood1')) { if (bx0 < 0) bx0 = x; bx1 = x; } }
    if (bx0 >= 0) {
      const span = bx1 - bx0, bk = Math.round(bx0 + span * 0.78);
      if (U > 1) {
        s.rect(bk - 1, beltY - 2, 4, 5, c('gold3'));
        s.rect(bk, beltY - 1, 2, 3, c('wood1'));
        s.pset(bk + 2, beltY - 2, c('gold5'));
        // pouch
        const px = Math.round(bx0 + span * 0.3);
        s.rect(px - 3, beltY + 1, 7, 6, c('wood3'));
        s.hline(px - 3, px + 3, beltY + 7, c('wood2'));
        s.hline(px - 3, px + 3, beltY + 1, c('wood5'));
        s.rect(px - 3, beltY + 2, 7, 2, c('wood4'));
        s.pset(px, beltY + 4, c('gold4'));
        s.vline(px + 3, beltY + 2, beltY + 6, c('wood2'));
        // scroll
        const sx0 = Math.round(bx0 + span * 0.55);
        for (let i = 0; i < 8; i++) { s.pset(sx0 + (i >> 1), beltY - 5 + i, c('paper3')); s.pset(sx0 + (i >> 1) + 1, beltY - 5 + i, c('paper1')); }
        s.pset(sx0, beltY - 5, c('paper2'));
        s.pset(sx0 + 1, beltY - 1, c('robe5'));
      } else {
        s.pset(bk, beltY, c('gold4')); s.pset(bk + 1, beltY, c('gold3'));
        s.pset(bk, beltY - 1, c('gold3')); s.pset(bk, beltY + 1, c('gold1'));
      }
    }
    // boots, the front one with a curled toe
    const fx = X(3) + Math.round(sway * 0.8);
    if (U > 1) {
      s.rect(fx, OY - 2, 10, 3, c('wood2'));
      s.hline(fx + 1, fx + 7, OY - 2, c('wood4'));
      s.hline(fx, fx + 10, OY, c('wood1'));
      s.pset(fx + 10, OY - 1, c('wood3')); s.pset(fx + 11, OY - 2, c('wood3')); s.pset(fx + 11, OY - 3, c('wood4'));
      s.rect(X(-8), OY - 1, 8, 2, c('wood1'));
      s.hline(X(-8), X(-5), OY - 1, c('wood2'));
    } else {
      s.rect(fx, OY - 1, 5, 2, c('wood1'));
      s.pset(fx + 5, OY, c('wood1'));
      s.hline(fx + 1, fx + 3, OY - 1, c('wood2'));
      s.rect(X(-8), OY, 4, 1, c('wood1'));
    }
  }

  function drawBeard(s, p) {
    const bob = (p.bob + p.crouch) * U;
    const top = OY - 30 * U + bob, len = 15 * U;
    for (let yy = 0; yy <= len; yy++) {
      const t = yy / len;
      const half = (4.6 * Math.pow(1 - t, 0.75) + 0.4) * U;
      const cx = OX + (1.5 + p.lean * 0.8 + p.beard * t * t + Math.sin(yy / U * 0.7) * 0.35 + t * 0.8) * U;
      const y = Math.round(top + yy);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const u = (x - (cx - half)) / (2 * half);
        let color;
        if (U > 1) {
          // strands that wave down the beard, lit on the right, shadowed under the moustache
          let v = u < 0.16 ? 1 : u < 0.4 ? 2 : u < 0.72 ? 3 : 4;
          const strand = ((x - cx) * 0.8 + Math.sin(yy * 0.22 + x * 0.1) * 1.4 + 20) % 3;
          if (strand < 0.8 && u > 0.12 && u < 0.9) v -= 1;
          if (strand > 2.4 && u > 0.5) v += 1;
          if (yy < 3 && u < 0.6) v -= 1;
          color = c(`beard${clamp(v, 0, 5)}`);
        } else {
          color = c('beard2');
          if (u < 0.22) color = c('beard1');
          else if (u > 0.62) color = c('beard3');
          if ((x + Math.round(yy * 0.4)) % 3 === 0 && u > 0.2 && u < 0.85) color = palette.darker[color];
          if (yy === 0 && u > 0.4) color = c('beard4');
        }
        s.pset(x, y, color);
      }
    }
  }

  /**
   * Build the layer for this frame. `lights` gives the moon, fire and gem light in
   * screen pixels relative to his feet; the layer is returned with its origin offsets.
   */
  let drawnLook = '';
  function draw(time, lights) {
    // The layer is a sprite: it changes on the sprite clock (lights included) or when
    // something about his look changes, not every frame.
    const resampled = sample(time);
    const look = `${wizard.state}|${wizard.blinking > 0}|${wizard.eyesGlow > 0.3}|${wizard.glowColor}|${wizard.hatOn}|` +
      `${Math.round(wizard.charge * 12)}|${Math.round(wizard.soot * 16)}|${lights.moon}|${layer.w}|${lights.moonDX}|${lights.moonDY}`;
    if (!resampled && look === drawnLook) return layer;
    drawnLook = look;
    const p = shown;
    layer.clear(CLEAR);
    const bob = (p.bob + p.crouch) * U, L = Math.round(p.lean * U);
    const glow = Math.max(wizard.charge, wizard.state === 'mend' ? 0.7 : 0, wizard.state === 'cast' ? 0.5 : 0);
    // far arm first, behind everything
    drawArm(layer, OX - 4 * U + L, OY - 27 * U + bob, OX + p.backX * U + L, OY + p.backY * U + bob, false);
    drawBody(layer, p);
    // head
    const faces = FACES[U > 1 ? 2 : 1];
    const dazed = wizard.state === 'singed' && wizard.stateTime > 0.5;
    const face = wizard.state === 'shock' || (wizard.state === 'singed' && !dazed) ? faces.wide : wizard.eyesGlow > 0.3 ? faces.glow : wizard.blinking > 0 || dazed ? faces.blink : faces.still;
    // whole pixels: eased pose values are fractional, and the layer is indexed by these
    const hx = OX - 5 * U + L, hy = Math.round(OY + (-39 + p.headY) * U + bob);
    layer.blit(face, hx, hy);
    drawBeard(layer, p);
    if (wizard.hatOn) drawHat(layer, hx + 6 * U, hy + U, p.hatTilt, p.hatBend, hy + U - 1, U);
    else {
      // tufts of white hair where the hat was
      layer.hline(hx + U, hx + 8 * U, hy, c('beard3'));
      layer.hline(hx + 2 * U, hx + 6 * U, hy - U, c('beard2'));
      layer.pset(hx + 4 * U, hy - 2 * U, c('beard4'));
      if (U > 1) { layer.hline(hx + 3, hx + 14, hy - 1, c('beard4')); layer.pset(hx + 9, hy - 5, c('beard3')); layer.pset(hx + 10, hy - 6, c('beard4')); }
    }
    const { gx, gy } = drawStaff(layer, p, glow);
    drawArm(layer, OX + 3 * U + L, OY - 27 * U + bob, OX + p.gripX * U, OY + p.gripY * U, true);
    layer.outline(INK);
    // Light: a cool edge from the moon, warm from the fire, and the gem on top.
    if (lights.moon > 0) layer.rim(OX + lights.moonDX, OY + lights.moonDY, RIM.moon, lights.moon);
    if (lights.fire > 0) layer.rim(OX + lights.fireDX, OY + lights.fireDY, RIM.fire, lights.fire);
    const gemRim = 0.3 + glow * 0.9;
    layer.rim(gx, gy, glow > 0.6 ? RIM.gemHot : RIM.gem, Math.min(1, gemRim), (glow > 0.6 ? 2 : 1) * U);
    // soot from a backfired spell, heaviest on the face and beard, wearing off
    if (wizard.soot > 0) {
      const top = Math.max(0, hy - 22 * U), bottom = Math.min(layer.h, hy + 26 * U), d = layer.data;
      for (let y = top; y < bottom; y++) for (let x = 0; x < layer.w; x++) {
        const i = y * layer.w + x;
        if (d[i] === CLEAR) continue;
        const heavy = y > hy - 2 * U && y < hy + 14 * U ? 1 : 0.55;
        const k = wizard.soot * heavy;
        if (bayer(x, y) < k * 0.7) d[i] = SHADE.soot[d[i]];
        else if (bayer(x, y) < k) d[i] = SHADE.sootLight[d[i]];
      }
    }
    return layer;
  }

  const api = {
    wizard, pose, shown, set, update, draw, gem, layer, setScale,
    origin: { x: OX, y: OY },
    get scale() { return U; },
    /** Hat brim position relative to the feet, for knocking it off. */
    hatPosition() { return { x: (-5 + 6) * U + Math.round(shown.lean * U), y: (-39 + shown.headY + 1) * U + (shown.bob + shown.crouch) * U }; },
    contains(dx, dy) { return dx > -12 * U && dx < 12 * U && dy < 2 * U && dy > -56 * U; },
  };
  return api;
}
