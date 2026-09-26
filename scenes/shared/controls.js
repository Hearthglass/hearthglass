import { qualityName } from './render-policy.js';
import { setActionIcon } from '../../ui/icons.js';

export function preferredQuality(params) {
  let saved;
  try { saved = localStorage.getItem('habitat-quality'); } catch {}
  return qualityName(params.get('quality') || saved || (navigator.connection?.saveData ? 'eco' : 'balanced'));
}

export function pointerTools(kinds = []) {
  const tools = [{ id: 'feed', icon: 'feed', label: 'Click to feed' }];
  if (!kinds.length) tools.push({ id: 'fish', icon: 'fish', label: 'Click to add fish' });
  else for (const kind of kinds)
    tools.push({ id: `fish:${kind.id}`, icon: 'fish', label: `Click to add ${kind.label}`, kind: kind.id });
  return tools;
}

export function installControls({
  habitat, isPaused, isRunning, pause, feed, quality, setQuality,
  tools = pointerTools(), toolIndex = 0, setTool,
}) {
  document.querySelectorAll('.chrome button, .chrome select, #show-controls').forEach(element => { element.disabled = false; });
  const pauseButton = document.querySelector('#pause');
  const feedButton = document.querySelector('#feed');
  const toolButton = document.querySelector('#tool');
  const select = document.querySelector('#quality');
  const fullscreenButton = document.querySelector('#fullscreen');
  const status = document.querySelector('#tool-status');
  const canvas = document.querySelector('#scene');
  setActionIcon(feedButton, 'feed', 'Feed fish');
  let index = ((Number.isInteger(toolIndex) ? toolIndex : 0) % tools.length + tools.length) % tools.length;
  const current = () => tools[index];
  function announce(tool) {
    if (status) status.textContent = tool.id === 'feed'
      ? `${tool.label}. Ctrl+← or Ctrl+→ adds fish instead.`
      : `${tool.label}. Ctrl+← or Ctrl+→ feeds instead.${tools.length > 2 ? ' Ctrl+↑ / Ctrl+↓ changes species.' : ''}`;
    if (canvas) {
      canvas.style.cursor = tool.id === 'feed' ? 'cell' : 'copy';
      canvas.dataset.tool = tool.id;
    }
  }
  let lastFish = tools.findIndex(tool => tool.id !== 'feed');
  function applyTool(next, announceChange = true) {
    index = ((next % tools.length) + tools.length) % tools.length;
    const tool = current();
    if (tool.id !== 'feed') lastFish = index;
    setTool?.(tool, index);
    if (toolButton) {
      setActionIcon(toolButton, tool.icon, tool.label, 'Ctrl+← / Ctrl+→');
      toolButton.setAttribute('aria-pressed', String(tool.id !== 'feed'));
    }
    if (announceChange) announce(tool);
  }
  function toggleFeedFish() {
    if (current().id === 'feed') applyTool(lastFish >= 0 ? lastFish : 0);
    else applyTool(0);
  }
  function cycleKind(delta) {
    const kinds = tools.map((tool, i) => [tool, i]).filter(([tool]) => tool.id !== 'feed');
    if (!kinds.length) { toggleFeedFish(); return; }
    const at = Math.max(0, kinds.findIndex(([, i]) => i === index));
    applyTool(kinds[(at + delta + kinds.length) % kinds.length][1]);
  }
  function refreshFullscreen() {
    const active = Boolean(document.fullscreenElement);
    setActionIcon(fullscreenButton, active ? 'exit-fullscreen' : 'fullscreen', active ? 'Exit fullscreen' : 'Fullscreen', 'F');
  }
  document.addEventListener('fullscreenchange', refreshFullscreen);
  refreshFullscreen();
  function refresh() {
    if (pauseButton) {
      setActionIcon(pauseButton, isPaused() ? 'play' : 'pause', isPaused() ? 'Play' : 'Pause', 'Space');
      pauseButton.setAttribute('aria-pressed', String(isPaused()));
    }
    if (feedButton) feedButton.disabled = !isRunning();
    if (toolButton) toolButton.disabled = !isRunning();
    if (select) select.value = quality();
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
  pauseButton?.addEventListener('click', () => pause(!isPaused()));
  feedButton?.addEventListener('click', feed);
  toolButton?.addEventListener('click', () => { if (!isRunning()) return; toggleFeedFish(); });
  fullscreenButton?.addEventListener('click', fullscreen);
  document.querySelector('#hide')?.addEventListener('click', () => clean(true));
  document.querySelector('#show-controls')?.addEventListener('click', () => clean(false));
  select?.addEventListener('change', () => {
    setQuality(select.value);
    try { localStorage.setItem('habitat-quality', select.value); } catch {}
    refresh();
  });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.target.closest('button,select,input,textarea,a,[contenteditable]')) return;
    if (event.code === 'Space') { event.preventDefault(); pause(!isPaused()); }
    else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) fullscreen();
    else if (event.key.toLowerCase() === 'h') clean(!document.body.classList.contains('clean'));
    else if (event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      toggleFeedFish();
    } else if (event.ctrlKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      cycleKind(event.key === 'ArrowDown' ? 1 : -1);
    }
  });
  document.querySelectorAll('.chrome').forEach(element => { element.inert = document.body.classList.contains('clean'); });
  applyTool(index, false);
  announce(current());
  refresh();
  return Object.assign(refresh, { tool: current, tools });
}

export function reportSceneError(error) {
  console.error(error);
  const loading = document.querySelector('#loading');
  if (loading) loading.hidden = true;
  const box = document.querySelector('#error');
  if (!box) return;
  box.hidden = false;
  box.replaceChildren(document.createTextNode('The aquarium could not start. '));
  const reload = document.createElement('a');
  reload.href = location.href;
  reload.textContent = 'Reload aquarium';
  box.append(reload);
}
