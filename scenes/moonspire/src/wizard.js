import { Surface, CLEAR, sprite, clamp, approach, lerp, bayer } from '../../shared/pixel-engine.js';
import { palette, INK, RIM, SHADE } from './palette.js';

const c = name => palette.c(name);

// The wizard is assembled each frame into a layer of his own, origin at his feet, then
// outlined, rim-lit from the gem, the moon and the brazier, and stamped into the scene.
export const LAYER_W = 128, LAYER_H = 104;
const OX = 52, OY = 98;

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
const FACE_KEY = { v: 'beard1', w: 'beard2', W: 'beard3', H: 'beard4', k: 'skin1', s: 'skin2', S: 'skin3', e: 'ink0' };
const FACE = sprite(palette, FACE_KEY, FACE_ROWS);
const FACE_BLINK = sprite(palette, { ...FACE_KEY, e: 'skin1' }, FACE_ROWS);
const FACE_GLOW = sprite(palette, { ...FACE_KEY, e: 'cyan5' }, FACE_ROWS);
const FACE_WIDE = sprite(palette, { ...FACE_KEY, e: 'ink0' }, FACE_ROWS.map((row, i) => (i === 2 ? 'vwwwWkWWWWsS.' : i === 3 ? 'vwwwwkeeSsSSS' : row)));

const POSE_KEYS = ['bob', 'lean', 'gripX', 'gripY', 'staff', 'backX', 'backY', 'sway', 'beard', 'hatBend', 'hatTilt', 'headY', 'crouch'];

function makePose() {
  return { bob: 0, lean: 0, gripX: 9, gripY: -21, staff: 0.06, backX: -5, backY: -17, sway: 0, beard: 0, hatBend: -1.75, hatTilt: -0.12, headY: 0, crouch: 0 };
}

/** Draw the pointed hat with its brim centred at (bx, by). Works in the layer and loose in the scene. */
const HAT_SAMPLES = 44;
const hatSpine = new Float32Array(HAT_SAMPLES * 5); // x, y, angle, width, distance

export function drawHat(s, bx, by, tilt, bend, clipBelow = by - 1) {
  // The cone is a curved spine with a tapering width. Every pixel near it is coloured by
  // how far along the spine it is (band, star, tip) and how far across (shade to light).
  const L = 20, w0 = 6.4, step = L / (HAT_SAMPLES - 1);
  let x = bx, y = by - 1, a = tilt;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let k = 0; k < HAT_SAMPLES; k++) {
    const d = k * step, t = d / L;
    const w = w0 * Math.pow(1 - t, 1.1) + 0.45;
    hatSpine.set([x, y, a, w, d], k * 5);
    minX = Math.min(minX, x - w); maxX = Math.max(maxX, x + w); minY = Math.min(minY, y - w); maxY = Math.max(maxY, y + w);
    a = tilt + bend * t * t;
    x += Math.sin(a) * step; y -= Math.cos(a) * step;
  }
  const last = (HAT_SAMPLES - 1) * 5;
  for (let py = Math.floor(minY) - 1; py <= Math.ceil(maxY) + 1; py++) {
    if (py > clipBelow) continue;
    for (let px = Math.floor(minX) - 1; px <= Math.ceil(maxX) + 1; px++) {
      let best = -1, bestD = Infinity;
      for (let k = 0; k <= last; k += 5) {
        const dx = px - hatSpine[k], dy = py - hatSpine[k + 1];
        const e = dx * dx + dy * dy;
        if (e < bestD) { bestD = e; best = k; }
      }
      const sa = hatSpine[best + 2], w = hatSpine[best + 3], d = hatSpine[best + 4];
      const dx = px - hatSpine[best], dy = py - hatSpine[best + 1];
      const along = dx * Math.sin(sa) - dy * Math.cos(sa);
      const across = dx * Math.cos(sa) + dy * Math.sin(sa);
      if (best === 0 && along < -0.5) continue;
      if (best === last && along > 0.6) continue;
      if (Math.abs(across) > w + 0.3) continue;
      const u = across / w;
      let color;
      if (d > 0.4 && d < 2.9) color = u < -0.45 ? c('gold1') : u > 0.35 ? c('gold3') : c('gold2');
      else if (u < -0.6) color = c('robe1');
      else if (u < -0.12) color = c('robe2');
      else if (u > 0.42 && d > 3 && d < 14) color = c('robe4');
      else color = c('robe3');
      // a crease where the tip folds over
      if (d > 11 && d < 13.5 && Math.abs(u) < 0.5) color = c('robe2');
      s.pset(px, py, color);
    }
  }
  // a gold star on the cone and a bead at the tip
  const k = Math.round(8 / step) * 5;
  s.pset(hatSpine[k] + Math.cos(hatSpine[k + 2]) * 1.5, hatSpine[k + 1] + Math.sin(hatSpine[k + 2]) * 1.5, c('gold4'));
  s.pset(hatSpine[last], hatSpine[last + 1], c('gold3'));
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  // brim: a flattened ellipse, lit on top, dark underneath
  const rx = 10.5;
  for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
    const k = 1 - (dx / (rx + 0.5)) ** 2;
    if (k <= 0) continue;
    const h = Math.max(1, Math.round(2 * Math.sqrt(k)));
    const x = bx + Math.round(dx * cos), y0 = by + Math.round(dx * sin);
    for (let dy = -h + 1; dy <= 1; dy++) {
      let color = c('robe3');
      if (dy === 1) color = c('robe1');
      else if (dy === -h + 1) color = dx > -6 ? c('robe4') : c('robe3');
      if (dx < -rx * 0.55 && dy === 0) color = c('robe2');
      s.pset(x, y0 + dy, color);
    }
  }
}

export function createWizard() {
  const layer = new Surface(LAYER_W, LAYER_H, CLEAR);
  const pose = makePose();
  const shown = makePose();
  const target = makePose();
  const wizard = {
    state: 'idle', stateTime: 0,
    charge: 0, aimX: 0, aimY: -60, // aim relative to feet
    spin: 0, lookX: 1, blinkIn: 3, blinking: 0,
    hatOn: true, eyesGlow: 0, soot: 0,
    fired: false, pendingFire: null,
    shownStep: -1, tremble: 0,
    glowColor: 'cyan',
  };

  function set(state) { wizard.state = state; wizard.stateTime = 0; wizard.fired = false; }

  // Shoulder of the staff arm in feet-relative coordinates.
  const shoulder = () => ({ x: 3 + pose.lean, y: -27 + pose.bob + pose.crouch });

  function aimPose(reach) {
    const sh = shoulder();
    let dx = wizard.aimX - sh.x, dy = wizard.aimY - sh.y;
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
    if (step === wizard.shownStep) return;
    wizard.shownStep = step;
    for (const key of POSE_KEYS) shown[key] = pose[key];
    if (wizard.tremble > 0 && wizard.state === 'charge') {
      shown.lean += (step % 2 ? 1 : -1) * Math.round(wizard.tremble * 0.8);
    }
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

  /** Gem centre relative to the feet, from the pose on screen. */
  function gem() {
    const e = staffEnds(shown);
    return { x: e.tx + e.ux * 3, y: e.ty + e.uy * 3 };
  }

  function drawStaff(s, p, glow) {
    const e = staffEnds(p);
    const bx = OX + e.bx, by = OY + e.by, tx = OX + e.tx, ty = OY + e.ty;
    const px = Math.round(Math.cos(p.staff)), py = Math.round(Math.sin(p.staff));
    s.line(bx, by, tx, ty, c('wood2'));
    s.line(bx + px, by + py, tx + px, ty + py, c('wood3'));
    // knots and a leather grip wrap
    for (const k of [0.18, 0.66]) s.pset(lerp(bx, tx, k), lerp(by, ty, k), c('wood1'));
    for (const k of [0.38, 0.44, 0.5]) s.pset(lerp(bx, tx, k) + px, lerp(by, ty, k) + py, c('wood1'));
    // the claw that holds the gem
    const ux = e.ux, uy = e.uy, nx = -uy, ny = ux;
    for (const side of [-1, 1]) {
      for (let k = 0; k <= 5; k++) {
        const spread = k < 3 ? k * 0.9 : 2.7 - (k - 3) * 0.6;
        s.pset(tx + ux * k + nx * spread * side, ty + uy * k + ny * spread * side, k > 3 ? c('wood4') : c('wood3'));
      }
    }
    // the gem: a small diamond, bigger when charged
    const gx = tx + ux * 3, gy = ty + uy * 3;
    const big = glow > 0.55 ? 1 : 0;
    const shape = big ? [[0, -3, 0], [-1, -2, 1], [0, -2, 0], [1, -2, 2], [-2, -1, 1], [-1, -1, 0], [0, -1, 0], [1, -1, 1], [2, -1, 2], [-2, 0, 1], [-1, 0, 0], [0, 0, 0], [1, 0, 1], [2, 0, 2], [-1, 1, 1], [0, 1, 1], [1, 1, 2], [0, 2, 2]]
      : [[0, -2, 0], [-1, -1, 0], [0, -1, 0], [1, -1, 1], [-1, 0, 1], [0, 0, 0], [1, 0, 2], [0, 1, 2]];
    const palettes = { cyan: ['cyan5', 'cyan4', 'cyan2'], green: ['green4', 'green3', 'green2'], violet: ['violet4', 'violet3', 'violet1'] };
    const cols = (palettes[wizard.glowColor] || palettes.cyan).map(c);
    for (const [dx, dy, shade] of shape) s.pset(gx + dx, gy + dy, cols[shade]);
    return { gx, gy };
  }

  function drawArm(s, sx, sy, hx, hy, near) {
    const dx = hx - sx, dy = hy - sy, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const wx = hx - ux * 1.8, wy = hy - uy * 1.8;
    const base = near ? c('robe3') : c('robe2');
    s.thick(sx, sy, wx, wy, 4.2, base);
    // top-edge highlight along the sleeve
    if (near) s.line(sx - uy * 1.2 + ux, sy + ux * 1.2 * -1 + uy - 1, wx - uy * 1.5, wy - 1, c('robe4'));
    // bell cuff with gold trim
    s.disc(wx, wy, 2.6, base);
    const nx = -uy, ny = ux;
    for (let k = -2; k <= 2; k++) s.pset(wx + nx * k + ux * 0.8, wy + ny * k + uy * 0.8, near ? c('gold2') : c('gold1'));
    s.disc(hx, hy, 1.4, near ? c('skin2') : c('skin1'));
    s.pset(hx, hy - 1, near ? c('skin3') : c('skin2'));
  }

  function drawBody(s, p) {
    const bob = p.bob + p.crouch, L = Math.round(p.lean), sway = p.sway;
    const sy = -29 + bob;
    const pts = [
      OX - 5 + L, OY + sy, OX + 5 + L, OY + sy,
      OX + 6 + L * 0.5, OY - 17 + bob * 0.5, OX + 9 + sway, OY - 1, OX + 9 + sway, OY + 0.5,
      OX - 11 + sway * 0.6, OY + 0.5, OX - 10 + sway * 0.5, OY - 3, OX - 7, OY - 17 + bob * 0.5,
    ];
    s.poly(pts, c('robe3'));
    // Shade each row across its width: dark back, lit front edge, folds, trims.
    const top = Math.round(OY + sy), bottom = OY;
    const d = s.data, W = s.w, mark = c('robe3');
    for (let y = top; y <= bottom; y++) {
      let x0 = -1, x1 = -1;
      for (let x = OX - 16; x < OX + 16; x++) if (d[y * W + x] === mark) { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 < 0) continue;
      const span = Math.max(1, x1 - x0);
      const below = (y - (OY - 17)) / 17; // 0 at waist, 1 at hem
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / span;
        let color = c('robe3');
        if (u < 0.14) color = c('robe1');
        else if (u < 0.4) color = (u < 0.3 || ((x + y) & 1)) ? c('robe2') : c('robe3');
        else if (u > 0.9) color = c('robe4');
        // folds swing with the hem
        if (below > 0.1) {
          const fold1 = 0.55 + sway * 0.02 * below, fold2 = 0.28 + sway * 0.015 * below;
          if (Math.abs(u - fold1) < 0.5 / span + 0.02 && y % 3 !== 0) color = c('robe2');
          if (Math.abs(u - fold2) < 0.5 / span + 0.02) color = c('robe1');
          // front opening trimmed in gold
          if (Math.abs(u - 0.8) < 0.6 / span) color = c('gold2');
        }
        if (y >= bottom - 1) color = u < 0.3 ? c('gold1') : y === bottom - 1 ? c('gold3') : c('gold2');
        if (y <= top + 1 && u > 0.3) color = y === top ? c('robe4') : c('robe3');
        d[y * W + x] = color;
      }
      // belt with a buckle
      if (Math.abs(y - (OY - 17 + Math.round(bob * 0.5))) < 1) {
        for (let x = x0; x <= x1; x++) d[y * W + x] = c('wood1');
        const bx = Math.round(x0 + span * 0.78);
        d[y * W + bx] = c('gold3'); d[y * W + bx + 1] = c('gold2');
        d[(y - 1) * W + bx] = c('gold2'); d[(y + 1) * W + bx] = c('gold1');
      }
    }
    // boots
    s.rect(OX + 3 + Math.round(sway * 0.8), OY - 1, 5, 2, c('wood1'));
    s.pset(OX + 8 + Math.round(sway * 0.8), OY, c('wood1'));
    s.hline(OX + 4 + Math.round(sway * 0.8), OX + 6 + Math.round(sway * 0.8), OY - 1, c('wood2'));
    s.rect(OX - 8, OY, 4, 1, c('wood1'));
  }

  function drawBeard(s, p) {
    const bob = p.bob + p.crouch;
    const top = OY - 30 + bob, len = 15;
    for (let yy = 0; yy <= len; yy++) {
      const t = yy / len;
      const half = 4.6 * Math.pow(1 - t, 0.75) + 0.4;
      const cx = OX + 1.5 + p.lean * 0.8 + p.beard * t * t + Math.sin(yy * 0.7) * 0.35 + t * 0.8;
      const y = Math.round(top + yy);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const u = (x - (cx - half)) / (2 * half);
        let color = c('beard2');
        if (u < 0.22) color = c('beard1');
        else if (u > 0.62) color = c('beard3');
        if ((x + Math.round(yy * 0.4)) % 3 === 0 && u > 0.2 && u < 0.85) color = palette.darker[color];
        if (yy === 0 && u > 0.4) color = c('beard4');
        s.pset(x, y, color);
      }
    }
  }

  /**
   * Build the layer for this frame. `lights` gives the moon, fire and gem light in
   * layer-relative terms; the layer is returned with its origin offsets.
   */
  function draw(time, lights) {
    sample(time);
    const p = shown;
    layer.clear(CLEAR);
    const bob = p.bob + p.crouch, L = Math.round(p.lean);
    const glow = Math.max(wizard.charge, wizard.state === 'mend' ? 0.7 : 0, wizard.state === 'cast' ? 0.5 : 0);
    // far arm first, behind everything
    drawArm(layer, OX - 4 + L, OY - 27 + bob, OX + p.backX + L, OY + p.backY + bob, false);
    drawBody(layer, p);
    // head
    const dazed = wizard.state === 'singed' && wizard.stateTime > 0.5;
    const face = wizard.state === 'shock' || (wizard.state === 'singed' && !dazed) ? FACE_WIDE : wizard.eyesGlow > 0.3 ? FACE_GLOW : wizard.blinking > 0 || dazed ? FACE_BLINK : FACE;
    // whole pixels: eased pose values are fractional, and the layer is indexed by these
    const hx = OX - 5 + L, hy = Math.round(OY - 39 + bob + p.headY);
    layer.blit(face, hx, hy);
    drawBeard(layer, p);
    if (wizard.hatOn) drawHat(layer, hx + 6, hy + 1, p.hatTilt, p.hatBend);
    else {
      // tufts of white hair where the hat was
      layer.hline(hx + 1, hx + 8, hy, c('beard3'));
      layer.hline(hx + 2, hx + 6, hy - 1, c('beard2'));
      layer.pset(hx + 4, hy - 2, c('beard3'));
    }
    const { gx, gy } = drawStaff(layer, p, glow);
    drawArm(layer, OX + 3 + L, OY - 27 + bob, OX + p.gripX, OY + p.gripY, true);
    layer.outline(INK);
    // Light: a cool edge from the moon, warm from the fire, and the gem on top.
    if (lights.moon > 0) layer.rim(OX + lights.moonDX, OY + lights.moonDY, RIM.moon, lights.moon);
    if (lights.fire > 0) layer.rim(OX + lights.fireDX, OY + lights.fireDY, RIM.fire, lights.fire);
    const gemRim = 0.3 + glow * 0.9;
    layer.rim(gx, gy, glow > 0.6 ? RIM.gemHot : RIM.gem, Math.min(1, gemRim), glow > 0.6 ? 2 : 1);
    // soot from a backfired spell, heaviest on the face and beard, wearing off
    if (wizard.soot > 0) {
      const top = Math.max(0, hy - 22), bottom = Math.min(LAYER_H, hy + 26), d = layer.data;
      for (let y = top; y < bottom; y++) for (let x = 0; x < LAYER_W; x++) {
        const i = y * LAYER_W + x;
        if (d[i] === CLEAR) continue;
        const heavy = y > hy - 2 && y < hy + 14 ? 1 : 0.55;
        const k = wizard.soot * heavy;
        if (bayer(x, y) < k * 0.7) d[i] = SHADE.soot[d[i]];
        else if (bayer(x, y) < k) d[i] = SHADE.sootLight[d[i]];
      }
    }
    return layer;
  }

  return {
    wizard, pose, shown, set, update, draw, gem, layer,
    origin: { x: OX, y: OY },
    /** Hat brim position relative to the feet, for knocking it off. */
    hatPosition() { return { x: -5 + Math.round(shown.lean) + 6, y: -39 + shown.bob + shown.crouch + 1 }; },
    contains(dx, dy) { return dx > -12 && dx < 12 && dy < 2 && dy > -56; },
  };
}
