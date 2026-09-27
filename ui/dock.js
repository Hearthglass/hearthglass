// The wallpaper host's control dock. The host (wallpaper/windows/DockWindow.cs) owns the
// state and calls window.dockState(partial) whenever it changes; this page draws it and
// posts back what was clicked, plus its own size so the host can fit the window to it.
//
// State: { expanded, pinned, edge: 'bottom' | 'top', habitat: { id, title, accent },
//   habitats: [{ id, title, accent }], controls: [...] (see scenes/shared/host-controls.js),
//   activeTool, paused, status, running, quality, population, populationSupported }
//
// Messages: { type: 'ready' } { type: 'size', width, height } (device px)
//   { type: 'control', id, value? } { type: 'tool', id | null } { type: 'scene', id }
//   { type: 'pause' } { type: 'pin' } { type: 'quality' | 'population' | 'edge', value }
//   { type: 'hideDock' }
import { iconSvg } from './icons.js';

const dock = document.querySelector('#dock');
const bar = document.querySelector('#bar');
const hint = document.querySelector('#hint');
const sheet = document.querySelector('#sheet');
const handle = document.querySelector('#handle');
const handleTool = document.querySelector('#handle-tool');
const host = window.chrome?.webview;
// Room around the dock for its shadow; the window is this much bigger than the dock.
const SIDE = 16, EDGE = 8;

const send = message => {
  if (host) host.postMessage(message);
  else window.dispatchEvent(new CustomEvent('dock-message', { detail: message }));
};

let state = {
  expanded: false, pinned: false, edge: 'bottom',
  habitat: { id: '', title: '', accent: '#8fd6a8' }, habitats: [],
  controls: [], activeTool: null, paused: false, running: true, status: '',
  quality: 'detail', population: 'normal', populationSupported: false,
};
let openSheet = null;   // 'scene', 'settings' or 'choice:<id>'
let hover = null;       // the button under the pointer: { label, hint }
let shown = 'collapsed';
let leaving = 0;

window.dockState = next => {
  state = { ...state, ...next };
  if (!state.expanded) openSheet = null;
  if (openSheet?.startsWith('choice:') && !control(openSheet.slice(7))) openSheet = null;
  update();
};

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const control = id => state.controls.find(c => c.id === id);
const activeTool = () => (state.activeTool ? control(state.activeTool) : null);
const option = c => c.options?.find(o => o.value === c.value);

function update() {
  dock.dataset.edge = state.edge === 'top' ? 'top' : 'bottom';
  document.documentElement.style.setProperty('--accent', state.habitat?.accent || '#8fd6a8');
  if (state.expanded && shown === 'collapsed') {
    clearTimeout(leaving); leaving = 0;
    shown = 'expanded';
    dock.classList.remove('collapsed', 'leaving');
  } else if (!state.expanded && shown === 'expanded') {
    // play the card out, then shrink to the pill (and the window with it)
    if (!leaving) {
      dock.classList.add('leaving');
      leaving = setTimeout(() => {
        leaving = 0; shown = 'collapsed'; hover = null;
        dock.classList.remove('leaving');
        dock.classList.add('collapsed');
        render();
      }, 120);
    }
    return;
  } else if (state.expanded && leaving) {
    clearTimeout(leaving); leaving = 0;
    dock.classList.remove('leaving');
  }
  render();
}

// Only what changed is replaced, so hover states and the sheet's entrance survive updates.
function setHtml(element, html) {
  if (element._html !== html) { element.innerHTML = html; element._html = html; }
}

function render() {
  const tool = activeTool();
  handle.classList.toggle('tool', Boolean(tool));
  handle.classList.toggle('paused', state.paused);
  setHtml(handleTool, tool ? iconSvg(tool.icon) : '');
  if (shown === 'expanded') {
    setHtml(bar, barHtml());
    setHtml(hint, hintHtml());
    const sheetHtml = openSheet ? sheetContent() : '';
    sheet.hidden = !sheetHtml;
    setHtml(sheet, sheetHtml);
  }
  requestAnimationFrame(reportSize);
}

function button({ cls = 'btn', act, id = '', extra = '', tip, icon, inner = '', disabled = false }) {
  const data = `data-act="${act}"${id ? ` data-id="${escapeHtml(id)}"` : ''}${extra}`;
  const tipAttr = tip ? ` data-label="${escapeHtml(tip.label)}" data-hint="${escapeHtml(tip.hint || '')}" aria-label="${escapeHtml(tip.label)}"` : '';
  return `<button class="${cls}" ${data}${tipAttr}${disabled ? ' disabled' : ''}>${icon ? iconSvg(icon) : ''}${inner}</button>`;
}

function barHtml() {
  const caret = `<span class="caret">${iconSvg('chevron')}</span>`;
  const still = state.paused || !state.running;
  const groups = [[], [], []];
  for (const c of state.controls) {
    const tip = { label: c.label, hint: c.hint };
    if (c.kind === 'action') groups[0].push(button({ act: 'control', id: c.id, tip, icon: c.icon, disabled: still }));
    else if (c.kind === 'tool') {
      const active = state.activeTool === c.id;
      groups[1].push(button({
        cls: `btn tool${active ? ' active' : ''}`, act: 'tool', id: c.id, icon: c.icon, disabled: still && !active,
        tip: { label: c.label, hint: `${c.hint}${c.capture === 'overlay' ? ' · Esc when you are done' : ''}` },
      }));
    } else if (c.kind === 'toggle') {
      groups[2].push(button({ cls: `btn toggle${c.value ? ' on' : ''}`, act: 'toggle', id: c.id, tip, icon: c.icon }));
    } else if (c.kind === 'choice') {
      const o = option(c);
      groups[2].push(button({
        cls: `btn choice${openSheet === `choice:${c.id}` ? ' open' : ''}`, act: 'sheet', extra: ` data-sheet="choice:${escapeHtml(c.id)}"`,
        icon: o?.icon || c.icon, inner: caret, tip: { label: `${c.label}: ${o?.label ?? c.value}`, hint: c.hint },
      }));
    }
  }
  const parts = [
    `<button class="scene${openSheet === 'scene' ? ' open' : ''}" data-act="sheet" data-sheet="scene" data-label="Scene" data-hint="Pick another living wallpaper"><span class="swatch"></span><span>${escapeHtml(state.habitat?.title)}</span>${caret}</button>`,
  ];
  for (const group of groups) if (group.length) parts.push('<span class="sep"></span>', ...group);
  parts.push('<span class="sep"></span>');
  parts.push(button({ act: 'pause', icon: state.paused ? 'play' : 'pause', tip: state.paused ? { label: 'Resume', hint: 'Start the scene moving again' } : { label: 'Pause', hint: 'Hold the scene still' } }));
  parts.push(button({ cls: `btn${state.pinned ? ' on' : ''}`, act: 'pin', icon: 'pin', tip: state.pinned ? { label: 'Unpin', hint: 'Let the dock tuck itself away again' } : { label: 'Keep open', hint: 'Keep the dock open until unpinned (Ctrl+Alt+F)' } }));
  parts.push(button({ cls: `btn${openSheet === 'settings' ? ' open' : ''}`, act: 'sheet', extra: ' data-sheet="settings"', icon: 'gear', tip: { label: 'Settings', hint: 'Quality, population and where the dock sits' } }));
  return parts.join('');
}

function hintHtml() {
  if (hover) return `<b>${escapeHtml(hover.label)}</b>${hover.hint ? `<span>${escapeHtml(hover.hint)}</span>` : ''}`;
  const tool = activeTool();
  if (tool) {
    const end = tool.capture === 'overlay' ? '<span class="key">Esc</span>' : '<span>· click it again to stop</span>';
    return `<span class="dot"></span><b>${escapeHtml(tool.label)}</b><span>${escapeHtml(tool.hint)}</span>${end}`;
  }
  if (state.paused) return '<span>Paused · press</span><b>▶</b><span>to carry on</span>';
  return `<b>${escapeHtml(state.habitat?.title)}</b><span>· ${escapeHtml(state.status)}</span>`;
}

function segmented(kind, value, options) {
  return `<div class="segmented">${options.map(([v, label]) =>
    `<button data-act="${kind}" data-value="${v}" class="${v === value ? 'selected' : ''}">${label}</button>`).join('')}</div>`;
}

function sheetContent() {
  const tick = `<span class="tick">${iconSvg('check')}</span>`;
  if (openSheet === 'scene') {
    return `<h3>Scene</h3><div class="scenes">${state.habitats.map(h =>
      `<button class="scene-card${h.id === state.habitat?.id ? ' selected' : ''}" data-act="scene" data-id="${escapeHtml(h.id)}" style="--swatch:${escapeHtml(h.accent)}"><span class="swatch"></span><span class="name">${escapeHtml(h.title)}</span></button>`).join('')}</div>`;
  }
  if (openSheet === 'settings') {
    const still = state.paused || !state.running;
    return [
      `<div class="status${still ? ' still' : ''}"><span class="dot"></span>${escapeHtml(state.status)}</div>`,
      `<div class="setting"><span>Quality</span>${segmented('quality', state.quality, [['eco', 'Eco'], ['balanced', 'Balanced'], ['detail', 'Detail']])}</div>`,
      state.populationSupported ? `<div class="setting"><span>Population</span>${segmented('population', state.population, [['few', 'Few'], ['normal', 'Normal'], ['lots', 'Lots'], ['crowded', 'Crowded']])}</div>` : '',
      `<div class="setting"><span>Dock</span>${segmented('edge', state.edge, [['bottom', 'Bottom'], ['top', 'Top']])}</div>`,
      `<div class="link-row"><button class="row" data-act="hideDock">${iconSvg('hide')}Hide the dock</button></div>`,
    ].join('');
  }
  if (openSheet?.startsWith('choice:')) {
    const c = control(openSheet.slice(7));
    if (!c) return '';
    return `<h3>${escapeHtml(c.label)}</h3>${c.options.map(o =>
      `<button class="row${o.value === c.value ? ' selected' : ''}" data-act="choose" data-id="${escapeHtml(c.id)}" data-value="${escapeHtml(o.value)}">${o.icon ? `<span class="lead">${iconSvg(o.icon)}</span>` : ''}<span class="text"><span class="label">${escapeHtml(o.label)}</span>${o.hint ? `<span class="sub">${escapeHtml(o.hint)}</span>` : ''}</span>${tick}</button>`).join('')}`;
  }
  return '';
}

let lastSize = '';
function reportSize() {
  const r = dock.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.ceil((r.width + SIDE * 2) * dpr), height = Math.ceil((r.height + SIDE + EDGE) * dpr);
  const key = `${width}x${height}`;
  if (key === lastSize) return;
  lastSize = key;
  send({ type: 'size', width, height });
}
new ResizeObserver(() => reportSize()).observe(dock);

dock.addEventListener('click', event => {
  const target = event.target.closest('[data-act]');
  if (!target || target.disabled) return;
  const { act, id, value } = target.dataset;
  const c = id ? control(id) : null;
  switch (act) {
    case 'control':
      send({ type: 'control', id });
      target.classList.remove('fired'); void target.offsetWidth; target.classList.add('fired');
      return;
    case 'toggle':
      if (!c) return;
      c.value = !c.value;
      send({ type: 'control', id, value: c.value });
      break;
    case 'choose':
      if (!c) return;
      c.value = value;
      openSheet = null;
      send({ type: 'control', id, value });
      break;
    case 'tool':
      state.activeTool = state.activeTool === id ? null : id;
      send({ type: 'tool', id: state.activeTool });
      break;
    case 'sheet':
      openSheet = openSheet === target.dataset.sheet ? null : target.dataset.sheet;
      break;
    case 'scene':
      openSheet = null;
      if (id !== state.habitat?.id) send({ type: 'scene', id });
      break;
    case 'pause': send({ type: 'pause' }); return;
    case 'pin': send({ type: 'pin' }); return;
    case 'quality': case 'population': case 'edge':
      state[act] = value;
      send({ type: act, value });
      break;
    case 'hideDock': send({ type: 'hideDock' }); return;
  }
  render();
});

dock.addEventListener('mouseover', event => {
  const target = event.target.closest('[data-label]');
  const next = target ? { label: target.dataset.label, hint: target.dataset.hint } : null;
  if (next?.label === hover?.label && next?.hint === hover?.hint) return;
  hover = next;
  if (shown === 'expanded') setHtml(hint, hintHtml());
});
dock.addEventListener('mouseleave', () => {
  hover = null;
  if (shown === 'expanded') setHtml(hint, hintHtml());
});
document.addEventListener('contextmenu', event => event.preventDefault());

render();
if (host) send({ type: 'ready' });
else import('./dock-demo.js');
