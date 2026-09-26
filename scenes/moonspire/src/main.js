import { runPixelScene } from '../../shared/pixel-host.js';
import { Surface, CLEAR, createParticles, clamp, bayer, lerp } from '../../shared/pixel-engine.js';
import { randomGenerator } from '../../shared/random.js';
import { palette, INK, LIGHT, RAMPS } from './palette.js';
import { createBackdrop } from './backdrop.js';
import { createMoon } from './moon.js';
import { createWizard, drawHat, LAYER_W, LAYER_H } from './wizard.js';
import { createRampart } from './rampart.js';

const c = name => palette.c(name);
const FULL_CHARGE_SECONDS = 2.2;
// Held at full power this long, the spell backfires on the wizard.
const OVERLOAD_SECONDS = 3.2;
const FIREWORK_COLORS = ['cyan', 'violet', 'pink', 'gold', 'green'];
const TWIRL_FROM = new Set(['idle', 'recover', 'look', 'stretch']);

runPixelScene(({ params }) => {
  const random = randomGenerator(Number(params.get('seed')) || 20260926);
  const backdrop = createBackdrop(random);
  const moonCtl = createMoon(random);
  const moon = moonCtl.moon;
  const wiz = createWizard();
  const wizard = wiz.wizard;
  const rampart = createRampart(random);
  const particles = createParticles(2400);
  const attract = new Uint8Array(particles.max);
  const ramp = {};
  for (const [name, list] of Object.entries(RAMPS)) ramp[name] = particles.ramp(list);
  const hatLayer = new Surface(56, 48, CLEAR);

  let layout = null;
  const pointer = { x: 0, y: 0, active: false };
  const charge = { active: false, target: 'sky', x: 0, y: 0, amount: 0, held: 0, full: 0, auto: 0, source: '' };
  const projectiles = Array.from({ length: 16 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, power: 0, target: 'sky', tx: 0, ty: 0, age: 0, color: 'cyan' }));
  const glows = Array.from({ length: 24 }, () => ({ alive: false, x: 0, y: 0, r: 0, strength: 0, decay: 1, luts: null }));
  const rings = Array.from({ length: 6 }, () => ({ alive: false, x: 0, y: 0, r: 0, speed: 0, life: 0, age: 0 }));
  const timers = Array.from({ length: 24 }, () => ({ alive: false, t: 0, x: 0, y: 0, power: 0, kind: '' }));
  const hat = { off: false, state: 'flying', x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, t: 0 };
  let flash = 0, shake = 0, shakeX = 0, shakeY = 0, idle = 0, nextIdea = 14, sinceMended = 99;

  const feet = () => ({ x: layout.wizardX, y: layout.groundY - 1 });
  const gemWorld = () => { const g = wiz.gem(); const f = feet(); return { x: f.x + g.x, y: f.y + g.y }; };

  function computeLayout(W, H) {
    const groundY = H - Math.max(24, Math.round(H * 0.17));
    const portrait = W < H * 0.9;
    const wizardX = Math.round(portrait ? W * 0.32 : clamp(W * 0.27, 52, W * 0.4));
    const moonR = Math.max(11, Math.round(Math.min(H, W * 1.2) * 0.095));
    return {
      W, H, groundY,
      horizonY: groundY - Math.round(H * 0.3),
      wizardX,
      brazierX: Math.max(10, wizardX - 32),
      moonX: Math.round(portrait ? W * 0.68 : W * 0.74), moonY: Math.round(H * (portrait ? 0.2 : 0.23)), moonR,
      castleX: Math.round(portrait ? W * 0.72 : W * 0.54),
    };
  }

  function addGlow(x, y, r, strength, decay, luts) {
    for (const g of glows) if (!g.alive) { Object.assign(g, { alive: true, x, y, r, strength, decay, luts }); return; }
  }
  function addRing(x, y, speed, life) {
    for (const r of rings) if (!r.alive) { Object.assign(r, { alive: true, x, y, r: 1, speed, life, age: 0 }); return; }
  }
  function later(t, kind, x, y, power) {
    for (const tm of timers) if (!tm.alive) { Object.assign(tm, { alive: true, t, kind, x, y, power }); return; }
  }
  function burst(x, y, n, speed, rampName, life, g = 0, dr = 1.5, kind = 0, spread = 1) {
    for (let k = 0; k < n; k++) {
      const a = random() * Math.PI * 2, s = speed * (0.3 + random() * 0.7 * spread);
      particles.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + random() * 0.7), ramp[rampName], g, dr, kind);
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
      alive: true, x: g.x, y: g.y, vx: dx / d * 140, vy: dy / d * 140, power, target: charge.target, tx, ty, age: 0,
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
    const n = 26 + Math.round(power * 110);
    const speed = (28 + power * 42);
    for (let k = 0; k < n; k++) {
      const outer = power < 0.5 || k % 3 !== 0;
      const ang = (k / n) * Math.PI * 2 + random() * 0.15;
      const s = speed * (outer ? 0.85 + random() * 0.3 : 0.45 + random() * 0.15);
      particles.spawn(x, y, Math.cos(ang) * s, Math.sin(ang) * s, (1.1 + random() * 0.7) * (0.8 + power * 0.5), ramp[outer ? a : b], 20, 1.3, 1);
    }
    for (let k = 0; k < 6 + power * 12; k++) {
      const ang = random() * Math.PI * 2, s = speed * random() * 0.6;
      particles.spawn(x, y, Math.cos(ang) * s, Math.sin(ang) * s, 0.8 + random(), ramp.white, 10, 1.5, 2);
    }
    addGlow(x, y, 16 + power * 30, 1, 2.2, LIGHT[a === 'cyan' ? 'gem' : a === 'green' ? 'mend' : a] || LIGHT.gem);
    if (power > 0.55) {
      const crackles = 3 + Math.round(power * 5);
      for (let k = 0; k < crackles; k++) {
        const ang = random() * Math.PI * 2, r = speed * (0.8 + random() * 0.5);
        later(0.75 + random() * 0.5, 'crackle', x + Math.cos(ang) * r, y + Math.sin(ang) * r + 8, power);
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

  function explode(x, y) {
    flash = 1;
    shake = 1;
    addRing(moon.x, moon.y, 170, 0.9);
    addRing(moon.x, moon.y, 95, 1.1);
    burst(moon.x, moon.y, 220, 110, 'dust', 2.6, 8, 0.9, 0, 1.2);
    burst(moon.x, moon.y, 120, 150, 'white', 1.2, 10, 1.4, 1);
    burst(moon.x, moon.y, 60, 90, 'gold', 1.6, 12, 1.2, 2);
    addGlow(moon.x, moon.y, moon.r * 5, 1, 0.9, LIGHT.flash);
    // a few pieces fall as shooting stars
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * (0.15 + random() * 0.7);
      particles.spawn(moon.x, moon.y, Math.cos(a) * (40 + random() * 60) * (random() < 0.5 ? -1 : 1), Math.sin(a) * 30, 2 + random(), ramp.fire, 45, 0.2, 1);
    }
    // the wizard, not having expected quite that much
    charge.active = false;
    wizard.charge = 0;
    wiz.set('shock');
    if (wizard.hatOn) {
      const h = wiz.hatPosition(), f = feet();
      wizard.hatOn = false;
      Object.assign(hat, { off: true, state: 'flying', x: f.x + h.x, y: f.y + h.y, vx: -22 - random() * 12, vy: -125, angle: -0.12, spin: -5 - random() * 3, t: 0 });
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
    for (let k = 0; k < 26; k++) {
      particles.spawn(f.x + (random() - 0.5) * 14, f.y - 34 - random() * 14, (random() - 0.5) * 16, -6 - random() * 10, 1.2 + random() * 1.2, ramp.smoke, -3, 0.8, 3, 2);
    }
  }

  function beginMend() {
    if (!moonCtl.mend()) return;
    wizard.glowColor = 'green';
    aimAt(moon.x, moon.y);
    wiz.set('mend');
    if (hat.off && hat.state !== 'returning') { hat.state = 'returning'; hat.t = 0; hat.startX = hat.x; hat.startY = hat.y; hat.startAngle = hat.angle; }
  }

  // ---- scene ----------------------------------------------------------------------------

  const scene = {
    palette,
    hint: 'Hold on the moon to charge a spell (but not for too long). Tap the sky for fireworks.',
    actionLabel: 'Cast a spell',
    actionIcon: 'wand',
    resize(W, H) {
      layout = computeLayout(W, H);
      backdrop.build(layout);
      moonCtl.build(layout.moonX, layout.moonY, layout.moonR);
      rampart.build(layout);
    },
    update(dt, time) {
      idle += dt;
      sinceMended += dt;
      backdrop.update(dt, time);
      rampart.update(dt, time, pointer);
      // charge
      if (charge.active) {
        charge.held += dt;
        charge.amount = Math.min(1, charge.amount + dt / FULL_CHARGE_SECONDS);
        wizard.charge = charge.amount;
        if (charge.target === 'moon') aimAt(moon.x, moon.y);
        const g = gemWorld();
        const k = charge.amount;
        const rate = 18 + k * 90;
        const spawnCount = Math.floor(rate * dt + random());
        for (let s = 0; s < spawnCount; s++) {
          const a = random() * Math.PI * 2, r = 10 + k * 16 + random() * 6;
          const px = g.x + Math.cos(a) * r, py = g.y + Math.sin(a) * r;
          const i = particles.spawn(px, py, -Math.sin(a) * (30 + k * 50), Math.cos(a) * (30 + k * 50), 0.5 + random() * 0.4, ramp[random() < 0.6 ? wizard.glowColor === 'violet' ? 'violet' : 'cyan' : 'white'], 0, 0, random() < 0.25 ? 2 : 0);
          if (i >= 0) attract[i] = 1;
        }
        if (k > 0.7 && random() < dt * 14) {
          const f = feet();
          const x = f.x + (random() - 0.5) * 40;
          particles.spawn(x, layout.groundY - 1, 0, -8 - random() * 10, 1.6 + random(), ramp.smoke, -2, 0.5, 3, 1);
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
          rampart.flare();
        }
      }
      if (!charge.active && (wizard.state === 'idle' || wizard.state === 'twirl')) wizard.glowColor = 'cyan';
      wiz.update(dt, time);
      if (wizard.soot > 0.3 && random() < dt * 6) {
        const f = feet(), h = wiz.hatPosition();
        particles.spawn(f.x + h.x - 2 + random() * 4, f.y + h.y - 14 - random() * 4, (random() - 0.5) * 4, -8, 1.4, ramp.smoke, -2, 0.6, 3, 1);
      }
      // projectiles
      for (const p of projectiles) {
        if (!p.alive) continue;
        p.age += dt;
        const tx = p.target === 'moon' ? moon.x : p.tx, ty = p.target === 'moon' ? moon.y : p.ty;
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
        const speed = 150 + p.power * 90 + p.age * 120;
        const k = 1 - Math.exp(-dt * 7);
        p.vx += (dx / d * speed - p.vx) * k;
        p.vy += (dy / d * speed - p.vy) * k;
        // a little corkscrew so it reads as magic, not a bullet
        const wob = Math.sin(p.age * 30) * 25 * (1 - p.power * 0.5);
        p.x += p.vx * dt + (-dy / d) * wob * dt;
        p.y += p.vy * dt + (dx / d) * wob * dt;
        const trail = 2 + Math.round(p.power * 5);
        for (let s = 0; s < trail; s++) {
          particles.spawn(p.x + (random() - 0.5) * 2, p.y + (random() - 0.5) * 2, (random() - 0.5) * 20, (random() - 0.5) * 20, 0.25 + random() * 0.35 + p.power * 0.3, ramp[p.color], 0, 2, s % 4 === 0 ? 2 : 0);
        }
        if (d < 3 + p.power * 3 || p.age > 3) {
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
        }
      }
      // moon
      const mended = moonCtl.update(dt);
      if (moon.state === 'shattered' && moon.sinceShatter > 4.8 && wizard.state !== 'shock') beginMend();
      if (moon.state === 'mending') {
        const g2 = gemWorld();
        if (random() < dt * 40) {
          const t = random();
          particles.spawn(lerp(g2.x, moon.x, t), lerp(g2.y, moon.y, t), (random() - 0.5) * 10, (random() - 0.5) * 10, 0.6, ramp.mend, 0, 2, random() < 0.3 ? 2 : 0);
        }
      }
      if (mended === 'mended') {
        burst(moon.x, moon.y, 70, 60, 'mend', 1.2, 0, 1.4, 2);
        burst(moon.x, moon.y, 40, 45, 'white', 0.9, 0, 1.8, 0);
        addGlow(moon.x, moon.y, moon.r * 3.5, 1, 1.2, LIGHT.mend);
        addRing(moon.x, moon.y, 80, 0.6);
        wiz.set('recover');
        wizard.glowColor = 'cyan';
        sinceMended = 0;
      }
      // hat
      if (hat.off) {
        hat.t += dt;
        if (hat.state === 'flying') {
          hat.vy += 260 * dt;
          hat.x += hat.vx * dt; hat.y += hat.vy * dt;
          hat.angle += hat.spin * dt;
          if (hat.y >= layout.groundY - 1 && hat.vy > 0) {
            hat.y = layout.groundY - 1; hat.vy = -hat.vy * 0.25; hat.vx *= 0.4; hat.spin *= 0.3;
            if (Math.abs(hat.vy) < 12) { hat.state = 'landed'; hat.vy = 0; hat.vx = 0; }
          }
          if (hat.t > 7) { hat.state = 'returning'; hat.t = 0; hat.startX = hat.x; hat.startY = hat.y; hat.startAngle = hat.angle; }
        } else if (hat.state === 'landed') {
          hat.angle = lerp(hat.angle, Math.round(hat.angle / Math.PI) * Math.PI + 0.35, 1 - Math.exp(-dt * 6));
          if (hat.t > 7) { hat.state = 'returning'; hat.t = 0; hat.startX = hat.x; hat.startY = hat.y; hat.startAngle = hat.angle; }
        } else if (hat.state === 'returning') {
          const k = clamp(hat.t / 1.3, 0, 1);
          const e = k * k * (3 - 2 * k);
          const h = wiz.hatPosition(), f = feet();
          const tx = f.x + h.x, ty = f.y + h.y;
          hat.x = lerp(hat.startX, tx, e); hat.y = lerp(hat.startY, ty, e) - Math.sin(e * Math.PI) * 18;
          const turns = Math.round(hat.startAngle / (Math.PI * 2));
          hat.angle = lerp(hat.startAngle, turns * Math.PI * 2 - 0.12, e);
          if (random() < dt * 30) particles.spawn(hat.x + (random() - 0.5) * 10, hat.y - random() * 10, 0, -6, 0.6, ramp.gold, 0, 1, 2);
          if (k >= 1) { hat.off = false; wizard.hatOn = true; }
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
          if (roll < 0.5) {
            const x = layout.W * (0.35 + random() * 0.6), y = layout.horizonY * (0.15 + random() * 0.6);
            if (Math.hypot(x - moon.x, y - moon.y) > moon.r + 14) startCharge('sky', x, y, 'idle', 0.5 + random() * 1.4);
          } else if (roll < 0.65) wiz.set('twirl');
          else if (roll < 0.8 && rampart.owl.state === 'perch') { rampart.startle(); wiz.set('look'); }
          else if (roll < 0.9) wiz.set('stretch');
          else backdrop.launchShootingStar();
        }
      }
    },
    render(s, time) {
      const L = layout;
      backdrop.drawSky(s);
      backdrop.drawStars(s, time, flash > 0.5 ? 1 : 0);
      if (moon.state === 'intact') s.glow(moon.x, moon.y, moon.r * 3, LIGHT.moonHalo, 0.9, 1, 1, moon.r + 0.6);
      moonCtl.draw(s, time);
      backdrop.drawClouds(s);
      // moonlight on the clouds around it; clouds across its face stay dark, backlit
      if (moon.state === 'intact') s.glow(moon.x, moon.y, moon.r * 2.1, LIGHT.moon, 0.8, 1, 1, moon.r + 0.6);
      backdrop.drawLand(s, time);
      rampart.drawWall(s);
      rampart.drawSlits(s, time);
      // rune circle behind the feet
      const f = feet();
      const runes = charge.active ? charge.amount : wizard.state === 'mend' ? 0.8 : 0;
      if (runes > 0) drawRunes(s, f.x, L.groundY, runes, time, false);
      rampart.drawBrazier(s, time);
      rampart.drawOwl(s, time);
      // the wizard
      const fire = rampart.fireIntensity(time);
      const layer = wiz.draw(time, {
        moon: moon.state === 'intact' ? 1 : 0, moonDX: moon.x - f.x, moonDY: moon.y - f.y,
        fire: clamp((fire - 0.35) * 0.9, 0, 0.8), fireDX: rampart.brazier.x - f.x, fireDY: rampart.brazier.y - 14 - f.y,
      });
      s.blit(layer, f.x - wiz.origin.x, f.y - wiz.origin.y);
      if (runes > 0) drawRunes(s, f.x, L.groundY, runes, time, true);
      if (hat.off) drawLooseHat(s);
      // beam while mending
      if (wizard.state === 'mend' && moon.state === 'mending') drawBeam(s, time);
      // bolts
      for (const p of projectiles) {
        if (!p.alive) continue;
        const r = 1 + p.power * 2.2;
        s.disc(p.x, p.y, r + 1, p.color === 'cyan' ? c('cyan3') : c('violet3'));
        s.disc(p.x, p.y, r, p.color === 'cyan' ? c('cyan5') : c('violet4'));
        s.pset(p.x, p.y, c('star3'));
      }
      particles.draw(s);
      rampart.drawFireflies(s);
      // light
      rampart.lightFire(s, time);
      const g = gemWorld();
      const k = Math.max(wizard.charge, wizard.state === 'mend' ? 0.75 : 0.15 + Math.sin(time * 2.4) * 0.05);
      s.glow(g.x, g.y, 8 + k * 22, wizard.glowColor === 'green' ? LIGHT.mend : wizard.glowColor === 'violet' ? LIGHT.violet : k > 0.75 ? LIGHT.gemHot : LIGHT.gem, 0.55 + k * 0.6);
      for (const p of projectiles) if (p.alive) s.glow(p.x, p.y, 7 + p.power * 12, p.color === 'cyan' ? LIGHT.gem : LIGHT.violet, 0.9);
      for (const gl of glows) if (gl.alive) s.glow(gl.x, gl.y, gl.r, gl.luts, gl.strength);
      if (charge.active && charge.amount >= 1) drawArcs(s, g.x, g.y, time);
      for (const r of rings) if (r.alive) drawShock(s, r);
      if (flash > 0) mapAll(s, LIGHT.flash, flash * flash * 0.7);
      if (shake > 0) {
        const step = Math.floor(time * 30);
        const amp = Math.ceil(shake * 3);
        shakeX = ((step * 7919) % 3 - 1) * Math.min(amp, 3);
        shakeY = ((step * 104729) % 3 - 1) * Math.min(amp, 2);
        shift(s, shakeX, shakeY);
      }
    },
    press(x, y, info) {
      idle = 0;
      pointer.x = x; pointer.y = y; pointer.active = true;
      const f = feet();
      if (rampart.containsOwl(x, y)) { rampart.startle(); if (wizard.state === 'idle') wiz.set('look'); return true; }
      if (rampart.containsBrazier(x, y)) { rampart.flare(); burst(rampart.brazier.x, rampart.brazier.y - 16, 24, 40, 'ember', 1.2, -30, 1, 0); return true; }
      if (wiz.contains(x - f.x, y - f.y) && !charge.active) { if (TWIRL_FROM.has(wizard.state)) wiz.set('twirl'); return true; }
      if (moon.state === 'shattered' && Math.hypot(x - moon.x, y - moon.y) < moon.r * 4 && moon.sinceShatter > 1.2) { beginMend(); return true; }
      if (moon.state === 'mending' || wizard.state === 'mend' || wizard.state === 'shock') return true;
      if (moonCtl.contains(x, y)) { startCharge('moon', moon.x, moon.y, info.source); return true; }
      if (y < L().groundY - 16) { startCharge('sky', x, y, info.source); return true; }
      return false;
    },
    move(x, y, held) {
      pointer.x = x; pointer.y = y; pointer.active = true;
      if (charge.active && charge.target === 'sky' && held) { charge.x = x; charge.y = Math.min(y, L().groundY - 16); aimAt(charge.x, charge.y); }
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
    addCreature(x, y) { return rampart.addFirefly(x, y); },
    cursor(x, y) {
      const f = feet();
      if (rampart.containsOwl(x, y) || rampart.containsBrazier(x, y) || moonCtl.contains(x, y) || wiz.contains(x - f.x, y - f.y)) return 'pointer';
      return y < L().groundY - 16 ? 'crosshair' : 'default';
    },
    debug: { moonCtl, wiz, rampart, backdrop, particles, firework, get layout() { return layout; } },
    stats() { return { moon: moon.state, hp: Math.round(moon.hp), wizard: wizard.state, particles: particles.count }; },
  };
  const L = () => layout;
  // The charge sparks' field, made once: spring toward the gem, damped, absorbed on arrival.
  const pull = { x: 0, y: 0 };
  function attractToGem(i, step) {
    if (!attract[i] || particles.age[i] < step * 1.5) return;
    const dx = pull.x - particles.x[i], dy = pull.y - particles.y[i];
    const damp = Math.exp(-3 * step);
    particles.vx[i] = (particles.vx[i] + dx * 22 * step) * damp;
    particles.vy[i] = (particles.vy[i] + dy * 22 * step) * damp;
    if (dx * dx + dy * dy < 2) { particles.kill(i); attract[i] = 0; }
  }
  const RUNE_COLORS = {
    green: [c('green3'), c('green4')], violet: [c('violet2'), c('violet4')], cyan: [c('cyan2'), c('cyan4')],
  };

  // ---- drawing helpers --------------------------------------------------------------------

  function drawRunes(s, cx, cy, k, time, front) {
    const rx = 14 + k * 7, ry = 3 + k * 1.5;
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
      }
    }
    if (!front) s.glow(cx, cy, rx + 6, wizard.glowColor === 'green' ? LIGHT.mend : wizard.glowColor === 'violet' ? LIGHT.violet : LIGHT.gem, k * 0.7, 1, 0.35);
  }

  function drawBeam(s, time) {
    const g = gemWorld();
    const dx = moon.x - g.x, dy = moon.y - g.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const steps = Math.round(len);
    const step = Math.floor(time * 20);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      for (const strand of [0, Math.PI]) {
        const w = Math.sin(t * 14 - time * 12 + strand) * 2.2 * Math.sin(t * Math.PI);
        const x = g.x + dx * t + nx * w, y = g.y + dy * t + ny * w;
        s.pset(x, y, (k + step) % 5 === 0 ? c('star3') : strand ? c('green3') : c('cyan4'));
      }
    }
    for (let k = 0; k <= 6; k++) s.glow(g.x + dx * k / 6, g.y + dy * k / 6, 9, LIGHT.mend, 0.55);
  }

  function drawArcs(s, gx, gy, time) {
    const step = Math.floor(time * 20);
    let seed = step * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let n = 0; n < 3; n++) {
      let x = gx, y = gy;
      const a = rnd() * Math.PI * 2, len = 8 + rnd() * 14;
      for (let k = 0; k < len; k += 2) {
        const nx = x + Math.cos(a) * 2 + (rnd() - 0.5) * 3, ny = y + Math.sin(a) * 2 + (rnd() - 0.5) * 3;
        s.line(x, y, nx, ny, k < 4 ? c('star3') : c('cyan4'));
        x = nx; y = ny;
      }
    }
  }

  function drawShock(s, r) {
    const fade = 1 - r.age / r.life;
    const steps = Math.max(12, Math.round(r.r * 6.5));
    for (let n = 0; n < steps; n++) {
      const a = (n / steps) * Math.PI * 2;
      const x = r.x + Math.cos(a) * r.r, y = r.y + Math.sin(a) * r.r;
      s.pmap(x, y, fade > 0.5 ? LIGHT.flash[2] : LIGHT.flash[1]);
      if (fade > 0.35) s.pmap(x - Math.cos(a), y - Math.sin(a), LIGHT.flash[0]);
    }
  }

  function drawLooseHat(s) {
    hatLayer.clear(CLEAR);
    drawHat(hatLayer, 28, 34, hat.angle, -1.6 + Math.sin(hat.t * 9) * 0.15, 99);
    hatLayer.outline(INK);
    s.blit(hatLayer, Math.round(hat.x) - 28, Math.round(hat.y) - 34);
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
