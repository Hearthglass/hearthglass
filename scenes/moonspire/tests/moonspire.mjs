import assert from 'node:assert/strict';
import { bootScene, assertAllInPalette } from '../../shared/tests/headless.mjs';

const app = await bootScene('../../moonspire/src/main.js', { size: [1280, 720], search: '?capture&seed=7' });
const { scene } = app;
const D = scene.debug;
const L = D.layout;
const moon = D.moonCtl.moon;
const wizard = D.wiz.wizard;
const state = () => scene.stats();
const K = L.k;

// The screen is about 360 pixels tall at a whole-number scale, and the layout fits it.
{
  const s = app.presenter.state;
  assert.equal(s.scale, 2);
  assert.equal(s.width, 640); assert.equal(s.height, 360);
  assert.equal(L.u, 2, 'the fine grid draws the detailed art');
  assert(L.moonX > L.wizardX + 60 * K, 'the moon is across the sky from the wizard');
  assert(L.groundY > L.horizonY && L.groundY < s.height - 20 * K);
  assert(D.tower.turret.on && D.tower.scope.on && D.tower.orrery.on, 'a wide screen has room for the turret, telescope and orrery');
  app.seconds(1);
  assertAllInPalette(assert, app.render(), scene.palette, 'first frame');
}

// A short press on the moon: a small bolt, a crack, and the moon keeps most of its light.
{
  app.press(L.moonX, L.moonY);
  app.seconds(0.2);
  assert.equal(wizard.state, 'charge');
  assert(wizard.charge > 0.05 && wizard.charge < 0.2, 'charge builds while held');
  app.release(L.moonX, L.moonY);
  app.seconds(0.1);
  assert.equal(wizard.state, 'cast');
  for (let k = 0; k < 90 && moon.cracks.length === 0; k++) app.seconds(1 / 60);
  assert(moon.cracks.length > 0, 'the bolt cracks the moon');
  assert(moon.hp < 100 && moon.hp > 60, `a tap does a little damage (hp ${moon.hp})`);
  assert.equal(moon.state, 'intact');
}

// Left alone, the cracks seal.
{
  app.seconds(60);
  assert.equal(moon.cracks.length, 0, 'the moon heals');
  assert.equal(moon.hp, 100);
}

// Held to full power: the moon bursts, the hat flies, and the wizard puts it all back.
{
  app.press(L.moonX, L.moonY);
  app.seconds(2.5);
  assert.equal(wizard.charge, 1, 'full charge after about two seconds');
  app.release(L.moonX, L.moonY);
  for (let k = 0; k < 120 && moon.state === 'intact'; k++) app.seconds(1 / 60);
  assert.equal(moon.state, 'shattered');
  assert(moon.chunks.length > 20, 'the moon breaks into many pieces');
  const pixels = moon.chunks.reduce((n, ch) => n + ch.colors.length, 0);
  assert(Math.abs(pixels - Math.PI * (moon.r + 0.5) ** 2) < moon.r * 8, 'the pieces are the moon\'s own pixels');
  app.seconds(0.1);
  assert.equal(wizard.state, 'shock');
  assert.equal(wizard.hatOn, false, 'the blast knocks his hat off');
  assertAllInPalette(assert, app.render(), scene.palette, 'explosion');
  app.seconds(6);
  assert.equal(moon.state, 'mending', 'he sets about mending it');
  assert.equal(wizard.state, 'mend');
  for (let k = 0; k < 600 && moon.state !== 'intact'; k++) app.seconds(1 / 60);
  assert.equal(moon.state, 'intact', 'the moon is whole again');
  assert.equal(moon.hp, 100);
  app.seconds(2);
  assert.equal(wizard.hatOn, true, 'and his hat is back');
}

// Hold too long at full power and it backfires: no bolt, a sooty wizard.
{
  app.seconds(3);
  app.press(L.moonX, L.moonY);
  app.seconds(2.2 + 3.4);
  assert.equal(wizard.state, 'singed');
  assert(wizard.soot > 0.5);
  app.release(L.moonX, L.moonY);
  app.seconds(0.5);
  assert.equal(moon.hp, 100, 'the backfired spell never reaches the moon');
  app.seconds(8);
  assert.equal(wizard.state, 'idle');
}

// The wallpaper host: a lone click taps a firework into the sky; nothing is left held.
{
  const before = D.particles.count;
  app.hostClick(L.W * 0.45, L.horizonY * 0.3);
  app.seconds(0.15);
  assert.equal(wizard.state, 'cast', 'a host click casts at once');
  app.seconds(1.2);
  assert(D.particles.count > before + 20, 'and bursts into a firework');
  app.seconds(3);
  assert.equal(state().wizard, 'idle', 'no charge is left hanging without a pointerup');
}

// Host drags: begun on the moon they charge and cast; begun on the wall they are not ours.
{
  assert.equal(app.hostDrag('start', L.moonX, L.moonY, L.moonX + 2, L.moonY), 'herd');
  app.seconds(1);
  assert.equal(wizard.state, 'charge');
  assert.equal(app.hostDrag('move', L.moonX, L.moonY, L.moonX + 4, L.moonY + 1), 'herd');
  app.seconds(0.5);
  app.hostDrag('end', L.moonX, L.moonY, L.moonX + 4, L.moonY + 1);
  app.seconds(0.1);
  assert.equal(wizard.state, 'cast');
  app.seconds(2);
  assert(moon.hp < 100, 'the dragged charge hits the moon');
  assert.equal(app.hostDrag('start', L.W * 0.6, L.groundY + 8, L.W * 0.6 + 10, L.groundY + 8), 'select', 'the floor lets the host draw its marquee');
  app.hostDrag('end', L.W * 0.6, L.groundY + 8, L.W * 0.6 + 10, L.groundY + 8);
  app.seconds(40);
}

// The tray's Feed is "cast a spell": a full auto-charge at the moon, which bursts it.
{
  assert.equal(moon.state, 'intact');
  globalThis.habitatFeed();
  app.seconds(0.2);
  assert.equal(wizard.state, 'charge');
  app.seconds(4);
  assert.notEqual(moon.state, 'intact', 'a full spell from the tray bursts the moon');
  app.seconds(20);
  assert.equal(moon.state, 'intact');
}

// Taps add up: enough small bolts break the moon too.
{
  app.seconds(3);
  let taps = 0;
  while (moon.state === 'intact' && taps < 12) {
    app.hostClick(L.moonX, L.moonY);
    app.seconds(1.2);
    taps++;
  }
  assert(taps > 3 && taps < 12, `several taps break it (${taps})`);
  app.seconds(20);
}

// The other residents: the owl takes flight and comes home, the brazier flares, the
// wizard twirls, and the tray's "Add a fish" adds fireflies up to a limit.
{
  const owl = D.tower.owl;
  app.hostClick(owl.x + 4 * K, owl.y + 5 * K);
  assert.equal(owl.state, 'fly');
  app.seconds(30);
  assert.equal(owl.state, 'perch', 'the owl returns to its battlement');
  app.hostClick(D.tower.brazier.x, D.tower.brazier.y - 6 * K);
  assert.equal(D.tower.brazier.flare, 1);
  app.hostClick(L.wizardX, L.groundY - 20 * K);
  assert.equal(wizard.state, 'twirl');
  app.seconds(2);
  // the observatory's instruments answer a tap too
  app.hostClick(D.tower.orrery.x, L.groundY - 33 * K);
  assert(D.tower.orrery.speed > 5, 'the orrery spins up');
  const lamp = D.tower.lantern;
  app.hostClick(lamp.x, lamp.y + 11 * K);
  assert(lamp.swing > 0.2, 'the lantern swings');
  const scope = D.tower.scope;
  app.seconds(3);
  app.hostClick(scope.x + Math.cos(scope.angle) * 20 * K, scope.y + Math.sin(scope.angle) * 20 * K);
  assert(scope.glint > 0.9, 'the telescope catches the light');
  assert.equal(wizard.state, 'look', 'and the wizard looks up for the shooting star');
  let added = 0;
  while (globalThis.habitatAddFish(100, 100) && added < 100) added++;
  assert(added > 0 && added < 100, 'fireflies are capped');
}

// The wallpaper dock: the scene lists its own controls, and each one does its thing.
{
  app.seconds(30);
  const manifest = globalThis.habitatControls();
  const ids = manifest.controls.map(control => control.id);
  for (const id of ['action', 'fireworks', 'meteors', 'bats', 'owl', 'touch', 'add', 'sky']) assert(ids.includes(id), `the dock offers ${id}`);
  assert(manifest.accent, 'the dock is tinted to the scene');
  for (const control of manifest.controls) {
    assert(control.label && control.icon && control.kind, `${control.id} is labelled`);
    if (control.kind === 'tool') assert(['desktop', 'overlay'].includes(control.capture), `${control.id} says how it takes the mouse`);
  }

  // A fireworks volley: bolts leave the staff one after another and burst in the sky.
  globalThis.habitatControl('fireworks');
  assert.equal(wizard.state, 'twirl');
  let bolts = 0;
  for (let k = 0; k < 60 * 4; k++) { app.seconds(1 / 60); bolts = Math.max(bolts, D.projectiles.filter(p => p.alive).length); }
  assert(bolts >= 2, `several bolts in the air at once (${bolts})`);
  assertAllInPalette(assert, app.render(), scene.palette, 'fireworks');
  assert.equal(moon.state, 'intact', 'the fireworks keep clear of the moon');
  app.seconds(4);

  // A meteor shower: shooting stars streak across from the same side.
  globalThis.habitatControl('meteors');
  let streaks = 0;
  for (let k = 0; k < 60 * 3; k++) { app.seconds(1 / 60); streaks = Math.max(streaks, D.meteors.filter(m => m.alive).length); }
  assert(streaks >= 2, `meteors overlap (${streaks})`);
  assert(D.meteors.every(m => !m.alive || m.vx < 0), 'they share a radiant');
  assertAllInPalette(assert, app.render(), scene.palette, 'meteor shower');
  app.seconds(4);
  assert(D.meteors.every(m => !m.alive), 'and burn out');

  // The owl and the bats.
  globalThis.habitatControl('owl');
  assert.equal(D.tower.owl.state, 'fly');
  globalThis.habitatControl('bats');
  app.seconds(30);

  // The sky: snow falls and settles out of the way, the aurora fades in, clear is clear.
  globalThis.habitatControl('sky', 'snow');
  assert.equal(globalThis.habitatControls().controls.find(c => c.id === 'sky').value, 'snow');
  const before = D.particles.count;
  app.seconds(6);
  assert(D.particles.count > before + 100, 'snow is falling');
  assertAllInPalette(assert, app.render(), scene.palette, 'snow');
  globalThis.habitatControl('sky', 'aurora');
  app.seconds(4);
  assert(D.aurora > 0.9, 'the aurora comes up');
  const lit = app.render();
  assertAllInPalette(assert, lit, scene.palette, 'aurora');
  globalThis.habitatControl('sky', 'clear');
  app.seconds(20);
  assert.equal(D.aurora, 0, 'and fades again');
  assert(D.particles.count < 200, 'the snow has all landed');

  // Tools: the wand plays like a finger (a tap on the sky is a small firework), the
  // firefly tool lets one loose where the desktop was clicked.
  const scale = app.presenter.state.scale;
  assert.equal(globalThis.habitatUse('touch', { phase: 'tap', x: L.W * 0.6 * scale, y: L.horizonY * 0.4 * scale }), 'none');
  assert.equal(wizard.state, 'cast', 'a wand tap casts at once');
  app.seconds(3);
  assert.equal(globalThis.habitatUse('touch', { phase: 'start', x0: L.moonX * scale, y0: L.moonY * scale, x: L.moonX * scale, y: L.moonY * scale }), 'herd');
  app.seconds(0.5);
  assert.equal(wizard.state, 'charge', 'holding the wand charges');
  globalThis.habitatUse('touch', { phase: 'end', x0: L.moonX * scale, y0: L.moonY * scale, x: L.moonX * scale, y: L.moonY * scale });
  app.seconds(0.1);
  assert.equal(wizard.state, 'cast');
  app.seconds(30);
  assert.equal(globalThis.habitatUse('touch', { phase: 'start', x0: L.W * 0.6 * scale, y0: (L.groundY + 8) * scale, x: L.W * 0.6 * scale, y: (L.groundY + 8) * scale }), 'none', 'the wand never draws a marquee');
  globalThis.habitatUse('touch', { phase: 'cancel', x0: 0, y0: 0, x: 0, y: 0 });
}

// Portrait and ultrawide screens lay out without the battlements covering the wizard.
for (const [w, h] of [[390, 844], [3440, 1440], [1920, 1080]]) {
  const size = D.layout;
  const scale = Math.max(1, Math.round(h / 360));
  scene.resize(Math.round(w / scale), Math.round(h / scale));
  const l = D.layout;
  assert(l.wizardX > 10 * l.k && l.moonX < l.W - l.moonR, `${w}x${h}: wizard and moon on screen`);
  const surface = app.surface;
  surface.resize(l.W, l.H);
  scene.update(1 / 60, 0);
  assertAllInPalette(assert, app.render(), scene.palette, `${w}x${h}`);
  void size;
}

// A collapsed or hidden canvas (a pixel or two across) still lays out and draws.
for (const [w, h] of [[1, 1], [24, 12], [2, 600]]) {
  scene.resize(w, h);
  app.surface.resize(w, h);
  scene.update(1 / 60, 0);
  assertAllInPalette(assert, app.render(), scene.palette, `${w}x${h}`);
}

// Eco draws the coarse 180-row grid, and the quality menu switches grids live.
{
  const select = app.elements.get('#quality');
  select.value = 'eco';
  select.dispatch('change', {});
  assert.equal(app.presenter.state.height, 180, 'eco keeps the chunky grid');
  assert.equal(D.layout.u, 1);
  app.seconds(2);
  assertAllInPalette(assert, app.render(), scene.palette, 'eco frame');
  const owl = D.tower.owl;
  app.hostClick(owl.x + 4, owl.y + 5);
  assert.equal(owl.state, 'fly', 'the coarse grid is still hit-tested at its own scale');
  select.value = 'balanced';
  select.dispatch('change', {});
  assert.equal(app.presenter.state.height, 360, 'switching back redraws on the fine grid');
  assert.equal(D.layout.u, 2);
  app.seconds(1);
  assertAllInPalette(assert, app.render(), scene.palette, 'after switching quality');
}

console.log('PASS: moonspire charge, crack, heal, burst, mend, backfire, host clicks and drags, tray spell, residents, instruments, dock controls (fireworks, meteors, snow, aurora, wand), layouts and quality grids');
