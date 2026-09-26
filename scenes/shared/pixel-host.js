// Runs a pixel scene: page controls, the wallpaper host's window.habitat* commands,
// pointer input (including press-and-hold), and a fixed 60 Hz simulation step under a
// demand-driven presentation loop.
//
// A scene is an object with:
//   palette, rows?                        the palette to present with and target row count
//   resize(width, height)                 logical size changed (also called once at start)
//   update(dt, time)                      one fixed step (dt = 1/60 s)
//   render(surface, time)                 draw the whole frame into the surface
//   press(x, y, info) / move(x, y, held) / release(x, y) / cancel() / leave()
//   action(source)                        the main button, and the host's Feed
//   cursor?(x, y)                         CSS cursor for the point under the pointer
//   hint?                                 one line shown briefly on load in a browser
//   setMode?(mode) / setPlayMode?(active) / stats?()
//   buttons?: [{ id, icon, label, key, run, pressed? }]  extra footer buttons

import { Surface, createPresenter } from './pixel-engine.js';
import { createFrameLoop } from './frame-loop.js';
import { setActionIcon } from '../../ui/icons.js';
import { reportSceneError } from './controls.js';

export const STEP = 1 / 60;
const clampRows = rows => Math.max(60, Math.min(400, rows));
const MAX_STEPS = 8;
const PIXEL_QUALITY = { eco: { fps: 30 }, balanced: { fps: 60 }, detail: { fps: 60 } };

export function runPixelScene(createScene) {
  const canvas = document.querySelector('#scene');
  const habitat = document.querySelector('#habitat');
  const loading = document.querySelector('#loading');
  const params = new URLSearchParams(location.search);
  const isHost = document.documentElement.dataset.motion === 'host';
  const capture = params.has('capture');
  if (capture) document.body.classList.add('clean', 'capture');
  let quality = params.get('quality');
  if (!Object.hasOwn(PIXEL_QUALITY, quality)) {
    try { quality = localStorage.getItem('habitat-quality'); } catch { quality = null; }
    if (!Object.hasOwn(PIXEL_QUALITY, quality)) quality = 'balanced';
  }
  let hostRate = isHost ? 0 : 60, onBattery = false;
  let paused = capture || (!isHost && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let scene = null, loop = null, presenter = null;
  const surface = new Surface(1, 1);
  let accumulator = 0, time = 0, frames = 0;
  const pending = [];
  const whenReady = fn => (scene ? fn() : pending.push(fn));

  const rate = () => Math.min(PIXEL_QUALITY[quality].fps, hostRate, onBattery ? 30 : 60);
  const applyRate = () => { loop?.setRate(rate()); loop?.setPaused(paused); refreshControls(); };
  window.habitatRate = fps => { if (!Number.isFinite(fps)) return; hostRate = Math.max(0, Math.min(60, fps)); applyRate(); };
  window.habitatPause = value => { paused = Boolean(value); applyRate(); };
  window.habitatPower = battery => { onBattery = Boolean(battery); applyRate(); };
  window.habitatFeed = () => whenReady(() => { scene.action('host'); loop?.invalidate(); });
  window.habitatMode = mode => whenReady(() => scene.setMode?.(mode === 'curious' ? 'curious' : 'shy'));
  window.habitatPlayMode = active => whenReady(() => scene.setPlayMode?.(Boolean(active)));
  window.habitatSelect = () => {};
  window.habitatHerd = () => {};
  window.habitatPopulation = level => whenReady(() => scene.setPopulation?.(level));
  window.habitatAddFish = (x, y) => {
    if (!scene?.addCreature) return false;
    const p = x === undefined ? null : presenter.toLogical(x, y);
    return scene.addCreature(p?.x, p?.y);
  };
  // Host drags (CSS px): the scene treats them like a held pointer.
  let hostDrag = false;
  window.habitatDrag = gesture => {
    if (!scene || !presenter) return 'none';
    const p = presenter.toLogical(gesture.x, gesture.y);
    if (gesture.phase === 'start') {
      const start = presenter.toLogical(gesture.x0, gesture.y0);
      hostDrag = scene.press(start.x, start.y, { source: 'host-drag' }) !== false;
      if (hostDrag) scene.move(p.x, p.y, true);
      return hostDrag ? 'herd' : 'select';
    }
    if (!hostDrag) return 'none';
    if (gesture.phase === 'move') scene.move(p.x, p.y, true);
    else if (gesture.phase === 'end') { scene.release(p.x, p.y); hostDrag = false; }
    else { scene.cancel(); hostDrag = false; }
    loop?.invalidate();
    return 'herd';
  };

  function frame(dt) {
    if (!scene) return;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < MAX_STEPS) {
      scene.update(STEP, time);
      time += STEP;
      accumulator -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;
    scene.render(surface, time);
    presenter.present(surface, scene.palette);
    frames++;
    if (frames === 1 && loading) {
      loading.style.opacity = '0';
      setTimeout(() => { loading.hidden = true; }, 400);
    }
  }

  function resize() {
    if (!presenter) return;
    presenter.resize();
    const { width, height } = presenter.state;
    if (surface.w !== width || surface.h !== height) {
      surface.resize(width, height);
      scene.resize(width, height);
    }
    loop?.invalidate();
  }

  // Pointer input. The wallpaper host synthesises lone pointerdowns for clicks; those are
  // taps with no matching pointerup, so they press and release at once.
  let held = null;
  const logical = event => presenter.toLogical(event.clientX, event.clientY);
  canvas.addEventListener('pointerdown', event => {
    if (!scene || (event.button !== undefined && event.button !== 0)) return;
    const p = logical(event);
    if (!event.isTrusted) {
      scene.press(p.x, p.y, { source: 'host-click' });
      scene.release(p.x, p.y);
      loop?.invalidate();
      return;
    }
    held = event.pointerId;
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    scene.press(p.x, p.y, { source: event.pointerType || 'mouse' });
    loop?.invalidate();
  });
  canvas.addEventListener('pointermove', event => {
    if (!scene) return;
    const p = logical(event);
    scene.move(p.x, p.y, held === event.pointerId);
    if (scene.cursor && event.isTrusted) canvas.style.cursor = scene.cursor(p.x, p.y, held === event.pointerId);
  });
  const end = event => {
    if (!scene || held !== event.pointerId) return;
    held = null;
    const p = logical(event);
    if (event.type === 'pointerup') scene.release(p.x, p.y);
    else scene.cancel();
    loop?.invalidate();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('pointerleave', () => { if (held === null) scene?.leave?.(); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  // Page controls (hidden entirely under the wallpaper host).
  const pauseButton = document.querySelector('#pause');
  const actionButton = document.querySelector('#action');
  const fullscreenButton = document.querySelector('#fullscreen');
  const select = document.querySelector('#quality');
  const status = document.querySelector('#tool-status');
  const extraButtons = [];
  function refreshControls() {
    if (pauseButton) {
      setActionIcon(pauseButton, paused ? 'play' : 'pause', paused ? 'Play' : 'Pause', 'Space');
      pauseButton.setAttribute('aria-pressed', String(paused));
    }
    if (select) select.value = quality;
    for (const { element, spec } of extraButtons) {
      if (spec.pressed) element.setAttribute('aria-pressed', String(Boolean(spec.pressed())));
    }
  }
  function clean(value) {
    document.body.classList.toggle('clean', value);
    document.querySelectorAll('.chrome').forEach(element => { element.inert = value; });
    document.querySelector(value ? '#show-controls' : '#hide')?.focus();
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await habitat.requestFullscreen();
    } catch (error) { console.warn(error.message); }
  }
  function refreshFullscreen() {
    const active = Boolean(document.fullscreenElement);
    setActionIcon(fullscreenButton, active ? 'exit-fullscreen' : 'fullscreen', active ? 'Exit fullscreen' : 'Fullscreen', 'F');
  }
  function installControls() {
    document.querySelectorAll('.chrome button, .chrome select, #show-controls').forEach(element => { element.disabled = false; });
    if (actionButton && scene.actionLabel) setActionIcon(actionButton, scene.actionIcon || 'wand', scene.actionLabel, 'E');
    const buttons = document.querySelector('.chrome .buttons');
    for (const spec of scene.buttons || []) {
      const element = document.createElement('button');
      element.id = spec.id;
      if (spec.pressed) element.setAttribute('aria-pressed', 'false');
      setActionIcon(element, spec.icon, spec.label, spec.key?.toUpperCase());
      element.addEventListener('click', () => { spec.run(); refreshControls(); loop?.invalidate(); });
      buttons?.insertBefore(element, fullscreenButton);
      extraButtons.push({ element, spec });
    }
    pauseButton?.addEventListener('click', () => window.habitatPause(!paused));
    actionButton?.addEventListener('click', () => { scene.action('button'); loop?.invalidate(); });
    fullscreenButton?.addEventListener('click', fullscreen);
    document.addEventListener('fullscreenchange', refreshFullscreen);
    refreshFullscreen();
    document.querySelector('#hide')?.addEventListener('click', () => clean(true));
    document.querySelector('#show-controls')?.addEventListener('click', () => clean(false));
    select?.addEventListener('change', () => {
      quality = Object.hasOwn(PIXEL_QUALITY, select.value) ? select.value : 'balanced';
      try { localStorage.setItem('habitat-quality', quality); } catch {}
      scene.setQuality?.(quality);
      applyRate();
    });
    document.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest('button,select,input,textarea,a,[contenteditable]')) return;
      const key = event.key.toLowerCase();
      if (event.code === 'Space') { event.preventDefault(); window.habitatPause(!paused); }
      else if (key === 'f') fullscreen();
      else if (key === 'h') clean(!document.body.classList.contains('clean'));
      else if (key === 'e') { scene.action('key'); loop?.invalidate(); }
      else {
        const spec = (scene.buttons || []).find(button => button.key === key);
        if (spec) { spec.run(); refreshControls(); loop?.invalidate(); }
      }
    });
    document.querySelectorAll('.chrome').forEach(element => { element.inert = document.body.classList.contains('clean'); });
    refreshControls();
    if (status && scene.hint && !isHost && !capture) setTimeout(() => { status.textContent = scene.hint; }, 900);
  }

  try {
    presenter = createPresenter(canvas, { targetRows: 180 });
    scene = createScene({ params, isHost, capture, quality });
    // ?rows= overrides the target row count: fewer rows, bigger pixels (handy for inspecting art).
    const rows = Number(params.get('rows')) || scene.rows;
    if (rows) presenter.setRows(clampRows(rows));
    const { width, height } = presenter.state;
    surface.resize(width, height);
    scene.resize(width, height);
    // A still for captures and reduced motion still shows the scene settled, not at t=0.
    const warm = Number(params.get('warm') ?? (paused ? 6 : 0));
    for (let i = 0; i < Math.min(60 * 60, warm * 60); i++) { scene.update(STEP, time); time += STEP; }
    installControls();
    loop = createFrameLoop(frame, { fps: rate(), paused, hidden: document.visibilityState === 'hidden' });
    document.addEventListener('visibilitychange', () => loop.setHidden(document.visibilityState === 'hidden'));
    new ResizeObserver(resize).observe(canvas);
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', resize);
    if (!isHost && navigator.getBattery) {
      navigator.getBattery().then(battery => {
        const update = () => window.habitatPower(!battery.charging);
        update();
        battery.addEventListener('chargingchange', update);
      }).catch(() => {});
    }
    for (const fn of pending.splice(0)) fn();
    window.habitatStats = () => ({
      width: presenter.state.width, height: presenter.state.height, scale: presenter.state.scale,
      fps: rate(), paused, frames, ...(scene.stats?.() || {}),
    });
    // Debug handle: step the simulation and draw synchronously (works while the tab is hidden).
    window.pixelScene = {
      scene, surface, presenter, loop,
      step(n = 1) { for (let i = 0; i < n; i++) { scene.update(STEP, time); time += STEP; } },
      draw() { scene.render(surface, time); presenter.present(surface, scene.palette); },
      get time() { return time; },
    };
  } catch (error) {
    reportSceneError(error);
  }
}
