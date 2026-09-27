const paths = {
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  feed: '<path d="M3 15s3-4 7-4 7 4 7 4-3 4-7 4-7-4-7-4Zm14 0 4-3v6Z"/><path d="M7 15h.01"/><circle cx="9" cy="4" r=".7"/><circle cx="14" cy="7" r=".7"/>',
  fish: '<path d="M4 12s3-5 8-5c4 0 6 3 8 5-2 2-4 5-8 5-5 0-8-5-8-5Z"/><circle cx="8.2" cy="11.2" r=".8" fill="currentColor" stroke="none"/><path d="M16.5 12h4l1.5 3.5M16.5 12h4L22 8.5"/>',
  wand: '<path d="m4 20 11-11"/><path d="m13 7 2-2 4 4-2 2"/><path d="M19 3v2M18 4h2M8 3v2M7 4h2M20 12v2M19 13h2"/>',
  lamp: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  'exit-fullscreen': '<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>',
  // Used by the wallpaper's control dock.
  pinch: '<path d="m11 11 9 3.4-3.9 1.6-1.7 4Z"/><circle cx="5" cy="5" r="1.1"/><circle cx="9.5" cy="3.5" r="1.1"/><circle cx="4" cy="10" r="1.1"/>',
  'fish-plus': '<path d="M2.5 14s2.6-4.2 6.8-4.2c3.3 0 5.2 2.5 6.7 4.2-1.5 1.7-3.4 4.2-6.7 4.2-4.2 0-6.8-4.2-6.8-4.2Z"/><path d="m16 14 3.2-2.6v5.2Z"/><path d="M18.5 2.5v6M15.5 5.5h6"/>',
  lasso: '<path d="M3.5 8V5a1.5 1.5 0 0 1 1.5-1.5h3M12 3.5h2.5M18.5 3.5h.5a1.5 1.5 0 0 1 1.5 1.5v1M3.5 12v2.5M3.5 18.5v.5A1.5 1.5 0 0 0 5 20.5h1"/><path d="m11 11 9.5 3.6-4.2 1.7-1.7 4.2Z"/>',
  mood: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5v-6a1.5 1.5 0 0 1 3 0V11"/><path d="M14 10.5v-4a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 6.2 6.2 0 0 1-5.3-3l-2.4-4.3a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  bolt: '<path d="M13 2.5 5 13.5h6.5L10.5 21.5l8-11H12Z"/>',
  sparkles: '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/><circle cx="12" cy="12" r="1.3"/>',
  comet: '<circle cx="16.5" cy="7.5" r="3"/><path d="M14.3 9.7 3.5 20.5M12.6 6.2 6 12.8M17.8 11.4 11.2 18"/>',
  owl: '<path d="M5.5 3.5 8 7h8l2.5-3.5V14a6.5 6.5 0 0 1-13 0Z"/><circle cx="9.3" cy="11" r="1.9"/><circle cx="14.7" cy="11" r="1.9"/><path d="m12 13.5-.9 1.4h1.8Z"/>',
  bat: '<path d="M12 8.5c-.8 0-1.2 1-1.5 2-1-1.4-3-2.2-4.8-1.6-1 .3-2.2.2-3.2-.4.5 3.2 2.5 6.2 5.6 7.5.6-1.3 2.2-1.9 3.9-1.1 1.7-.8 3.3-.2 3.9 1.1 3.1-1.3 5.1-4.3 5.6-7.5-1 .6-2.2.7-3.2.4-1.8-.6-3.8.2-4.8 1.6-.3-1-.7-2-1.5-2Z"/>',
  firefly: '<circle cx="12" cy="14.5" r="3"/><path d="M12 11.5v-3M9.5 5.5 12 8.5l2.5-3"/><path d="M4.5 14.5h2M17.5 14.5h2M6.3 19.7l1.6-1.4M17.7 19.7l-1.6-1.4M6.3 9.3l1.6 1.4M17.7 9.3l-1.6 1.4"/>',
  cloud: '<path d="M7 19a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10Z"/>',
  snow: '<path d="M12 2.5v19M3.8 7.3l16.4 9.4M3.8 16.7l16.4-9.4"/><path d="m9.5 4 2.5 2 2.5-2M9.5 20l2.5-2 2.5 2"/>',
  aurora: '<path d="M3 16c2.5-7.5 4.5-8 6-4s3.2 3.8 5-2.5 4-4.8 7 1.5"/><path d="M6 13.5v4M9 12v5.5M12 14v3.5M15 11v6.5M18 9.5v8"/><path d="M3 20.5h18"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  scenes: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 16.5 9 5 9-5"/>',
  chevron: '<path d="m6 14.5 6-6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pin: '<path d="M9 3.5h6l-1 6.5 3 3H7l3-3Z"/><path d="M12 13v7.5"/>',
  hide: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.9 3.7M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

/** The inline SVG for an icon, drawn in the current text colour. */
export function iconSvg(icon) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[icon] || paths.sparkles}</svg>`;
}

export function setActionIcon(button, icon, label, shortcut) {
  if (!button) return;
  if (button.dataset.icon !== icon) {
    button.innerHTML = iconSvg(icon);
    button.dataset.icon = icon;
    button.classList.add('icon-button');
  }
  button.setAttribute('aria-label', label);
  button.title = shortcut ? `${label} (${shortcut})` : label;
}
