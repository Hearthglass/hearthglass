import { runPixelScene } from '../../shared/pixel-host.js';
import { Surface, CLEAR, createParticles, clamp, bayer, lerp } from '../../shared/pixel-engine.js';
import { randomGenerator } from '../../shared/random.js';
import { palette, INK, LIGHT, RAMPS, SHADE } from './palette.js';
import { createBackdrop } from './backdrop.js';
import { createMoon } from './moon.js';
import { createWizard, drawHat } from './wizard.js';
import { createObservatory } from './observatory.js';

const c = name => palette.c(name);
const FULL_CHARGE_SECONDS = 2.2;
// Held at full power this long, the spell backfires on the wizard.
const OVERLOAD_SECONDS = 3.2;
const FIREWORK_COLORS = ['cyan', 'violet', 'pink', 'gold', 'green'];
const TWIRL_FROM = new Set(['idle', 'recover', 'look', 'stretch']);
// Balanced and Detail draw on a 360-row grid; Eco keeps the chunkier 180-row look.
const ROWS = { eco: 180, balanced: 360, detail: 360 };

runPixelScene(({ params }) => {
  const random = randomGenerator(Number(params.get('seed')) || 20260926);
  const backdrop = createBackdrop(random);
  const moonCtl = createMoon(random);
  const moon = moonCtl.moon;
  const wiz = createWizard();
  const wizard = wiz.wizard;
  const tower = createObservatory(random);
  const particles = createParticles(4000);
  const attract = new Uint8Array(particles.max);
  const ramp = {};
  for (const [name, list] of Object.entries(RAMPS)) ramp[name] = particles.ramp(list);
  let hatLayer = new Surface(56, 48, CLEAR);

  let layout = null;
  // Layout scale (pixels per coarse-grid pixel), grid scale (1 or 2) and particle density.
  let K = 1, U = 1, density = 1;
  const pointer = { x: 0, y: 0, active: false };
  const charge = { active: false, target: 'sky', x: 0, y: 0, amount: 0, held: 0, full: 0, auto: 0, source: '' };
  const projectiles = Array.from({ length: 16 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, power: 0, target: 'sky', tx: 0, ty: 0, age: 0, color: 'cyan' }));
  const glows = Array.from({ length: 24 }, () => ({ alive: false, x: 0, y: 0, r: 0, strength: 0, decay: 1, luts: null }));
  const rings = Array.from({ length: 6 }, () => ({ alive: false, x: 0, y: 0, r: 0, speed: 0, life: 0, age: 0 }));
  const timers = Array.from({ length: 64 }, () => ({ alive: false, t: 0, x: 0, y: 0, power: 0, kind: '' }));
  const hat = { off: false, state: 'flying', x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, t: 0 };
  const blast = { alive: false, x: 0, y: 0, age: 0, rays: [] };
  let flash = 0, shake = 0, shakeX = 0, shakeY = 0, idle = 0, nextIdea = 14, sinceMended = 99;
  // The dock's extras: a meteor shower, and the weather over the tower.
  const meteors = Array.from({ length: 12 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, len: 0 }));
  let weather = 'clear', aurora = 0, snowDue = 0;

  const feet = () => ({ x: layout.wizardX, y: layout.groundY - 1 });
  const gemWorld = () => { const g = wiz.gem(); const f = feet(); return { x: f.x + g.x, y: f.y + g.y }; };

  function computeLayout(W, H) {
    // (a floor on the scale keeps every stride at least a pixel on a collapsed canvas)
    const k = Math.max(90, H) / 180, u = H >= 270 ? 2 : 1;
    const groundY = H - Math.max(Math.round(24 * k), Math.round(H * 0.17));
    const portrait = W < H * 0.9;
    const wizardX = Math.round(portrait ? W * 0.3 : clamp(W * 0.36, 60 * k, W * 0.42));
    return {
      W, H, k, u, groundY,
      railY: groundY - Math.round(24 * k),
      floorBack: groundY - Math.round(8 * k),
      horizonY: groundY - Math.round(H * 0.36),
      wizardX,
      brazierX: Math.max(Math.round(10 * k), wizardX - Math.round(25 * k)),
      moonX: Math.round(portrait ? W * 0.7 : W * 0.76), moonY: Math.round(H * (portrait ? 0.18 : 0.21)),
      moonR: Math.max(11, Math.round(Math.min(H, W * 1.2) * 0.09)),
      castleX: Math.round(portrait ? W * 0.72 : W * 0.5),
      villageX: Math.round(portrait ? W * 0.6 : W * 0.88),
    };
  }

  function addGlow(x, y, r, strength, decay, luts) {
    for (const g of glows) if (!g.alive) { Object.assign(g, { alive: true, x, y, r: r * K, strength, decay, luts }); return; }
  }
  function addRing(x, y, speed, life) {
    for (const r of rings) if (!r.alive) { Object.assign(r, { alive: true, x, y, r: 1, speed: speed * K, life, age: 0 }); return; }
  }
  function later(t, kind, x, y, power) {
    for (const tm of timers) if (!tm.alive) { Object.assign(tm, { alive: true, t, kind, x, y, power }); return; }
  }
  /** A particle in coarse-grid units: speeds and gravity scale with the screen. */
  function spawn(x, y, vx, vy, life, rampId, g = 0, dr = 0, kind = 0, size = 1) {
    return particles.spawn(x, y, vx * K, vy * K, life, rampId, g * K, dr, kind, size * U);
  }
  function burst(x, y, n, speed, rampName, life, g = 0, dr = 1.5, kind = 0, spread = 1) {
    n = Math.round(n * density);
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2, s = speed * (0.3 + random() * 0.7 * spread);
      spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + random() * 0.7), ramp[rampName], g, dr, kind);
    }
  }

  // ---- spells -------------------------------------------------------------------------

  function startCharge(target, x, y, source, auto = 0) {
    charge.active = true; charge.target = target; charge.x = x; charge.y = y;
    charge.amount = 0; charge.held = 0; charge.full = 0; charge.auto = auto; charge.source = source;
    wizard.charge = 0;
    wizard.glowColor = target === 'moon' ? 'cyan' : 'violet';
    wiz.set('charge');
    aimAt(x, y);
  }
  function aimAt(x, y) {
    const f = feet();
    wizard.aimX = x - f.x; wizard.aimY = y - f.y;
  }
  function release() {
    if (!charge.active) return;
    charge.active = false;
    wizard.charge = 0;
    wizard.tremble = 0;
    if (charge.target === 'moon' && moon.state !== 'intact') charge.target = 'sky';
    wiz.set('cast');
  }
  function fire() {
    const power = Math.max(0.14, charge.amount);
    const g = gemWorld();
    const p = projectiles.find(q => !q.alive);
    if (!p) return;
    const tx = charge.target === 'moon' ? moon.x : charge.x, ty = charge.target === 'moon' ? moon.y : charge.y;
    const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy) || 1;
    Object.assign(p, {
      alive: true, x: g.x, y: g.y, vx: dx / d * 140 * K, vy: dy / d * 140 * K, power, target: charge.target, tx, ty, age: 0,
      color: charge.target === 'moon' ? 'cyan' : 'violet',
    });
    // muzzle burst and recoil
    burst(g.x, g.y, 8 + Math.round(power * 26), 40 + power * 70, p.color, 0.45, 0, 3, 0);
    addGlow(g.x, g.y, 10 + power * 22, 1, 5, power > 0.6 ? LIGHT.gemHot : LIGHT.gem);
    shake = Math.max(shake, power > 0.5 ? 0.25 : 0.1);
  }

  function firework(x, y, power) {
    const a = FIREWORK_COLORS[Math.floor(random() * FIREWORK_COLORS.length)];
    let b = FIREWORK_COLORS[Math.floor(random() * FIREWORK_COLORS.length)];
    if (b === a) b = 'gold';
    const n = Math.round((26 + power * 110) * density);
    const speed = (28 + power * 42);
    for (let i = 0; i < n; i++) {
      const outer = power < 0.5 || i % 3 !== 0;
      const ang = (i / n) * Math.PI * 2 + random() * 0.15;
      const s = speed * (outer ? 0.85 + random() * 0.3 : 0.45 + random() * 0.15);
      spawn(x, y, Math.cos(ang) * s, Math.sin(ang) * s, (1.1 + random() * 0.7) * (0.8 + power * 0.5), ramp[outer ? a : b], 20, 1.3, 1);
    }
    for (let i = 0; i < (6 + power * 12) * density; i++) {
      const ang = random() * Math.PI * 2, s = speed * random() * 0.6;
      spawn(x, y, Math.cos(ang) * s, Math.sin(ang) * s, 0.8 + random(), ramp.white, 10, 1.5, 2);
    }
    addGlow(x, y, 16 + power * 30, 1, 2.2, LIGHT[a === 'cyan' ? 'gem' : a === 'green' ? 'mend' : a] || LIGHT.gem);
    if (power > 0.55) {
      const crackles = 3 + Math.round(power * 5);
      for (let i = 0; i < crackles; i++) {
        const ang = random() * Math.PI * 2, r = speed * K * (0.8 + random() * 0.5);
        later(0.75 + random() * 0.5, 'crackle', x + Math.cos(ang) * r, y + Math.sin(ang) * r + 8 * K, power);
      }
    }
    if (power > 0.9) addRing(x, y, 120, 0.45);
  }

  function hitMoon(p) {
    const result = moonCtl.hit(p.x, p.y, p.power);
    burst(p.x, p.y, 10 + Math.round(p.power * 40), 30 + p.power * 60, 'dust', 0.9, 30, 1.2, 0);
    burst(p.x, p.y, 8 + Math.round(p.power * 20), 40 + p.power * 60, 'cyan', 0.5, 0, 2, 2);
    addGlow(p.x, p.y, 12 + p.power * 20, 1, 3, LIGHT.gemHot);
    shake = Math.max(shake, 0.15 + p.power * 0.3);
    if (result === 'shatter') explode(p.x, p.y);
  }

  function explode() {
    flash = 1;
    shake = 1;
    const r = moon.r / K;
    // the flash blooms into a lens-flare star with rays, and three shockwaves race out
    Object.assign(blast, { alive: true, x: moon.x, y: moon.y, age: 0 });
    blast.rays = Array.from({ length: 22 }, (_, i) => ({ a: (i / 22) * Math.PI * 2 + (random() - 0.5) * 0.22, len: 0.3 + random() * 0.7, thick: random() < 0.3 }));
    addRing(moon.x, moon.y, 200, 0.95);
    addRing(moon.x, moon.y, 125, 1.2);
    addRing(moon.x, moon.y, 62, 0.75);
    burst(moon.x, moon.y, 220, 110, 'dust', 2.6, 8, 0.9, 0, 1.2);
    burst(moon.x, moon.y, 120, 150, 'white', 1.2, 10, 1.4, 1);
    burst(moon.x, moon.y, 60, 90, 'gold', 1.6, 12, 1.2, 2);
    burst(moon.x, moon.y, 70, 130, 'cyan', 1.1, 6, 1.6, 2);
    // moon rock: a spray of fine grit and a few coarser flecks, in the moon's own colours
    for (let i = 0, n = Math.round(150 * density); i < n; i++) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r * 0.9, s0 = 18 + Math.pow(random(), 0.6) * 120;
      spawn(moon.x + Math.cos(a) * d * K, moon.y + Math.sin(a) * d * K, Math.cos(a) * s0, Math.sin(a) * s0 - 8, 2 + random() * 2.6, ramp.rock, 16, 0.7, random() < 0.3 ? 3 : 0);
    }
    // and a slow cloud of dust that hangs where it stood
    for (let i = 0, n = Math.round(60 * density); i < n; i++) {
      const a = random() * Math.PI * 2, s0 = 6 + random() * 26;
      spawn(moon.x, moon.y, Math.cos(a) * s0, Math.sin(a) * s0, 3 + random() * 3, ramp.smoke, -1.5, 0.9, 3, 1 + (random() < 0.3 ? 1 : 0));
    }
    addGlow(moon.x, moon.y, r * 5, 1, 0.9, LIGHT.flash);
    addGlow(moon.x, moon.y, r * 7.5, 1, 0.32, LIGHT.gem);
    addGlow(moon.x, moon.y, r * 10, 0.8, 0.22, LIGHT.moonHalo);
    // fragments crack and pop as they fly
    for (let i = 0; i < 10; i++) later(0.22 + i * 0.17 + random() * 0.12, 'pop', 0, 0, 0.5 + random() * 0.5);
    // a few pieces fall as shooting stars
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (0.15 + random() * 0.7);
      spawn(moon.x, moon.y, Math.cos(a) * (40 + random() * 60) * (random() < 0.5 ? -1 : 1), Math.sin(a) * 30, 2 + random(), ramp.fire, 45, 0.2, 1);
    }
    // the wizard, not having expected quite that much
    charge.active = false;
    wizard.charge = 0;
    wiz.set('shock');
    if (wizard.hatOn) {
      const h = wiz.hatPosition(), f = feet();
      wizard.hatOn = false;
      Object.assign(hat, { off: true, state: 'flying', x: f.x + h.x, y: f.y + h.y, vx: (-22 - random() * 12) * K, vy: -125 * K, angle: -0.12, spin: -5 - random() * 3, t: 0 });
    }
  }

  function backfire() {
    const g = gemWorld(), f = feet();
    charge.active = false;
    wizard.charge = 0;
    wizard.tremble = 0;
    wizard.glowColor = 'cyan';
    wizard.soot = 1;
    wiz.set('singed');
    shake = Math.max(shake, 0.45);
    addGlow(g.x, g.y, 26, 1, 3, LIGHT.violet);
    burst(g.x, g.y, 40, 70, 'violet', 0.6, 0, 3, 2);
    burst(g.x, g.y, 30, 45, 'ember', 0.8, 20, 2, 0);
    // a sooty cloud around his head
    for (let i = 0; i < 26 * density; i++) {
      spawn(f.x + (random() - 0.5) * 14 * K, f.y - (34 + random() * 14) * K, (random() - 0.5) * 16, -6 - random() * 10, 1.2 + random() * 1.2, ramp.smoke, -3, 0.8, 3, 2);
    }
  }

  function beginMend() {
    if (!moonCtl.mend()) return;
    wizard.glowColor = 'green';
    aimAt(moon.x, moon.y);
    wiz.set('mend');
    if (hat.off && hat.state !== 'returning') { hat.state = 'returning'; hat.t = 0; hat.startX = hat.x; hat.startY = hat.y; hat.startAngle = hat.angle; }
  }

  function spotShootingStar() {
    tower.glint();
    backdrop.launchShootingStar(layout.W * (0.45 + random() * 0.45), layout.horizonY * (0.08 + random() * 0.3));
    if (wizard.state === 'idle') wiz.set('look');
  }

  // ---- the dock's spells ----------------------------------------------------------------

  const busy = () => charge.active || wizard.state === 'mend' || wizard.state === 'shock' || wizard.state === 'singed';

  /** A bolt from the staff to a point in the sky, where it bursts as a firework. */
  function launchBolt(tx, ty, power, color) {
    const p = projectiles.find(q => !q.alive);
    if (!p) return;
    const g = gemWorld();
    const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy) || 1;
    Object.assign(p, { alive: true, x: g.x, y: g.y, vx: dx / d * 140 * K, vy: dy / d * 140 * K, power, target: 'sky', tx, ty, age: 0, color });
    burst(g.x, g.y, 6 + Math.round(power * 16), 40 + power * 50, color, 0.4, 0, 3, 0);
    addGlow(g.x, g.y, 10 + power * 16, 1, 5, color === 'cyan' ? LIGHT.gem : LIGHT.violet);
    shake = Math.max(shake, 0.08);
  }

  /** A twirl of the staff, then a volley of fireworks across the sky, the last one big. */
  function fireworkShow() {
    if (busy()) return;
    idle = 0;
    wiz.set('twirl');
    const n = 8;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 6; tries++) {
        x = layout.W * (0.28 + random() * 0.68); y = layout.horizonY * (0.1 + random() * 0.55);
        if (Math.hypot(x - moon.x, y - moon.y) > moon.r + 16 * K) break;
      }
      later(0.55 + i * 0.3 + random() * 0.12, 'volley', x, y, i === n - 1 ? 1 : 0.3 + random() * 0.45);
    }
  }

  /** A burst of shooting stars from one corner of the sky; he stops to watch. */
  function meteorShower() {
    idle = 0;
    tower.glint();
    if (!busy()) wiz.set('look');
    for (let i = 0; i < 14; i++) later(0.15 + i * 0.26 + random() * 0.3, 'meteor', 0, 0, 0);
  }
  function launchMeteor() {
    const m = meteors.find(q => !q.alive);
    if (!m) return;
    // a shower has a radiant: they all come from high on the right
    const a = 0.42 + random() * 0.3, speed = (160 + random() * 120) * K;
    Object.assign(m, {
      alive: true, x: layout.W * (0.35 + random() * 0.75), y: layout.horizonY * (0.02 + random() * 0.3),
      vx: -Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, life: 0.5 + random() * 0.6, len: (16 + random() * 20) * K,
    });
  }

  /** The bats come out of the valley, a few at a time. */
  function releaseBats() {
    idle = 0;
    for (let i = 0; i < 4; i++) later(i * 0.7 + random() * 0.4, 'bats', 0, 0, 0);
    if (!busy()) wiz.set('look');
  }

  function wakeOwl() {
    idle = 0;
    if (tower.owl.state === 'perch') tower.startle();
    if (!busy()) wiz.set('look');
  }

  function setWeather(next) {
    weather = next === 'snow' || next === 'aurora' ? next : 'clear';
  }

  function updateWeather(dt) {
    aurora = clamp(aurora + (weather === 'aurora' ? dt * 0.35 : -dt * 0.5), 0, 1);
    if (weather !== 'snow') { snowDue = 0; return; }
    // flakes per second in proportion to the width; near ones fall faster and are bigger
    snowDue += dt * layout.W / K * 0.32 * density;
    for (; snowDue >= 1; snowDue--) {
      const near = random() < 0.3;
      const vy = near ? 22 + random() * 10 : 9 + random() * 7;
      const x = random() * (layout.W + 40 * K) - 20 * K;
      const life = (layout.groundY + 2 * K) / (vy * K) * (near ? 1 : 0.55 + random() * 0.45);
      spawn(x, -2, -4 + (random() - 0.5) * 6, vy, life, near ? ramp.flake : ramp.flakeFar, 0, 0, near && U > 1 ? 3 : 0, 1);
    }
  }

  // ---- scene ----------------------------------------------------------------------------

  const scene = {
    palette,
    rowsFor: quality => ROWS[quality] || ROWS.balanced,
    hint: 'Hold on the moon to charge a spell (but not for too long). Tap the sky for fireworks.',
    actionLabel: 'Cast a spell',
    actionIcon: 'wand',
    accent: '#b69cff',
    hostControls: () => [
      { id: 'action', kind: 'action', label: 'Cast a spell', icon: 'bolt', hint: 'He charges up and lets fly at the moon' },
      { id: 'fireworks', kind: 'action', label: 'Fireworks', icon: 'sparkles', hint: 'A twirl of the staff and a volley of fireworks' },
      { id: 'meteors', kind: 'action', label: 'Meteor shower', icon: 'comet', hint: 'A shower of shooting stars across the sky' },
      { id: 'bats', kind: 'action', label: 'Bats', icon: 'bat', hint: 'Send the bats out over the valley' },
      { id: 'owl', kind: 'action', label: 'Wake the owl', icon: 'owl', hint: 'The owl takes a turn around the tower' },
      { id: 'touch', kind: 'tool', capture: 'overlay', label: 'Wand', icon: 'wand', hint: 'Tap the sky for fireworks · hold to charge (on the moon for a big one) · tap the owl, brazier or lantern' },
      { id: 'add', kind: 'tool', capture: 'desktop', rapid: true, label: 'Fireflies', icon: 'firefly', hint: 'Click empty desktop to let a firefly loose there' },
      {
        id: 'sky', kind: 'choice', label: 'Sky', icon: weather === 'snow' ? 'snow' : weather === 'aurora' ? 'aurora' : 'moon',
        hint: 'The weather over the tower', value: weather,
        options: [
          { value: 'clear', label: 'Clear', icon: 'moon', hint: 'A still, starry night' },
          { value: 'snow', label: 'Snow', icon: 'snow', hint: 'Snow drifting down over the valley' },
          { value: 'aurora', label: 'Aurora', icon: 'aurora', hint: 'Northern lights over the mountains' },
        ],
      },
    ],
    control(id, value) {
      if (id === 'fireworks') fireworkShow();
      else if (id === 'meteors') meteorShower();
      else if (id === 'bats') releaseBats();
      else if (id === 'owl') wakeOwl();
      else if (id === 'sky') setWeather(value);
    },
    resize(W, H) {
      layout = computeLayout(W, H);
      K = layout.k;
      if (layout.u !== U || !hatLayer) {
        U = layout.u;
        hatLayer = new Surface(56 * U, 48 * U, CLEAR);
      }
      if (wiz.scale !== U) wiz.setScale(U);
      density = U > 1 ? 1.6 : 1;
      backdrop.build(layout);
      moonCtl.build(layout.moonX, layout.moonY, layout.moonR);
      tower.build(layout);
      particles.clear();
    },
    update(dt, time) {
      idle += dt;
      sinceMended += dt;
      backdrop.update(dt, time);
      tower.update(dt, time, pointer);
      // charge
      if (charge.active) {
        charge.held += dt;
        charge.amount = Math.min(1, charge.amount + dt / FULL_CHARGE_SECONDS);
        wizard.charge = charge.amount;
        if (charge.target === 'moon') aimAt(moon.x, moon.y);
        const g = gemWorld();
        const k = charge.amount;
        const rate = (18 + k * 90) * density;
        const spawnCount = Math.floor(rate * dt + random());
        for (let s = 0; s < spawnCount; s++) {
          const a = random() * Math.PI * 2, r = (10 + k * 16 + random() * 6) * K;
          const px = g.x + Math.cos(a) * r, py = g.y + Math.sin(a) * r;
          const i = spawn(px, py, -Math.sin(a) * (30 + k * 50), Math.cos(a) * (30 + k * 50), 0.5 + random() * 0.4, ramp[random() < 0.6 ? wizard.glowColor === 'violet' ? 'violet' : 'cyan' : 'white'], 0, 0, random() < 0.25 ? 2 : 0);
          if (i >= 0) attract[i] = 1;
        }
        if (k > 0.7 && random() < dt * 14) {
          const f = feet();
          const x = f.x + (random() - 0.5) * 40 * K;
          spawn(x, layout.groundY - 1, 0, -8 - random() * 10, 1.6 + random(), ramp.smoke, -2, 0.5, 3, 1);
        }
        if (k >= 1) {
          charge.full += dt;
          shake = Math.max(shake, 0.12 + Math.max(0, charge.full - 1.5) * 0.15);
          // the gem starts to stutter between colours before it gives out
          if (charge.full > 1.6) wizard.glowColor = Math.floor(charge.full * (6 + charge.full * 4)) % 2 ? 'violet' : 'cyan';
          if (!charge.auto && charge.full > OVERLOAD_SECONDS) backfire();
        }
        if (charge.active && charge.auto > 0 && charge.held >= charge.auto) release();
      }
      if (wizard.pendingFire) {
        const kind = wizard.pendingFire;
        wizard.pendingFire = null;
        if (kind === 'bolt') fire();
        else if (kind === 'twirl') {
          const g = gemWorld();
          burst(g.x, g.y, 30, 50, 'gold', 0.9, 20, 1.5, 2);
          burst(g.x, g.y, 20, 40, 'violet', 0.8, 10, 1.5, 0);
          addGlow(g.x, g.y, 18, 1, 2, LIGHT.gold);
          tower.flare();
        }
      }
      if (!charge.active && (wizard.state === 'idle' || wizard.state === 'twirl')) wizard.glowColor = 'cyan';
      wiz.update(dt, time);
      if (wizard.soot > 0.3 && random() < dt * 6) {
        const f = feet(), h = wiz.hatPosition();
        spawn(f.x + h.x + (random() * 4 - 2) * K, f.y + h.y - (14 + random() * 4) * K, (random() - 0.5) * 4, -8, 1.4, ramp.smoke, -2, 0.6, 3, 1);
      }
      // the brazier sends up the odd ember
      if (random() < dt * 3) {
        const b = tower.brazier;
        spawn(b.x + (random() - 0.5) * 8 * K, b.y - 16 * K, (random() - 0.5) * 6, -14 - random() * 12, 1.2 + random(), ramp.ember, -4, 0.6, 0);
      }
      // projectiles
      for (const p of projectiles) {
        if (!p.alive) continue;
        p.age += dt;
        const tx = p.target === 'moon' ? moon.x : p.tx, ty = p.target === 'moon' ? moon.y : p.ty;
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
        const speed = (150 + p.power * 90 + p.age * 120) * K;
        const q = 1 - Math.exp(-dt * 7);
        p.vx += (dx / d * speed - p.vx) * q;
        p.vy += (dy / d * speed - p.vy) * q;
        // a little corkscrew so it reads as magic, not a bullet
        const wob = Math.sin(p.age * 30) * 25 * K * (1 - p.power * 0.5);
        p.x += p.vx * dt + (-dy / d) * wob * dt;
        p.y += p.vy * dt + (dx / d) * wob * dt;
        const trail = Math.round((2 + p.power * 5) * density);
        for (let s = 0; s < trail; s++) {
          spawn(p.x + (random() - 0.5) * 2 * K, p.y + (random() - 0.5) * 2 * K, (random() - 0.5) * 20, (random() - 0.5) * 20, 0.25 + random() * 0.35 + p.power * 0.3, ramp[p.color], 0, 2, s % 4 === 0 ? 2 : 0);
        }
        if (d < (3 + p.power * 3) * K || p.age > 3) {
          p.alive = false;
          if (p.target === 'moon' && moon.state === 'intact') hitMoon(p);
          else firework(p.x, p.y, p.power);
        }
      }
      // particles, with the charge sparks pulled into the gem
      const g = gemWorld();
      pull.x = g.x; pull.y = g.y;
      particles.update(dt, attractToGem);
      for (let i = 0; i < particles.max; i++) if (!particles.alive[i]) attract[i] = 0;
      // timers
      for (const tm of timers) {
        if (!tm.alive) continue;
        tm.t -= dt;
        if (tm.t > 0) continue;
        tm.alive = false;
        if (tm.kind === 'crackle') {
          burst(tm.x, tm.y, 6, 18, 'white', 0.35, 5, 3, 2);
          addGlow(tm.x, tm.y, 6, 0.7, 4, LIGHT.gold);
        } else if (tm.kind === 'volley') launchBolt(tm.x, tm.y, tm.power, random() < 0.5 ? 'cyan' : 'violet');
        else if (tm.kind === 'pop') {
          const ch = moon.chunks[Math.floor(random() * moon.chunks.length)];
          if (ch && moon.state === 'shattered') {
            burst(ch.x, ch.y, 10 + Math.round(tm.power * 10), 26 + tm.power * 24, random() < 0.5 ? 'white' : 'cyan', 0.5, 6, 2.5, 2);
            burst(ch.x, ch.y, 6, 20, 'gold', 0.6, 10, 2, 0);
            addGlow(ch.x, ch.y, 5 + tm.power * 6, 0.8, 4, LIGHT.gem);
            shake = Math.max(shake, 0.06);
          }
        } else if (tm.kind === 'meteor') launchMeteor();
        else if (tm.kind === 'bats') backdrop.launchBats();
      }
      for (const m of meteors) {
        if (!m.alive) continue;
        m.age += dt;
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (random() < dt * 30) spawn(m.x, m.y, m.vx / K * 0.04, m.vy / K * 0.04, 0.35, ramp.white, 6, 2, 0);
        if (m.age > m.life) m.alive = false;
      }
      updateWeather(dt);
      // moon
      const mended = moonCtl.update(dt);
      if (blast.alive && (blast.age += dt) > 2.4) blast.alive = false;
      if (moon.state === 'shattered') {
        // hot pieces shed sparks and grit as they tumble
        for (const ch of moon.chunks) {
          if (ch.heat < 0.08) continue;
          if (random() < dt * (8 + ch.heat * 34) * density) {
            spawn(ch.x + (random() - 0.5) * ch.reach, ch.y + (random() - 0.5) * ch.reach, ch.vx / K * 0.15 + (random() - 0.5) * 8, ch.vy / K * 0.15 + (random() - 0.5) * 8, 0.35 + random() * 0.6, ramp[random() < 0.45 ? 'white' : 'cyan'], 4, 1.5, random() < 0.3 ? 2 : 0);
          }
          if (ch.heat > 0.3 && random() < dt * 9 * density) spawn(ch.x, ch.y, ch.vx / K * 0.05, ch.vy / K * 0.05, 1 + random(), ramp.dust, -1, 1.1, 3, 1);
        }
      }
      if (moon.state === 'shattered' && moon.sinceShatter > 4.8 && wizard.state !== 'shock') beginMend();
      if (moon.state === 'mending') {
        const g2 = gemWorld();
        if (random() < dt * 40 * density) {
          const t = random();
          spawn(lerp(g2.x, moon.x, t), lerp(g2.y, moon.y, t), (random() - 0.5) * 10, (random() - 0.5) * 10, 0.6, ramp.mend, 0, 2, random() < 0.3 ? 2 : 0);
        }
      }
      if (mended === 'mended') {
        burst(moon.x, moon.y, 70, 60, 'mend', 1.2, 0, 1.4, 2);
        burst(moon.x, moon.y, 40, 45, 'white', 0.9, 0, 1.8, 0);
        addGlow(moon.x, moon.y, moon.r / K * 3.5, 1, 1.2, LIGHT.mend);
        addRing(moon.x, moon.y, 80, 0.6);
        wiz.set('recover');
        wizard.glowColor = 'cyan';
        sinceMended = 0;
      }
      // hat
      if (hat.off) {
        hat.t += dt;
        if (hat.state === 'flying') {
          hat.vy += 260 * K * dt;
          hat.x += hat.vx * dt; hat.y += hat.vy * dt;
          hat.angle += hat.spin * dt;
          if (hat.y >= layout.groundY - 1 && hat.vy > 0) {
            hat.y = layout.groundY - 1; hat.vy = -hat.vy * 0.25; hat.vx *= 0.4; hat.spin *= 0.3;
            if (Math.abs(hat.vy) < 12 * K) { hat.state = 'landed'; hat.vy = 0; hat.vx = 0; }
          }
          if (hat.t > 7) { hat.state = 'returning'; hat.t = 0; hat.startX = hat.x; hat.startY = hat.y; hat.startAngle = hat.angle; }
        } else if (hat.state === 'landed') {
          hat.angle = lerp(hat.angle, Math.round(hat.angle / Math.PI) * Math.PI + 0.35, 1 - Math.exp(-dt * 6));
          if (hat.t > 7) { hat.state = 'returning'; hat.t = 0; hat.startX = hat.x; hat.startY = hat.y; hat.startAngle = hat.angle; }
        } else if (hat.state === 'returning') {
          const q = clamp(hat.t / 1.3, 0, 1);
          const e = q * q * (3 - 2 * q);
          const h = wiz.hatPosition(), f = feet();
          const tx = f.x + h.x, ty = f.y + h.y;
          hat.x = lerp(hat.startX, tx, e); hat.y = lerp(hat.startY, ty, e) - Math.sin(e * Math.PI) * 18 * K;
          const turns = Math.round(hat.startAngle / (Math.PI * 2));
          hat.angle = lerp(hat.startAngle, turns * Math.PI * 2 - 0.12, e);
          if (random() < dt * 30) spawn(hat.x + (random() - 0.5) * 10 * K, hat.y - random() * 10 * K, 0, -6, 0.6, ramp.gold, 0, 1, 2);
          if (q >= 1) { hat.off = false; wizard.hatOn = true; }
        }
      }
      // effects
      flash = Math.max(0, flash - dt * 1.4);
      shake = Math.max(0, shake - dt * 1.4);
      for (const gl of glows) if (gl.alive && (gl.strength -= gl.decay * dt) <= 0) gl.alive = false;
      for (const r of rings) if (r.alive) { r.age += dt; r.r += r.speed * dt; if (r.age > r.life) r.alive = false; }
      // A wizard left alone amuses himself now and then.
      if (!charge.active && wizard.state === 'idle' && moon.state === 'intact') {
        nextIdea -= dt;
        if (nextIdea <= 0 && idle > 10) {
          nextIdea = 14 + random() * 22;
          const roll = random();
          if (roll < 0.45) {
            const x = layout.W * (0.35 + random() * 0.6), y = layout.horizonY * (0.15 + random() * 0.6);
            if (Math.hypot(x - moon.x, y - moon.y) > moon.r + 14 * K) startCharge('sky', x, y, 'idle', 0.5 + random() * 1.4);
          } else if (roll < 0.58) wiz.set('twirl');
          else if (roll < 0.7 && tower.owl.state === 'perch') { tower.startle(); wiz.set('look'); }
          else if (roll < 0.8) wiz.set('stretch');
          else if (roll < 0.9) spotShootingStar();
          else tower.spinOrrery();
        }
      }
    },
    render(s, time) {
      const L = layout;
      backdrop.drawSky(s, moon.state === 'intact');
      backdrop.drawStars(s, time, flash > 0.5 ? 1 : 0);
      moonCtl.draw(s, time);
      if (aurora > 0) drawAurora(s, time, aurora);
      drawMeteors(s);
      backdrop.drawClouds(s);
      // moonlight on the clouds around it; clouds across its face stay dark, backlit
      if (moon.state === 'intact') s.glow(moon.x, moon.y, moon.r * 2.1, LIGHT.moon, 0.8, 1, 1, moon.r + 0.6);
      backdrop.drawLand(s, time);
      backdrop.drawBats(s, time);
      tower.drawWall(s);
      tower.drawLights(s, time);
      const f = feet();
      // his shadow on the flagstones
      s.glow(f.x - 2 * K, L.groundY - 2 * K, 17 * K, SHADOW, 1.4, 1, 0.22);
      // rune circle behind the feet
      const runes = charge.active ? charge.amount : wizard.state === 'mend' ? 0.8 : 0;
      if (runes > 0) drawRunes(s, f.x, L.groundY - 2 * K, runes, time, false);
      tower.drawBrazier(s, time);
      tower.drawProps(s, time);
      tower.drawOwl(s, time);
      // the wizard
      const fire = tower.fireIntensity(time);
      const layer = wiz.draw(time, {
        moon: moon.state === 'intact' ? 1 : 0, moonDX: moon.x - f.x, moonDY: moon.y - f.y,
        blast: blast.alive ? clamp(1 - blast.age / 1.1, 0, 1) : 0,
        fire: clamp((fire - 0.35) * 0.9, 0, 0.8), fireDX: tower.brazier.x - f.x, fireDY: tower.brazier.y - 14 * K - f.y,
      });
      s.blit(layer, f.x - wiz.origin.x, f.y - wiz.origin.y);
      if (runes > 0) drawRunes(s, f.x, L.groundY - 2 * K, runes, time, true);
      if (hat.off) drawLooseHat(s);
      // beam while mending
      if (wizard.state === 'mend' && moon.state === 'mending') drawBeam(s, time);
      // bolts
      for (const p of projectiles) {
        if (!p.alive) continue;
        const r = (1 + p.power * 2.2) * U;
        s.disc(p.x, p.y, r + U, p.color === 'cyan' ? c('cyan3') : c('violet3'));
        s.disc(p.x, p.y, r, p.color === 'cyan' ? c('cyan5') : c('violet4'));
        s.disc(p.x, p.y, U - 1, c('star4'));
      }
      particles.draw(s);
      tower.drawFireflies(s);
      // light
      tower.lightFire(s, time);
      const g = gemWorld();
      const k = Math.max(wizard.charge, wizard.state === 'mend' ? 0.75 : 0.15 + Math.sin(time * 2.4) * 0.05);
      s.glow(g.x, g.y, (8 + k * 22) * K, wizard.glowColor === 'green' ? LIGHT.mend : wizard.glowColor === 'violet' ? LIGHT.violet : k > 0.75 ? LIGHT.gemHot : LIGHT.gem, 0.55 + k * 0.6);
      for (const p of projectiles) if (p.alive) s.glow(p.x, p.y, (7 + p.power * 12) * K, p.color === 'cyan' ? LIGHT.gem : LIGHT.violet, 0.9);
      for (const ch of moon.chunks) if (moon.state !== 'intact' && ch.heat > 0.25) s.glow(ch.x, ch.y, ch.reach * 1.3 + 2 * U, LIGHT.gem, ch.heat * 0.22);
      for (const gl of glows) if (gl.alive) s.glow(gl.x, gl.y, gl.r, gl.luts, gl.strength);
      if (blast.alive) drawBlast(s);
      if (charge.active && charge.amount >= 1) drawArcs(s, g.x, g.y, time);
      for (const r of rings) if (r.alive) drawShock(s, r);
      if (flash > 0) mapAll(s, LIGHT.flash, flash * flash * 0.7);
      if (shake > 0) {
        const step = Math.floor(time * 30);
        const amp = Math.ceil(shake * 3);
        shakeX = ((step * 7919) % 3 - 1) * Math.min(amp, 3) * U;
        shakeY = ((step * 104729) % 3 - 1) * Math.min(amp, 2) * U;
        shift(s, shakeX, shakeY);
      }
    },
    press(x, y, info) {
      idle = 0;
      pointer.x = x; pointer.y = y; pointer.active = true;
      const f = feet();
      if (tower.containsOwl(x, y)) { tower.startle(); if (wizard.state === 'idle') wiz.set('look'); return true; }
      if (tower.containsBrazier(x, y)) { tower.flare(); burst(tower.brazier.x, tower.brazier.y - 16 * K, 24, 40, 'ember', 1.2, -30, 1, 0); return true; }
      if (tower.containsLantern(x, y)) { tower.swingLantern(); return true; }
      if (wiz.contains(x - f.x, y - f.y) && !charge.active) { if (TWIRL_FROM.has(wizard.state)) wiz.set('twirl'); return true; }
      if (tower.containsOrrery(x, y)) { tower.spinOrrery(); return true; }
      if (tower.containsTelescope(x, y)) { spotShootingStar(); return true; }
      if (moon.state === 'shattered' && Math.hypot(x - moon.x, y - moon.y) < moon.r * 4 && moon.sinceShatter > 1.2) { beginMend(); return true; }
      if (moon.state === 'mending' || wizard.state === 'mend' || wizard.state === 'shock') return true;
      if (moonCtl.contains(x, y, 3 * K)) { startCharge('moon', moon.x, moon.y, info.source); return true; }
      if (y < L().groundY - 16 * K) { startCharge('sky', x, y, info.source); return true; }
      return false;
    },
    move(x, y, held) {
      pointer.x = x; pointer.y = y; pointer.active = true;
      if (charge.active && charge.target === 'sky' && held) { charge.x = x; charge.y = Math.min(y, L().groundY - 16 * K); aimAt(charge.x, charge.y); }
    },
    release() { if (charge.active && !charge.auto) release(); },
    cancel() { if (charge.active && !charge.auto) release(); },
    leave() { pointer.active = false; },
    action() {
      idle = 0;
      if (moon.state === 'shattered') { beginMend(); return; }
      if (moon.state !== 'intact' || charge.active) return;
      startCharge('moon', moon.x, moon.y, 'action', FULL_CHARGE_SECONDS + 0.4);
    },
    // The host's "Add a fish" means one more firefly here.
    addCreature(x, y) { return tower.addFirefly(x, y); },
    cursor(x, y) {
      const f = feet();
      if (tower.containsOwl(x, y) || tower.containsBrazier(x, y) || tower.containsLantern(x, y) || tower.containsOrrery(x, y) ||
        tower.containsTelescope(x, y) || moonCtl.contains(x, y, 3 * K) || wiz.contains(x - f.x, y - f.y)) return 'pointer';
      return y < L().groundY - 16 * K ? 'crosshair' : 'default';
    },
    debug: {
      moonCtl, wiz, tower, backdrop, particles, firework, meteors, projectiles,
      get weather() { return weather; }, get aurora() { return aurora; }, get layout() { return layout; },
    },
    stats() { return { moon: moon.state, hp: Math.round(moon.hp), wizard: wizard.state, weather, particles: particles.count }; },
  };
  const L = () => layout;
  const SHADOW = [SHADE.shadow];
  // The charge sparks' field, made once: spring toward the gem, damped, absorbed on arrival.
  const pull = { x: 0, y: 0 };
  function attractToGem(i, step) {
    if (!attract[i] || particles.age[i] < step * 1.5) return;
    const dx = pull.x - particles.x[i], dy = pull.y - particles.y[i];
    const damp = Math.exp(-3 * step);
    particles.vx[i] = (particles.vx[i] + dx * 22 * step) * damp;
    particles.vy[i] = (particles.vy[i] + dy * 22 * step) * damp;
    if (dx * dx + dy * dy < 2 * K * K) { particles.kill(i); attract[i] = 0; }
  }
  const RUNE_COLORS = {
    green: [c('green3'), c('green4')], violet: [c('violet2'), c('violet4')], cyan: [c('cyan2'), c('cyan4')],
  };

  // ---- drawing helpers --------------------------------------------------------------------

  function drawRunes(s, cx, cy, k, time, front) {
    const rx = (14 + k * 7) * K, ry = (3 + k * 1.5) * K;
    const color = RUNE_COLORS[wizard.glowColor] || RUNE_COLORS.cyan;
    for (let ring = 0; ring < (k > 0.5 ? 2 : 1); ring++) {
      const r = ring ? 0.62 : 1, dir = ring ? -1 : 1;
      const steps = Math.round(rx * r * 6);
      for (let n = 0; n < steps; n++) {
        const a = (n / steps) * Math.PI * 2;
        const sin = Math.sin(a);
        if ((sin > 0) !== front) continue;
        const dash = Math.floor((a + dir * time * 1.6) / 0.28) % 3;
        if (dash === 2) continue;
        s.pset(cx + Math.cos(a) * rx * r, cy + sin * ry * r, dash === 0 ? color[1] : color[0]);
        // on the fine grid, glyph ticks stand up from the outer ring
        if (U > 1 && ring === 0 && dash === 0 && n % 5 === 0) s.pset(cx + Math.cos(a) * rx, cy + sin * ry - 1, color[1]);
      }
    }
    if (!front) s.glow(cx, cy, rx + 6 * K, wizard.glowColor === 'green' ? LIGHT.mend : wizard.glowColor === 'violet' ? LIGHT.violet : LIGHT.gem, k * 0.7, 1, 0.35);
  }

  function drawBeam(s, time) {
    const g = gemWorld();
    const dx = moon.x - g.x, dy = moon.y - g.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const steps = Math.round(len);
    const step = Math.floor(time * 20);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      for (const strand of [0, Math.PI]) {
        const w = Math.sin(t * 14 - time * 12 + strand) * 2.2 * K * Math.sin(t * Math.PI);
        const x = g.x + dx * t + nx * w, y = g.y + dy * t + ny * w;
        s.pset(x, y, (i + step) % 5 === 0 ? c('star4') : strand ? c('green3') : c('cyan4'));
      }
    }
    for (let i = 0; i <= 6; i++) s.glow(g.x + dx * i / 6, g.y + dy * i / 6, 9 * K, LIGHT.mend, 0.55);
  }

  function drawMeteors(s) {
    const cols = [c('star4'), c('star3'), c('star2'), c('star1'), c('star0')];
    for (const m of meteors) {
      if (!m.alive) continue;
      const t = m.age / m.life, speed = Math.hypot(m.vx, m.vy) || 1;
      const ux = m.vx / speed, uy = m.vy / speed;
      const len = m.len * Math.min(1, m.age * 8);
      const fade = t > 0.65 ? 1 + Math.floor((t - 0.65) / 0.35 * 3) : 0;
      for (let i = 0; i < len; i++) {
        const k = Math.floor(i / len * 5) + fade;
        if (k > 4) break;
        s.pset(m.x - ux * i, m.y - uy * i, cols[k]);
        if (U > 1 && i < len * 0.35) s.pset(m.x - ux * i, m.y - uy * i + 1, cols[Math.min(4, k + 1)]);
      }
      s.glow(m.x, m.y, 5 * K, LIGHT.moon, 1 - t);
    }
  }

  // Curtains of light above the mountains: a wavering green hem with violet tops, rayed
  // into fine vertical folds, drawn as light over whatever sky is behind.
  function drawAurora(s, time, strength) {
    const { W, horizonY } = layout;
    const green = LIGHT.mend, violet = LIGHT.violet;
    for (let x = 0; x < W; x++) {
      const X = x / K;
      const base = horizonY * 0.62 + (Math.sin(X * 0.021 + time * 0.13) * 16 + Math.sin(X * 0.057 - time * 0.21) * 6) * K;
      const height = (30 + 16 * Math.sin(X * 0.031 + time * 0.17) + 8 * Math.sin(X * 0.09 - time * 0.4)) * K;
      const band = 0.55 + 0.45 * Math.sin(X * 0.013 - time * 0.09) * Math.sin(X * 0.041 + time * 0.23 + 1.3);
      const rays = 0.55 + 0.45 * Math.sin(X * 0.75 + Math.sin(X * 0.05 + time * 0.8) * 3);
      const bright = band * rays * strength;
      if (bright <= 0.04) continue;
      const top = Math.max(0, Math.floor(base - height)), bottom = Math.min(horizonY + 20 * K, Math.ceil(base));
      for (let y = top; y <= bottom; y++) {
        const f = (base - y) / height;
        if (f <= 0 || f >= 1) continue;
        const shape = f < 0.12 ? f / 0.12 : Math.pow(1 - (f - 0.12) / 0.88, 1.6);
        const level = shape * bright * 4;
        let k = Math.floor(level);
        if (level - k > bayer(x, y)) k++;
        if (k <= 0) continue;
        const luts = f > 0.62 ? violet : green;
        s.pmap(x, y, luts[Math.min(luts.length - 1, k - 1)]);
      }
    }
  }

  function drawArcs(s, gx, gy, time) {
    const step = Math.floor(time * 20);
    let seed = step * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let n = 0; n < 3; n++) {
      let x = gx, y = gy;
      const a = rnd() * Math.PI * 2, len = (8 + rnd() * 14) * K;
      for (let i = 0; i < len; i += 2) {
        const nx = x + Math.cos(a) * 2 + (rnd() - 0.5) * 3, ny = y + Math.sin(a) * 2 + (rnd() - 0.5) * 3;
        s.line(x, y, nx, ny, i < 4 * K ? c('star4') : c('cyan4'));
        x = nx; y = ny;
      }
    }
  }

  /** The moment of the blast: a white core, a four-point star, diagonal flares and thin rays. */
  function drawBlast(s) {
    const t = blast.age, flare = LIGHT.flash;
    const grow = 1 - (1 - clamp(t / 0.2, 0, 1)) ** 3;
    const fade = clamp(1 - t / 1.1, 0, 1);
    const reach = layout.W * 0.3 * grow * (0.35 + fade * 0.65);
    const core = clamp(1 - t / 0.4, 0, 1);
    if (core > 0) {
      s.disc(blast.x, blast.y, moon.r * (0.3 + core * 1.1), c('star4'));
      s.disc(blast.x, blast.y, moon.r * core * 0.6, c('star4'));
    }
    if (fade <= 0) return;
    const lit = (x, y, level, luts) => {
      let k = Math.floor(level);
      if (level - k > bayer(x, y)) k++;
      if (k > 0) s.pmap(x, y, luts[Math.min(luts.length, k) - 1]);
    };
    // the star: two long spikes and two short ones, plus diagonals, tapering to nothing
    for (const [dx, dy, len] of [[1, 0, 1], [-1, 0, 1], [0, 1, 0.55], [0, -1, 0.55], [0.707, 0.707, 0.34], [-0.707, 0.707, 0.34], [0.707, -0.707, 0.34], [-0.707, -0.707, 0.34]]) {
      const L = reach * len, halfW = (dx && dy ? 0.7 : 1.4) * U;
      for (let i = 0; i < L; i++) {
        const q = 1 - i / L, x = blast.x + dx * i, y = blast.y + dy * i;
        const w = Math.round(halfW * q * q * (2 + fade));
        for (let o = -w; o <= w; o++) lit(Math.round(x - dy * o), Math.round(y + dx * o), q * q * 4 * fade * (1 - Math.abs(o) / (w + 1) * 0.6), flare);
      }
    }
    // thin rays fanning out from the core
    for (const ray of blast.rays) {
      const L = moon.r * (2 + ray.len * 9) * grow, cos = Math.cos(ray.a), sin = Math.sin(ray.a);
      for (let i = moon.r * 0.6; i < L; i++) {
        const q = 1 - i / L, x = Math.round(blast.x + cos * i), y = Math.round(blast.y + sin * i);
        lit(x, y, q * 2.6 * fade * fade, flare);
        if (ray.thick) lit(x + 1, y, q * 1.4 * fade * fade, LIGHT.gem);
      }
    }
  }

  function drawShock(s, r) {
    const fade = 1 - r.age / r.life;
    const steps = Math.max(12, Math.round(r.r * 7));
    const thick = Math.max(1, Math.round(fade * 1.6 * U));
    for (let n = 0; n < steps; n++) {
      const a = (n / steps) * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
      const x = r.x + cos * r.r, y = r.y + sin * r.r;
      s.pmap(x, y, fade > 0.5 ? LIGHT.flash[3] : LIGHT.flash[1]);
      // a trailing wake behind the front, thinning out, and a cool fringe ahead of it
      for (let w = 1; w <= thick * 2; w++) if (w <= thick || bayer(n, w) < fade) s.pmap(x - cos * w, y - sin * w, w <= thick ? LIGHT.flash[2] : LIGHT.flash[0]);
      if (fade > 0.3) s.pmap(x + cos, y + sin, LIGHT.gem[fade > 0.6 ? 2 : 0]);
    }
  }

  function drawLooseHat(s) {
    hatLayer.clear(CLEAR);
    drawHat(hatLayer, 28 * U, 34 * U, hat.angle, -1.6 + Math.sin(hat.t * 9) * 0.15, 99 * U, U);
    hatLayer.outline(INK);
    s.blit(hatLayer, Math.round(hat.x) - 28 * U, Math.round(hat.y) - 34 * U);
  }

  function mapAll(s, luts, strength) {
    const d = s.data, w = s.w, n = luts.length;
    const level = strength * n;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < w; x++) {
      let k = Math.floor(level);
      if (level - k > bayer(x, y)) k++;
      if (k > 0) { const i = y * w + x; d[i] = luts[Math.min(n, k) - 1][d[i]]; }
    }
  }

  function shift(s, dx, dy) {
    if (!dx && !dy) return;
    const w = s.w, h = s.h, d = s.data;
    if (dy > 0) d.copyWithin(dy * w, 0, (h - dy) * w);
    else if (dy < 0) d.copyWithin(0, -dy * w, h * w);
    if (dx) for (let y = 0; y < h; y++) {
      const row = y * w;
      if (dx > 0) d.copyWithin(row + dx, row, row + w - dx);
      else d.copyWithin(row, row - dx, row + w);
    }
  }

  return scene;
});
