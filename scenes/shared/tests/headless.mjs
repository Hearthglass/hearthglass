// Just enough of a browser to boot a pixel scene in Node: a canvas whose 2D context
// accepts image data, a window with the host's hooks, and pointer events that can be
// dispatched at the canvas. Nothing is drawn; the scene's own surface is inspected instead.

function element(extra = {}) {
  const listeners = {};
  return {
    dataset: {}, style: {}, attributes: {}, children: [], disabled: false, hidden: false, inert: false,
    textContent: '', innerHTML: '', title: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, event) { for (const fn of listeners[type] || []) fn(event); },
    insertBefore(child) { this.children.push(child); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    focus() {}, closest: () => null,
    ...extra,
  };
}

function context2d() {
  return {
    imageSmoothingEnabled: false, fillStyle: '#000',
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, drawImage() {}, fillRect() {},
  };
}

function canvas(width, height) {
  return element({
    width: 0, height: 0, clientWidth: width, clientHeight: height,
    getContext: () => context2d(),
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
}

/**
 * Boot a scene's main.js. `size` is the CSS size of the page; `host` makes it the
 * wallpaper page (data-motion="host"). Returns the scene handle and input helpers.
 */
export async function bootScene(entry, { size = [1280, 720], search = '?capture', host = false, dpr = 1 } = {}) {
  const [width, height] = size;
  const scene = canvas(width, height);
  const elements = new Map();
  for (const id of ['#habitat', '#loading', '#pause', '#action', '#fullscreen', '#quality', '#tool-status', '#hide', '#show-controls', '#error']) elements.set(id, element());
  elements.set('#scene', scene);
  elements.set('.chrome .buttons', element());
  const docListeners = {};
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = dpr;
  globalThis.location = { search, href: `http://localhost/${search}` };
  globalThis.document = {
    documentElement: { dataset: host ? { motion: 'host' } : {} },
    body: element(),
    visibilityState: 'visible',
    fullscreenElement: null,
    baseURI: 'http://localhost/',
    querySelector: selector => elements.get(selector) || null,
    querySelectorAll: () => [],
    createElement: tag => (tag === 'canvas' ? canvas(1, 1) : element()),
    createTextNode: text => ({ text }),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  try { Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true }); } catch {}
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  await import(new URL(entry, import.meta.url).href);
  const handle = globalThis.pixelScene;
  if (!handle) throw new Error(`${entry} did not start: ${elements.get('#error').children.map(c => c.text || c.textContent).join('')}`);
  const toClient = (x, y) => ({ clientX: x * handle.presenter.state.scale / dpr, clientY: y * handle.presenter.state.scale / dpr });
  return {
    ...handle,
    canvas: scene,
    elements,
    key(key, code = '') { for (const fn of docListeners.keydown || []) fn({ key, code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: { closest: () => null }, preventDefault() {} }); },
    /** A real press at logical (x, y): pointerdown now, pointerup later. */
    press(x, y) { scene.dispatch('pointerdown', { ...toClient(x, y), button: 0, pointerId: 1, isTrusted: true, pointerType: 'mouse' }); },
    move(x, y, held = true) { scene.dispatch('pointermove', { ...toClient(x, y), pointerId: held ? 1 : 2, isTrusted: true }); },
    release(x, y) { scene.dispatch('pointerup', { ...toClient(x, y), pointerId: 1, type: 'pointerup', isTrusted: true }); },
    /** The wallpaper host's click: a lone, untrusted pointerdown. */
    hostClick(x, y) { scene.dispatch('pointerdown', { ...toClient(x, y), button: 0, isTrusted: false }); },
    /** The host's drag, in logical pixels. */
    hostDrag(phase, x0, y0, x, y) {
      const a = toClient(x0, y0), b = toClient(x, y);
      return globalThis.habitatDrag({ phase, x0: a.clientX, y0: a.clientY, x: b.clientX, y: b.clientY });
    },
    seconds(s) { handle.step(Math.round(s * 60)); },
    render() { handle.scene.render(handle.surface, handle.time); return handle.surface; },
  };
}

/** Every pixel is a real palette colour: nothing CLEAR or out of range reaches the screen. */
export function assertAllInPalette(assert, surface, palette, label) {
  let bad = -1;
  for (let i = 0; i < surface.data.length; i++) if (surface.data[i] >= palette.count) { bad = i; break; }
  assert.equal(bad, -1, `${label}: pixel ${bad} is ${surface.data[bad]}, outside the palette`);
}
