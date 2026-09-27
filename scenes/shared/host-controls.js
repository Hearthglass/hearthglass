// What a scene offers the Windows wallpaper host's control dock. The dock builds itself
// from this list, so each scene shows its own buttons rather than a fixed fish menu.
//
//   window.habitatControls()        → { accent, population, controls: [control, …] }
//     (population: the scene can be restocked with window.habitatPopulation)
//   window.habitatControl(id, value) runs an action, or sets a toggle or choice
//   window.habitatUse(tool, gesture) a click or drag on the desktop with a tool picked:
//     gesture = { phase: 'tap' | 'start' | 'move' | 'end' | 'cancel', x, y, x0?, y0? } in
//     CSS px; a 'start' answers 'select' when the host should draw a marquee (and share
//     the drag with the other screens), otherwise 'herd' or 'none'
//
// A control is one of
//   { id, kind: 'action', label, icon, hint }
//   { id, kind: 'tool', label, icon, hint, capture: 'desktop' | 'overlay', rapid? }
//       desktop: clicks and drags on empty desktop, between the icons, while it is picked
//       overlay: the whole screen belongs to the tool until Esc (drags over icons, holds)
//       rapid: every click counts (adding fish) instead of the feeding cooldown
//   { id, kind: 'toggle', label, icon, hint, value: bool, persist? }
//   { id, kind: 'choice', label, icon, hint, value, options: [{ value, label, icon?, hint? }], persist? }
// Toggles and choices are remembered by the host per scene unless persist is false.

export const MOODS = [
  { value: 'shy', label: 'Shy', hint: 'They keep their distance from the pointer' },
  { value: 'curious', label: 'Curious', hint: 'They come over to see the pointer' },
];

/** Installs the scene's side; returns a function to call when a value changes by itself. */
export function installHostControls({ accent, population = false, controls, control, use }) {
  const changed = () => {
    try { window.chrome?.webview?.postMessage({ type: 'controls' }); } catch {}
  };
  window.habitatControls = () => ({ accent, population, controls: controls() });
  window.habitatControl = (id, value) => { control(id, value); changed(); };
  window.habitatUse = (tool, gesture) => use(tool, gesture) || 'none';
  changed();
  return changed;
}

/**
 * The two aquariums share their dock: feed, click to feed, add fish, herd, and mood.
 * `dropAt(x, y)` feeds at a point, `drag(gesture)` is the scene's marquee-and-carry.
 */
export function installFishControls({ accent, feed, dropAt, addFish, drag, clearSelection, mode, setMode }) {
  return installHostControls({
    accent,
    population: true,
    controls: () => [
      { id: 'feed', kind: 'action', label: 'Feed', icon: 'feed', hint: 'A pinch of food over the open water' },
      { id: 'sprinkle', kind: 'tool', capture: 'desktop', label: 'Click to feed', icon: 'pinch', hint: 'Click empty desktop to drop food right there' },
      { id: 'add', kind: 'tool', capture: 'desktop', rapid: true, label: 'Add fish', icon: 'fish-plus', hint: 'Click empty desktop to add a fish there' },
      { id: 'herd', kind: 'tool', capture: 'overlay', label: 'Herd', icon: 'lasso', hint: 'Drag to round up fish, then drag one of them to move the group' },
      { id: 'mood', kind: 'choice', label: 'Mood', icon: 'mood', hint: 'How the fish treat the pointer', value: mode(), options: MOODS },
    ],
    control(id, value) {
      if (id === 'feed') feed();
      else if (id === 'mood') setMode(value === 'curious' ? 'curious' : 'shy');
    },
    use(tool, g) {
      if (tool === 'sprinkle') { if (g.phase === 'tap') dropAt(g.x, g.y); return 'none'; }
      if (tool === 'add') { if (g.phase === 'tap') addFish(g.x, g.y); return 'none'; }
      if (tool === 'herd') {
        if (g.phase === 'tap') { clearSelection(); return 'none'; }
        return drag(g);
      }
      return 'none';
    },
  });
}
