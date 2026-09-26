import assert from 'node:assert/strict';
import { bootScene, assertAllInPalette } from '../../shared/tests/headless.mjs';

const app = await bootScene('../../moonspire/src/main.js', { size: [1280, 720], search: '?capture&seed=7' });
const { scene } = app;
const D = scene.debug;
const L = D.layout;
const moon = D.moonCtl.moon;
const wizard = D.wiz.wizard;
const state = () => scene.stats();

// The screen is about 180 pixels tall at a whole-number scale, and the layout fits it.
{
  const s = app.presenter.state;
  assert.equal(s.scale, 4);
  assert.equal(s.width, 320); assert.equal(s.height, 180);
  assert(L.moonX > L.wizardX + 60, 'the moon is across the sky from the wizard');
  assert(L.groundY > L.horizonY && L.groundY < s.height - 20);
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
  const owl = D.rampart.owl;
  app.hostClick(owl.x + 4, owl.y + 5);
  assert.equal(owl.state, 'fly');
  app.seconds(30);
  assert.equal(owl.state, 'perch', 'the owl returns to its battlement');
  app.hostClick(D.rampart.brazier.x, D.rampart.brazier.y - 6);
  assert.equal(D.rampart.brazier.flare, 1);
  app.hostClick(L.wizardX, L.groundY - 20);
  assert.equal(wizard.state, 'twirl');
  let added = 0;
  while (globalThis.habitatAddFish(100, 100) && added < 100) added++;
  assert(added > 0 && added < 100, 'fireflies are capped');
}

// Portrait and ultrawide screens lay out without the battlements covering the wizard.
for (const [w, h] of [[390, 844], [3440, 1440]]) {
  const size = D.layout;
  scene.resize(Math.round(w / Math.max(1, Math.round(h / 180))), Math.round(h / Math.max(1, Math.round(h / 180))));
  const l = D.layout;
  assert(l.wizardX > 10 && l.moonX < l.W - l.moonR, `${w}x${h}: wizard and moon on screen`);
  const surface = app.surface;
  surface.resize(l.W, l.H);
  scene.update(1 / 60, 0);
  assertAllInPalette(assert, app.render(), scene.palette, `${w}x${h}`);
  void size;
}

console.log('PASS: moonspire charge, crack, heal, burst, mend, backfire, host clicks and drags, tray spell, residents and layouts');
