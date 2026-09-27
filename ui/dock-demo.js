// The dock opened in a browser (npm start, then /ui/dock.html?scene=moonspire): stands
// in for the Windows host with the real scene running behind it, so the dock can be tried
// and styled without building the app. Hover the pill to open it.
const HABITATS = [
  { id: 'riverscape', title: 'Riverscape', accent: '#8fd6a8' },
  { id: 'reefscape', title: 'Reefscape', accent: '#5fd0e6' },
  { id: 'moonspire', title: 'Moonspire', accent: '#b69cff' },
  { id: 'pixelreef', title: 'Pixel Reef', accent: '#56c7ff' },
];
const params = new URLSearchParams(location.search);
let habitat = HABITATS.find(h => h.id === params.get('scene')) || HABITATS[2];
let paused = false, pinned = params.has('open'), expanded = pinned, activeTool = null, leaveTimer = 0;
const settings = { quality: 'balanced', population: 'normal', edge: params.get('edge') === 'top' ? 'top' : 'bottom' };

document.body.style.background = '#000';
const frame = document.createElement('iframe');
Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', border: '0', zIndex: '-1' });
document.body.prepend(frame);

const scene = () => frame.contentWindow;
function load() {
  frame.src = `../scenes/${habitat.id}/wallpaper.html?quality=${settings.quality}&population=${settings.population}`;
}
frame.addEventListener('load', () => {
  const wait = setInterval(() => {
    if (typeof scene()?.habitatControls !== 'function') return;
    clearInterval(wait);
    scene().habitatRate?.(60);
    push();
  }, 100);
});

function push() {
  const manifest = scene()?.habitatControls?.() || { controls: [] };
  window.dockState({
    expanded: expanded || pinned, pinned, edge: settings.edge,
    habitat: { ...habitat, accent: manifest.accent || habitat.accent }, habitats: HABITATS,
    controls: manifest.controls, activeTool, paused, running: true,
    status: paused ? 'Paused' : 'Running at 60 fps (preview)',
    quality: settings.quality, population: settings.population, populationSupported: habitat.id !== 'moonspire',
  });
}

const dock = document.querySelector('#dock');
dock.addEventListener('mouseenter', () => { clearTimeout(leaveTimer); if (!expanded) { expanded = true; push(); } });
dock.addEventListener('mouseleave', () => {
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { expanded = false; push(); }, 600);
});

window.addEventListener('dock-message', ({ detail: m }) => {
  console.info('dock →', JSON.stringify(m));
  switch (m.type) {
    case 'control': scene()?.habitatControl?.(m.id, m.value); break;
    case 'tool': activeTool = m.id; break;
    case 'scene': habitat = HABITATS.find(h => h.id === m.id) || habitat; activeTool = null; load(); break;
    case 'pause': paused = !paused; scene()?.habitatPause?.(paused); break;
    case 'pin': pinned = !pinned; break;
    case 'quality': case 'population': settings[m.type] = m.value; load(); break;
    case 'edge': settings.edge = m.value; break;
    case 'hideDock': dock.style.opacity = '.3'; break;
  }
  setTimeout(push, 30);
});
addEventListener('keydown', event => { if (event.key === 'Escape' && activeTool) { activeTool = null; push(); } });

load();
