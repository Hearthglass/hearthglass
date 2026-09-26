import { createPalette } from '../../shared/pixel-engine.js';

// A sunlit reef tank. The water ramp carries the whole mood; corals and fish take the
// saturated accents. Ramps run dark to light.
export const palette = createPalette({
  ink: ['#050a14'],
  water: ['#04101f', '#061629', '#081d35', '#0a2541', '#0d2e4e', '#10385b', '#144368', '#194f75', '#1f5c82', '#276b8f'],
  ray: ['#2f7f9b', '#4499ad', '#63b6c2'],
  foam: ['#8fd3da', '#c3efec', '#f2fffb'],
  lid: ['#070b12', '#0d131d', '#161e2b', '#222c3b', '#39455a'],
  sand: ['#4a3a2c', '#6b563d', '#8f7650', '#b29566', '#d0b37e', '#ead19c', '#f8ebc5'],
  rock: ['#171b27', '#232a39', '#323b4d', '#445064', '#5a677c', '#768398'],
  green: ['#0c2a20', '#123d2b', '#1a5536', '#246e40', '#35894a', '#54a655', '#86c56a'],
  pink: ['#3e1230', '#6a1d45', '#a02d5b', '#d64b77', '#fb7d99', '#ffbccb'],
  orange: ['#4d1b0a', '#8a3310', '#c9561a', '#f0822c', '#ffae57', '#ffd49a'],
  purple: ['#23133f', '#3d2170', '#5f37a6', '#8b5ed6', '#b996f2', '#e3d2ff'],
  blue: ['#0a1850', '#12309a', '#2152d6', '#4a82f5', '#8cb6ff'],
  yellow: ['#5a3f06', '#9c7410', '#dcae1c', '#f7d547', '#fff09a'],
  white: ['#9fb0bb', '#d3e1e6', '#ffffff'],
  teal: ['#0c4a4a', '#138079', '#1fb3a0', '#5fe0c4', '#b8fff0'],
  wood: ['#24130a', '#3f2412', '#62391d', '#87532b', '#ad7440'],
  gold: ['#6b4a0c', '#b3851a', '#e8bb34', '#ffe36a', '#fff8c8'],
  red: ['#4a0c14', '#8c1624', '#d42a36', '#ff5f5f'],
  jelly: ['#2a2360', '#4e3fa0', '#8a74e0', '#c9b6ff', '#f0e8ff'],
  glow: ['#39ffb0', '#9dffe0'],
});

const c = name => palette.c(name);
export const INK = c('ink0');

export const LIGHT = {
  ray: palette.levels('#6fd0d8', 3, 0.28),
  caustic: palette.levels('#bff4ee', 2, 0.35),
  lamp: palette.levels('#ffe9b0', 3, 0.3),
  gold: palette.levels('#ffd65a', 4, 0.8),
  bio: palette.levels('#39ffb0', 4, 0.7),
  jelly: palette.levels('#b890ff', 4, 0.7),
  flash: palette.levels('#ffffff', 3, 0.6),
  moon: palette.levels('#8fb0ff', 3, 0.3),
};
export const FOG = [palette.blend('#10385b', 0.35), palette.blend('#0d2e4e', 0.6), palette.blend('#0a2541', 0.8)];
export const SHADE = {
  shadow: palette.scale(0.62, 0.7, 0.85),
  night: palette.scale(0.3, 0.38, 0.62),
  dusk: palette.scale(0.55, 0.62, 0.8),
  ink: palette.blend('#050a14', 0.65),
};
export const RIM = { top: palette.add('#9fe8ee', 0.22) };

export const RAMPS = {
  bubble: [c('foam2'), c('foam1'), c('foam1'), c('foam0'), c('ray1')],
  food: [c('orange4'), c('orange3'), c('orange3'), c('orange2'), c('orange1')],
  gold: [c('gold4'), c('gold3'), c('gold3'), c('gold2'), c('gold1')],
  sparkle: [c('white2'), c('gold4'), c('gold3'), c('gold2')],
  ink: [c('ink0'), c('water0'), c('water1'), c('water2'), c('water3')],
  sand: [c('sand4'), c('sand3'), c('sand2'), c('sand1')],
  plankton: [c('ray2'), c('ray1'), c('ray0')],
  bio: [c('glow1'), c('glow0'), c('teal3'), c('teal2'), c('teal1')],
  jelly: [c('jelly4'), c('jelly3'), c('jelly2'), c('jelly1')],
};
