import assert from 'node:assert/strict';
import { bootScene, assertAllInPalette } from '../../shared/tests/headless.mjs';
import { SPECIES, framesFor, POPULATIONS } from '../src/fish.js';
import { CLEAR } from '../../shared/pixel-engine.js';
import { INK } from '../src/palette.js';

// Every species' sprite frames: outlined, facing right, the nose on the right-hand side.
for (const kind of Object.keys(SPECIES)) {
  const art = framesFor(kind);
  assert.equal(art.frames.length, 5, `${kind}: four swim frames and a turn`);
  for (const [i, frame] of art.frames.entries()) {
    let outline = 0, body = 0;
    for (const v of frame.data) { if (v === INK) outline++; else if (v !== CLEAR) body++; }
    assert(outline > 6 && body > 6, `${kind} frame ${i} has a body and an outline`);
  }
  const f = art.frames[0];
  let leftmost = f.w, rightmost = -1;
  for (let x = 0; x < f.w; x++) if (f.get(x, art.cy) !== CLEAR) { leftmost = Math.min(leftmost, x); rightmost = Math.max(rightmost, x); }
  assert(rightmost >= art.noseX - 1, `${kind}: the nose reaches the right edge of the sprite`);
  const tail = art.frames.map(fr => fr.data.join(',')).slice(0, 4);
  assert(new Set(tail).size >= 2, `${kind}: the tail moves between frames`);
}

const app = await bootScene('../../pixelreef/src/main.js', { size: [1280, 720], search: '?capture&seed=11' });
const { scene } = app;
const D = scene.debug;
const L = D.layout;
const fish = D.school.fish;
const count = kind => fish.filter(f => f.kind === kind).length;
// Taps hit whatever is drawn in front, so before tapping a prop or critter, move any fish,
// jellyfish, crab or seahorse that has wandered over the spot out of the way.
const clearFor = (x, y) => {
  const { crab, seahorse, jellies } = D.critters;
  for (const f of [...fish, ...jellies, seahorse]) {
    if (Math.abs(f.x - x) < 24 && Math.abs(f.y - y) < 24) f.y = L.surfaceY + 4;
  }
  if (Math.abs(crab.x - x) < 24) crab.x = x < L.W / 2 ? crab.max : crab.min;
};

// Stocked to the normal population, everything in the water.
{
  const normal = Object.values(POPULATIONS.normal).reduce((a, b) => a + b, 0);
  assert.equal(fish.length, normal);
  app.seconds(5);
  for (const f of fish) {
    assert(f.y > L.surfaceY && f.y < L.floorY, `${f.kind} is in the water (y ${f.y.toFixed(1)})`);
  }
  assertAllInPalette(assert, app.render(), scene.palette, 'day');
}

// Clownfish keep to their anemone.
{
  app.seconds(20);
  const a = D.flora.anemone;
  for (const f of fish.filter(f => f.kind === 'clown')) {
    assert(Math.hypot(f.x - a.x, f.y - a.y) < 60, 'a clownfish stays near home');
  }
}

// Feeding: a host click drops food in the water and the fish eat all of it.
{
  const fedBefore = fish.reduce((n, f) => n + f.fed, 0);
  app.hostClick(L.W * 0.5, L.surfaceY + 20);
  assert(D.props.foodCount() > 0, 'a click in the water drops food');
  app.seconds(25);
  const fed = fish.reduce((n, f) => n + f.fed, 0) - fedBefore;
  assert(fed > 0, 'fish come and eat');
  assert.equal(D.props.foodCount(), 0, 'nothing is left over for long');
}

// Hand-feeding: holding still trickles food; moving stirs the water instead.
{
  const x = L.W * 0.3, y = L.surfaceY + 30;
  const eaten = () => fish.reduce((n, f) => n + f.fed, 0) + D.critters.crab.snap;
  const before = eaten();
  app.press(x, y);
  app.seconds(1.5);
  const trickled = D.props.foodCount() + eaten() - before;
  assert(trickled >= 9, `holding still keeps feeding (${trickled} flakes)`);
  for (let k = 1; k <= 20; k++) { app.move(x + k * 3, y); app.seconds(1 / 30); }
  assert(D.props.currents.some(c => c.alive), 'moving while held stirs a current');
  app.release(x + 60, y);
  app.seconds(20);
}

// The pufferfish: a tap puffs it up, holding keeps it big, and it settles again.
{
  const puffer = fish.find(f => f.kind === 'puffer');
  app.press(puffer.x, puffer.y);
  app.seconds(3.5);
  assert(puffer.puff > 1, 'held, it swells past its tapped size');
  app.release(puffer.x, puffer.y);
  app.seconds(10);
  assert.equal(puffer.puff, 0, 'released, it deflates');
  app.hostClick(puffer.x, puffer.y);
  app.seconds(0.6);
  assert(puffer.puff > 0.5, 'a quick tap still puffs it');
  app.seconds(10);
}

// The chest opens, spills coins onto the sand, and shuts itself.
{
  const chest = D.props.chest;
  clearFor(chest.x, chest.y - 6);
  app.hostClick(chest.x, chest.y - 6);
  app.seconds(0.5);
  assert(chest.open > 0.9);
  app.seconds(3);
  const coins = D.props.coins.filter(c => c.alive);
  assert(coins.length > 3 && coins.every(c => c.landed), 'coins land on the sand');
  app.seconds(5);
  assert(chest.open < 0.1, 'the lid closes again');
}

// The octopus comes out when its cave is tapped, and inks and hides on a second tap.
{
  const octo = D.critters.octo;
  const cave = L.cave;
  clearFor(cave.x, cave.y);
  app.hostClick(cave.x, cave.y);
  app.seconds(1.5);
  assert.equal(octo.state, 'out');
  assert(octo.out > 0.9);
  const inkBefore = D.particles.count;
  clearFor(cave.x, cave.y - 4);
  app.hostClick(cave.x, cave.y - 4);
  assert.equal(octo.state, 'inking');
  assert(D.particles.count > inkBefore + 100, 'a cloud of ink');
  app.seconds(3);
  assert.equal(octo.state, 'hidden');
}

// The crab raises its claws and scuttles; a jellyfish jumps when poked.
{
  const crab = D.critters.crab;
  const { x, y } = crab;
  crab.x = -1e3;
  clearFor(x, y - 3);
  crab.x = x;
  app.hostClick(x, y - 3);
  assert.equal(crab.state, 'claws');
  app.seconds(1);
  assert.equal(crab.state, 'scuttle');
  const jelly = D.critters.jellies[0];
  jelly.y = (L.surfaceY + L.floorY) / 2; jelly.vy = 0;
  const y0 = jelly.y;
  app.hostClick(jelly.x, jelly.y);
  app.seconds(0.5);
  assert(jelly.y < y0 - 3, 'the jellyfish shoots upward');
}

// Shy fish bolt from a fast pointer; curious fish come to a still one.
{
  app.seconds(10);
  const target = fish.find(f => !f.back && f.kind === 'blueTang');
  globalThis.habitatMode('shy');
  const px = target.x + 12, py = target.y;
  app.move(px - 30, py, false);
  app.seconds(1 / 60);
  app.move(px, py, false);
  app.seconds(1 / 60);
  assert.equal(target.state, 'flee', 'a quick pointer startles a shy fish');
  globalThis.habitatMode('curious');
  app.seconds(3);
  const cx = L.W * 0.5, cy = (L.surfaceY + L.floorY) / 2;
  app.move(cx, cy, false);
  const near = () => fish.filter(f => !f.back && Math.hypot(f.x - cx, f.y - cy) < 30).length;
  const before = near();
  app.seconds(6);
  assert(near() > before, 'curious fish gather at a still pointer');
  globalThis.habitatMode('shy');
  app.canvas.dispatch('pointerleave', {});
}

// Night: the lamp goes off (button or L key) and the jellyfish glow.
{
  app.key('l');
  app.seconds(6);
  assert.equal(scene.stats().night, 1);
  assertAllInPalette(assert, app.render(), scene.palette, 'night');
  app.key('l');
  app.seconds(6);
  assert.equal(scene.stats().night, 0);
}

// Tray commands: Feed scatters food across the top, Add a fish is capped, Population restocks.
{
  globalThis.habitatFeed();
  assert.equal(D.props.foodCount(), 10);
  app.seconds(25);
  const n = fish.length;
  let added = 0;
  while (globalThis.habitatAddFish() && added < 100) added++;
  assert.equal(added, 20, 'up to twenty extra fish');
  assert.equal(fish.length, n + 20);
  globalThis.habitatPopulation('few');
  assert.equal(fish.length, Object.values(POPULATIONS.few).reduce((a, b) => a + b, 0), 'a new level restocks the tank');
  assert.equal(count('puffer'), 1);
  assert(globalThis.habitatAddFish(), 'restocking resets the extra-fish allowance');
}

// Drag in the host: stirs the water, and answers so no marquee is drawn over the tank.
{
  const y = (L.surfaceY + L.floorY) / 2;
  clearFor(40, y);
  assert.equal(app.hostDrag('start', 40, y, 50, y), 'herd');
  for (let k = 0; k < 10; k++) { app.hostDrag('move', 40, y, 50 + k * 8, y); app.seconds(1 / 30); }
  assert(D.props.currents.some(c => c.alive));
  assert.equal(app.hostDrag('end', 40, y, 130, y), 'herd');
}

// The wallpaper dock: its own controls, the light as a toggle, mood as a choice.
{
  const find = id => globalThis.habitatControls().controls.find(control => control.id === id);
  for (const id of ['action', 'touch', 'add', 'lights', 'mood']) assert(find(id), `the dock offers ${id}`);
  assert.equal(find('lights').value, true);
  globalThis.habitatControl('lights', false);
  app.seconds(8);
  assert.equal(scene.stats().night, 1, 'the dock turns the light off');
  assert.equal(find('lights').value, false);
  globalThis.habitatControl('lights', false);
  assert.equal(find('lights').value, false, 'setting a toggle to what it is changes nothing');
  globalThis.habitatControl('lights', true);
  app.seconds(8);
  assert.equal(scene.stats().night, 0);
  globalThis.habitatControl('mood', 'curious');
  assert.equal(find('mood').value, 'curious');
  globalThis.habitatControl('mood', 'shy');
  const food = D.props.foodCount();
  globalThis.habitatControl('action');
  assert(D.props.foodCount() > food, 'the dock feeds');
  const y = (L.surfaceY + L.floorY) / 2, scale = app.presenter.state.scale;
  assert.equal(globalThis.habitatUse('touch', { phase: 'start', x0: 40 * scale, y0: y * scale, x: 50 * scale, y: y * scale }), 'herd');
  globalThis.habitatUse('touch', { phase: 'end', x0: 40 * scale, y0: y * scale, x: 60 * scale, y: y * scale });
}

console.log('PASS: pixel reef sprites, stocking, feeding, hand-feeding, stirring, puffer, chest, octopus, crab, jellyfish, shy and curious fish, night, tray commands, host drags and dock controls');
