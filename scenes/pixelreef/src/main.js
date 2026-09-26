import { runPixelScene } from '../../shared/pixel-host.js';
import { createParticles, bayer, clamp } from '../../shared/pixel-engine.js';
import { randomGenerator } from '../../shared/random.js';
import { palette, LIGHT, SHADE, RAMPS } from './palette.js';
import { createTank } from './tank.js';
import { createFlora } from './flora.js';
import { createFishSchool, POPULATIONS, SPECIES } from './fish.js';
import { createCritters } from './critters.js';
import { createProps } from './props.js';

const ADDABLE = ['clown', 'blueTang', 'yellowTang', 'idol', 'flame', 'chromis'];
const EXTRA_LIMIT = 20;

runPixelScene(({ params, isHost }) => {
  const random = randomGenerator(Number(params.get('seed')) || 5150);
  const tank = createTank(random);
  const flora = createFlora(random);
  const school = createFishSchool(random);
  const critters = createCritters(random);
  const props = createProps(random);
  const particles = createParticles(1400);
  const ramp = {};
  for (const [name, list] of Object.entries(RAMPS)) ramp[name] = particles.ramp(list);

  let layout = null;
  let population = Object.hasOwn(POPULATIONS, params.get('population')) ? params.get('population') : 'normal';
  let extras = 0;
  const pointer = { x: 0, y: 0, active: false, speed: 0, still: 0, lastT: 0 };
  const hold = { active: false, x: 0, y: 0, startX: 0, startY: 0, mode: 'none', t: 0, trickle: 0, puffer: null, lastX: 0, lastY: 0 };
  // Night: the lamp is off, the reef glows. Follows the clock on the desktop unless changed.
  const clockNight = () => { const h = new Date().getHours() + new Date().getMinutes() / 60; return h >= 20.5 || h < 6.5; };
  let nightTarget = params.has('night') ? 1 : isHost && clockNight() ? 1 : 0;
  let night = nightTarget, nightManual = params.has('night');
  let clockCheck = 0, clock = 0, idle = 0;

  function computeLayout(W, H) {
    return { W, H, surfaceY: Math.max(6, Math.round(H * 0.045)), floorY: H - Math.max(22, Math.round(H * 0.2)) };
  }

  function sandPuff(x, y, n = 10) {
    for (let k = 0; k < n; k++) particles.spawn(x + (random() - 0.5) * 6, y, (random() - 0.5) * 24, -8 - random() * 14, 0.8 + random() * 0.6, ramp.sand, 18, 2, 0);
  }
  function inkCloud(x, y) {
    for (let k = 0; k < 160; k++) {
      const a = random() * Math.PI * 2, s = 8 + random() * 30;
      particles.spawn(x, y, Math.cos(a) * s - 10, Math.sin(a) * s * 0.7, 1.6 + random() * 1.6, ramp.ink, -1, 1.2, 3, random() < 0.5 ? 2 : 3);
    }
    school.scatter(x, y, 60);
  }
  function sparkle(x, y, n, name = 'sparkle') {
    for (let k = 0; k < n; k++) {
      const a = random() * Math.PI * 2, s = 10 + random() * 25;
      particles.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + random() * 0.5, ramp[name], 0, 2, 2);
    }
  }

  const scene = {
    palette,
    hint: 'Tap the water to feed. Drag to stir. Tap the chest, the octopus cave, the puffer…',
    actionLabel: 'Feed',
    actionIcon: 'feed',
    buttons: [{
      id: 'lights', icon: 'lamp', label: 'Tank light', key: 'l',
      pressed: () => nightTarget === 0,
      run() { nightTarget = nightTarget ? 0 : 1; nightManual = true; },
    }],
    resize(W, H) {
      layout = computeLayout(W, H);
      tank.build(layout);
      flora.build(layout, tank);
      school.build(layout, tank, flora, population);
      critters.build(layout, tank, flora);
      props.build(layout, tank);
    },
    update(dt, time) {
      clock += dt; idle += dt;
      pointer.still += dt;
      pointer.speed *= Math.exp(-dt * 6);
      if (!nightManual && isHost && (clockCheck -= dt) <= 0) { clockCheck = 60; nightTarget = clockNight() ? 1 : 0; }
      night += (nightTarget - night) * (1 - Math.exp(-dt * 1.2));
      if (Math.abs(nightTarget - night) < 0.002) night = nightTarget;
      // held pointer: feed a trickle, or stir once it moves
      if (hold.active) {
        hold.t += dt;
        if (hold.mode === 'feed') {
          hold.trickle -= dt;
          if (hold.trickle <= 0 && props.foodCount() < 150) { hold.trickle = 0.14; props.dropFood(hold.x, hold.y, 1, 3); }
        }
        if (hold.puffer) hold.puffer.puffHold = true;
      }
      const current = currentAt(layout.W * 0.5, layout.H * 0.5);
      flora.update(dt);
      props.update(dt, time);
      school.update(dt, time, { pointer, food: props.food, currents: props.currents });
      critters.update(dt, time, { food: props.food, currents: props.currents });
      particles.update(dt);
      // the reef's own glow: plankton sparks in the wake of quick fish at night
      if (night > 0.5) {
        for (const f of school.fish) {
          if (f.back) continue;
          const sp = Math.hypot(f.vx, f.vy);
          if (sp > 18 && random() < dt * sp * 0.08) particles.spawn(f.x - f.dir * 4, f.y + (random() - 0.5) * 3, (random() - 0.5) * 4, (random() - 0.5) * 4, 0.7 + random() * 0.5, ramp.bio, 0, 1, 0);
        }
      }
      // drifting motes in the water column
      if (random() < dt * 2.5) particles.spawn(random() * layout.W, layout.surfaceY + random() * (layout.floorY - layout.surfaceY), (random() - 0.5) * 2, 1 + random() * 2, 6 + random() * 6, ramp.plankton, 0, 0, 0);
      scene._current = current;
    },
    render(s, time) {
      const day = 1 - night;
      const cur = scene._current || 0;
      tank.drawBack(s);
      flora.drawKelp(s, time, true, cur);
      school.draw(s, true, time);
      if (day > 0.02) tank.drawRays(s, time, day);
      tank.drawFront(s);
      if (day > 0.02) tank.drawCaustics(s, time, day);
      props.drawCastle(s);
      props.drawChest(s, time);
      flora.drawCorals(s, time, night);
      flora.drawGrass(s, time, cur);
      flora.drawAnemone(s, time, cur);
      critters.drawOcto(s, time, night);
      critters.drawCrab(s);
      critters.drawSeahorse(s, time);
      flora.drawKelp(s, time, false, cur);
      props.drawFood(s);
      props.drawCoins(s, time);
      school.draw(s, false, time);
      critters.drawJellies(s, time, night > 0.5);
      props.drawBubbles(s);
      particles.draw(s);
      tank.drawSurface(s, time);
      // chest glow when open
      if (props.chest.open > 0.3) s.glow(props.chest.x, props.chest.y - 10, 18, LIGHT.gold, props.chest.open * 0.8);
      if (night > 0) {
        // dither toward night, then let living light through
        const d = s.data, w = s.w, lut = SHADE.night;
        for (let y = 0; y < s.h; y++) for (let x = 0; x < w; x++) if (night > bayer(x, y) * 0.999) { const i = y * w + x; d[i] = lut[d[i]]; }
        if (night > 0.3) {
          tank.drawRays(s, time * 0.5, night * 0.35);
          flora.drawPolypGlow(s, time);
          for (let i = 0; i < particles.max; i++) {
            if (!particles.alive[i]) continue;
            const col = particles.color(i);
            if (col === palette.c('glow1') || col === palette.c('glow0')) s.glow(particles.x[i], particles.y[i], 3, LIGHT.bio, 0.6);
          }
        }
        critters.glowJellies(s, time, night);
      } else critters.glowJellies(s, time, 0);
    },
    press(x, y, info) {
      idle = 0;
      pointer.x = x; pointer.y = y; pointer.active = true;
      const inWater = y > layout.surfaceY && y < tank.sandAt(x) - 1;
      // hit-test front to back, in the order things are drawn: jellies over fish over the rest
      const jelly = critters.hitJelly(x, y);
      if (jelly) { critters.pokeJelly(jelly); sparkle(jelly.x, jelly.y, 10, 'jelly'); return true; }
      const f = school.hitTest(x, y);
      if (f) {
        if (f.kind === 'puffer') {
          f.state = 'puffed'; f.stateT = 0;
          hold.active = info.source !== 'host-click'; hold.mode = 'puffer'; hold.puffer = f;
          props.bubble(f.x, f.y - 4, 1);
        } else {
          school.startle(f, f.x - x || 1, f.y - y);
          for (let k = 0; k < 3; k++) props.bubble(f.x, f.y - 2, k === 0 ? 1 : 0);
        }
        return true;
      }
      if (props.hitChest(x, y)) { if (props.openChest() === 'open') sparkle(props.chest.x, props.chest.y - 12, 16); return true; }
      if (props.hitCastle(x, y)) { props.castleBurst(); return true; }
      if (critters.hitCave(x, y)) {
        const r = critters.pokeOcto();
        if (r === 'ink') inkCloud(critters.octo.x, critters.octo.y - 6);
        return true;
      }
      if (critters.hitCrab(x, y)) { critters.pokeCrab(); sandPuff(critters.crab.x, critters.crab.y, 8); return true; }
      if (critters.hitSeahorse(x, y)) { critters.pokeSeahorse(); return true; }
      if (flora.containsAnemone(x, y)) {
        flora.touchAnemone(x, y);
        for (const fish of school.fish) if (fish.kind === 'clown') school.startle(fish);
        return true;
      }
      if (inWater) {
        props.dropFood(x, y, info.source === 'host-click' ? 6 : 4, 5);
        Object.assign(hold, { active: info.source !== 'host-click', x, y, startX: x, startY: y, lastX: x, lastY: y, mode: 'feed', t: 0, trickle: 0.3, puffer: null });
        return true;
      }
      if (y >= tank.sandAt(x) - 1) {
        sandPuff(x, tank.sandAt(x), 12);
        school.scatter(x, y, 24);
        return true;
      }
      return false;
    },
    move(x, y, held) {
      const now = clock;
      const dt = Math.max(1 / 120, now - pointer.lastT);
      const dist = Math.hypot(x - pointer.x, y - pointer.y);
      pointer.speed = Math.max(pointer.speed * 0.5, dist / dt);
      if (dist > 0.5) pointer.still = 0;
      pointer.lastT = now;
      pointer.x = x; pointer.y = y; pointer.active = true;
      if (!held || !hold.active) return;
      if (hold.mode === 'feed' && Math.hypot(x - hold.startX, y - hold.startY) > 6) hold.mode = 'stir';
      if (hold.mode === 'stir') {
        const vx = (x - hold.lastX) / dt, vy = (y - hold.lastY) / dt;
        if (Math.hypot(x - hold.lastX, y - hold.lastY) > 1.5) props.stir(x, y, vx * 0.5, vy * 0.5);
        if (night > 0.5 && random() < 0.6) particles.spawn(x, y, (random() - 0.5) * 8, (random() - 0.5) * 8, 0.9, ramp.bio, 0, 1, 0);
      }
      hold.x = x; hold.y = y; hold.lastX = x; hold.lastY = y;
    },
    release() { endHold(); },
    cancel() { endHold(); },
    leave() { pointer.active = false; },
    action() {
      idle = 0;
      for (let k = 0; k < 10; k++) props.dropFood(layout.W * (0.12 + random() * 0.76), layout.surfaceY + 3 + random() * 6, 1, 2);
    },
    addCreature(x, y) {
      if (extras >= EXTRA_LIMIT) return false;
      extras++;
      const kind = ADDABLE[Math.floor(random() * ADDABLE.length)];
      const side = x === undefined ? (random() < 0.5 ? -1 : 1) : x < layout.W / 2 ? -1 : 1;
      school.spawn(kind, undefined, y === undefined ? undefined : clamp(y, layout.surfaceY + 10, layout.floorY - 8), side);
      return true;
    },
    setMode(mode) { school.setMode(mode); },
    setPopulation(level) {
      if (!Object.hasOwn(POPULATIONS, level) || level === population) return;
      population = level; extras = 0;
      school.populate(level);
    },
    cursor(x, y) {
      if (school.hitTest(x, y) || critters.hitJelly(x, y) || props.hitChest(x, y) || props.hitCastle(x, y) || critters.hitCave(x, y) || critters.hitCrab(x, y) || critters.hitSeahorse(x, y) || flora.containsAnemone(x, y)) return 'pointer';
      return y > layout.surfaceY && y < tank.sandAt(x) - 1 ? 'cell' : 'default';
    },
    debug: { tank, flora, school, critters, props, particles, get layout() { return layout; } },
    stats() { return { fish: school.fish.length, food: props.foodCount(), night: Math.round(night * 100) / 100, mode: school.mode, particles: particles.count }; },
  };

  function endHold() {
    if (hold.puffer) { hold.puffer.puffHold = false; hold.puffer.stateT = Math.min(hold.puffer.stateT, 1.6); }
    hold.active = false; hold.mode = 'none'; hold.puffer = null;
  }
  function currentAt() {
    let v = 0;
    for (const cur of props.currents) if (cur.alive) v += cur.vx * cur.strength * 0.004;
    return clamp(v, -1, 1);
  }

  return scene;
});

export { SPECIES };
