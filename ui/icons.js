const paths = {
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  feed: '<path d="M3 15s3-4 7-4 7 4 7 4-3 4-7 4-7-4-7-4Zm14 0 4-3v6Z"/><path d="M7 15h.01"/><circle cx="9" cy="4" r=".7"/><circle cx="14" cy="7" r=".7"/>',
  fish: '<path d="M4 12s3-5 8-5c4 0 6 3 8 5-2 2-4 5-8 5-5 0-8-5-8-5Z"/><circle cx="8.2" cy="11.2" r=".8" fill="currentColor" stroke="none"/><path d="M16.5 12h4l1.5 3.5M16.5 12h4L22 8.5"/>',
  wand: '<path d="m4 20 11-11"/><path d="m13 7 2-2 4 4-2 2"/><path d="M19 3v2M18 4h2M8 3v2M7 4h2M20 12v2M19 13h2"/>',
  lamp: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  'exit-fullscreen': '<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>',
};

export function setActionIcon(button, icon, label, shortcut) {
  if (!button) return;
  if (button.dataset.icon !== icon) {
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[icon]}</svg>`;
    button.dataset.icon = icon;
    button.classList.add('icon-button');
  }
  button.setAttribute('aria-label', label);
  button.title = shortcut ? `${label} (${shortcut})` : label;
}
