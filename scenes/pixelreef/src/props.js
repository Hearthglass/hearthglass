import { Surface, CLEAR, sprite, clamp } from '../../shared/pixel-engine.js';
import { palette, INK } from './palette.js';

const c = name => palette.c(name);

const CHEST_KEY = { w: 'wood2', W: 'wood3', h: 'wood4', d: 'wood1', k: 'wood0', g: 'gold2', G: 'gold3', Y: 'gold4', i: 'ink0', o: 'gold1' };
const CHEST_BASE = sprite(palette, CHEST_KEY, [
  'kgggggggggggggk',
  'kwWWwWWwgGgWWwk',
  'kwwWwwWwGYGwWwk',
  'kwwwwwwwgGgwwwk',
  'kgwwwwwwwwwwwgk',
  'kdwwwwwwwwwwwdk',
  'kgddddddddddgdk',
  '.kkkkkkkkkkkkk.',
]);
const CHEST_LID = sprite(palette, CHEST_KEY, [
  '...kkkkkkkkk...',
  '.kkhhhhhhhhhkk.',
  'kghWWWWWWWWWhgk',
  'kgwWwwWwwWwwwgk',
  'kGgggggggggggGk',
]);
const CHEST_LID_OPEN = sprite(palette, CHEST_KEY, [
  'kGgggggggggggGk',
  'kgwwwwwwwwwwwgk',
  'kgdddddddddddgk',
]);
const COINS = sprite(palette, CHEST_KEY, [
  '..GYG.YGG.GY...',
  '.GYGGGGYGGGGYG.',
]);

const CASTLE_KEY = { s: 'rock3', S: 'rock4', L: 'rock5', d: 'rock2', k: 'rock1', i: 'ink0', r: 'red2', R: 'red3', m: 'green3', f: 'white2' };
const CASTLE = sprite(palette, CASTLE_KEY, [
  '......R.........',
  '......Rr........',
  '......k.........',
  '....L.S.L.......',
  '....LSSSS.......',
  '....SsisS.L.S.L.',
  '....SsssS.LSSSS.',
  '....SsisS.SsisS.',
  '.L.SSsssS.SsssS.',
  '.LSSSsssSSSsssS.',
  '.SsssssssssssssS',
  '.SsdddsssssddssS',
  '.SsdiisssssdidsS',
  '.SsdiiisssssssdS',
  '.SsdiiissssmssdS',
  'mSssiiisssmmsssS',
  'mmkkkkkkkkkkkkkm',
]);

/** The treasure chest, the castle ornament, bubbles, food, coins and stirred currents. */
export function createProps(random) {
  let layout = null, tank = null;
  const chest = { x: 0, y: 0, open: 0, target: 0, t: 0, sparkle: 0 };
  const castle = { x: 0, y: 0, next: 2, burst: 0 };
  const bubbles = Array.from({ length: 220 }, () => ({ alive: false, x: 0, y: 0, r: 0, vy: 0, phase: 0, wobble: 0 }));
  const food = Array.from({ length: 160 }, () => ({ alive: false, x: 0, y: 0, vy: 0, phase: 0, landed: false, age: 0, color: 0 }));
  const coins = Array.from({ length: 40 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, landed: false, age: 0, spin: 0 }));
  const currents = Array.from({ length: 16 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, strength: 0, life: 0 }));
  const splashes = Array.from({ length: 24 }, () => ({ alive: false, x: 0, age: 0 }));

  function build(next, tankRef) {
    layout = next; tank = tankRef;
    chest.x = Math.round(layout.W * 0.6); chest.y = tank.sandAt(chest.x) + 3;
    castle.x = Math.round(layout.W * 0.47); castle.y = tank.sandAt(castle.x) + 3;
  }

  function bubble(x, y, r = 0, vy = -(14 + random() * 14)) {
    for (const b of bubbles) if (!b.alive) { Object.assign(b, { alive: true, x, y, r, vy, phase: random() * 6, wobble: 0.6 + random() }); return b; }
    return null;
  }
  function dropFood(x, y, n = 6, spread = 6) {
    for (let k = 0; k < n; k++) {
      const f = food.find(p => !p.alive);
      if (!f) return;
      Object.assign(f, {
        alive: true, x: x + (random() - 0.5) * spread, y: y + (random() - 0.5) * spread * 0.5, vy: 5 + random() * 5,
        phase: random() * 6, landed: false, age: 0, color: [c('orange3'), c('orange4'), c('red3'), c('yellow3')][Math.floor(random() * 4)],
      });
    }
  }
  function stir(x, y, vx, vy) {
    let slot = currents.find(q => !q.alive);
    if (!slot) slot = currents.reduce((a, b) => (a.life < b.life ? a : b));
    Object.assign(slot, { alive: true, x, y, vx: clamp(vx, -160, 160), vy: clamp(vy, -160, 160), r: 30, strength: 1, life: 1.2 });
    if (random() < 0.5) bubble(x + (random() - 0.5) * 4, y, random() < 0.3 ? 1 : 0);
  }

  function openChest() {
    if (chest.target === 1) { chest.target = 0; return 'close'; }
    chest.target = 1; chest.t = 0;
    for (let k = 0; k < 24; k++) bubble(chest.x + (random() - 0.5) * 10, chest.y - 10 - random() * 4, random() < 0.3 ? 2 : random() < 0.6 ? 1 : 0, -(20 + random() * 25));
    for (let k = 0; k < 9; k++) {
      const coin = coins.find(q => !q.alive);
      if (!coin) break;
      Object.assign(coin, { alive: true, x: chest.x + (random() - 0.5) * 6, y: chest.y - 11, vx: (random() - 0.5) * 36, vy: -20 - random() * 22, landed: false, age: 0, spin: random() * 4 });
    }
    return 'open';
  }

  function update(dt, time) {
    // chest lid
    chest.t += dt;
    chest.open += (chest.target - chest.open) * (1 - Math.exp(-dt * 10));
    if (chest.target === 1 && chest.t > 6) chest.target = 0;
    if (chest.open > 0.6 && Math.random() < dt * 3) bubble(chest.x + (Math.random() - 0.5) * 8, chest.y - 11, 0);
    // castle bubbles in little bursts
    castle.next -= dt;
    if (castle.next <= 0) {
      castle.burst = 3 + Math.floor(random() * 4);
      castle.next = 3 + random() * 4;
    }
    if (castle.burst > 0 && random() < dt * 12) { castle.burst--; bubble(castle.x + 7, castle.y - 17, random() < 0.3 ? 1 : 0); }
    // bubbles rise and wobble; pop into a splash at the surface
    for (const b of bubbles) {
      if (!b.alive) continue;
      b.phase += dt * 5 * b.wobble;
      b.vy = Math.max(b.vy - dt * 6, -45);
      b.y += b.vy * dt;
      b.x += Math.sin(b.phase) * dt * 6;
      for (const cur of currents) if (cur.alive) {
        const d = Math.hypot(b.x - cur.x, b.y - cur.y);
        if (d < cur.r) { b.x += cur.vx * (1 - d / cur.r) * dt * 0.6; b.y += cur.vy * (1 - d / cur.r) * dt * 0.3; }
      }
      if (b.y < layout.surfaceY + 1) {
        b.alive = false;
        const s = splashes.find(q => !q.alive);
        if (s) Object.assign(s, { alive: true, x: b.x, age: 0 });
      }
    }
    for (const s of splashes) if (s.alive && (s.age += dt) > 0.35) s.alive = false;
    // food drifts down, rests on the sand, and dissolves
    for (const f of food) {
      if (!f.alive) continue;
      f.age += dt;
      if (!f.landed) {
        f.phase += dt * 3;
        f.y += f.vy * dt;
        f.x += Math.sin(f.phase) * dt * 4;
        for (const cur of currents) if (cur.alive) {
          const d = Math.hypot(f.x - cur.x, f.y - cur.y);
          if (d < cur.r) { f.x += cur.vx * (1 - d / cur.r) * dt * 0.8; f.y += cur.vy * (1 - d / cur.r) * dt * 0.5; }
        }
        const ground = tank.sandAt(f.x) - 1;
        if (f.y >= ground) { f.y = ground; f.landed = true; f.age = 0; }
      } else if (f.age > 18) f.alive = false;
    }
    // coins tumble out and settle, glint, then fade
    for (const q of coins) {
      if (!q.alive) continue;
      q.age += dt;
      q.spin += dt * 10;
      if (!q.landed) {
        q.vy += 60 * dt; q.vx *= Math.exp(-dt * 1.5); q.vy *= Math.exp(-dt * 1.2);
        q.x += q.vx * dt; q.y += q.vy * dt;
        const ground = tank.sandAt(q.x);
        if (q.y >= ground && q.vy > 0) { q.y = ground; q.landed = true; q.age = 0; }
      } else if (q.age > 14) q.alive = false;
    }
    for (const cur of currents) if (cur.alive) {
      cur.life -= dt;
      cur.strength = Math.max(0, cur.life / 1.2);
      cur.r += dt * 18;
      if (cur.life <= 0) cur.alive = false;
    }
  }

  function drawChest(s, time) {
    const x = chest.x - 7, y = chest.y - CHEST_BASE.h;
    if (chest.open > 0.35) {
      s.blit(COINS, x, y - 1);
      s.blit(CHEST_LID_OPEN, x, y - 3 - CHEST_LID_OPEN.h + 1);
    }
    s.blit(CHEST_BASE, x, y);
    if (chest.open <= 0.35) s.blit(CHEST_LID, x, y - CHEST_LID.h + 1 - Math.round(chest.open * 3));
  }

  function drawCastle(s) { s.blit(CASTLE, castle.x - 1, castle.y - CASTLE.h); }

  function drawBubbles(s) {
    for (const b of bubbles) {
      if (!b.alive) continue;
      const x = Math.round(b.x), y = Math.round(b.y);
      if (b.r === 0) { s.pset(x, y, c('foam1')); continue; }
      if (b.r === 1) {
        s.pset(x - 1, y, c('foam0')); s.pset(x + 1, y, c('foam0')); s.pset(x, y - 1, c('foam1')); s.pset(x, y + 1, c('ray1'));
        s.pmap(x, y, palette.lighter);
        continue;
      }
      s.ring(x, y, b.r, c('foam0'));
      s.pset(x - 1, y - 1, c('foam2'));
      s.pmap(x, y, palette.lighter);
    }
    for (const sp of splashes) {
      if (!sp.alive) continue;
      const k = Math.round(sp.age * 10);
      s.pset(sp.x - k - 1, layout.surfaceY - 1, c('foam2'));
      s.pset(sp.x + k + 1, layout.surfaceY - 1, c('foam2'));
      if (sp.age < 0.15) s.pset(sp.x, layout.surfaceY - 2, c('foam2'));
    }
  }

  function drawFood(s) {
    for (const f of food) {
      if (!f.alive) continue;
      if (f.landed && f.age > 14 && Math.floor(f.age * 8) % 2) continue;
      s.pset(f.x, f.y, f.color);
    }
  }

  function drawCoins(s, time) {
    for (const q of coins) {
      if (!q.alive) continue;
      if (q.landed && q.age > 11 && Math.floor(q.age * 8) % 2) continue;
      const edge = Math.floor(q.spin) % 4 === 1 && !q.landed;
      const x = Math.round(q.x), y = Math.round(q.y);
      if (edge) { s.pset(x, y, c('gold2')); s.pset(x, y - 1, c('gold3')); }
      else { s.pset(x, y, c('gold3')); s.pset(x + 1, y, c('gold2')); s.pset(x, y - 1, c('gold4')); s.pset(x + 1, y - 1, c('gold3')); }
      if (Math.sin(time * 3 + x) > 0.95) s.pset(x, y - 2, c('white2'));
    }
  }

  return {
    build, update, drawChest, drawCastle, drawBubbles, drawFood, drawCoins,
    chest, castle, bubbles, food, coins, currents,
    bubble, dropFood, stir, openChest,
    castleBurst() { castle.burst += 14; castle.next = 4; },
    hitChest(x, y) { return Math.abs(x - chest.x) < 9 && y > chest.y - 16 && y < chest.y + 2; },
    hitCastle(x, y) { return x > castle.x - 2 && x < castle.x + 16 && y > castle.y - 18 && y < castle.y + 1; },
    foodCount() { let n = 0; for (const f of food) if (f.alive) n++; return n; },
  };
}
