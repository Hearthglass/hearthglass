import { createPalette } from '../../shared/pixel-engine.js';

// Night on a wizard's rampart. Ramps run dark to light. The sky and stone are cool and
// desaturated so the three warm-to-hot accents (robe, fire, magic) own the eye.
export const palette = createPalette({
  ink: ['#07060f'],
  sky: ['#0a0a1d', '#0f0f2a', '#141537', '#1a1a44', '#211f50', '#29245b', '#322a66', '#3d3171', '#4a397c'],
  haze: ['#3a3170', '#4d4284', '#625699'],
  star: ['#5b5a9a', '#9b9ad0', '#dcdcff', '#ffffff'],
  moon: ['#5f5a6e', '#8a8494', '#b3ab9f', '#d6cdb2', '#efe6c9', '#fffbe8'],
  far: ['#1c1843', '#241f50', '#2e285e'],
  near: ['#120f2c', '#181436', '#1f1a41'],
  stone: ['#141220', '#1f1c2f', '#2b273e', '#3a354f', '#4b4563', '#5f5979', '#7a7493'],
  moss: ['#1b3325', '#285036', '#3f6f42', '#5e8f4c'],
  robe: ['#23091a', '#3f0f25', '#651831', '#8d2239', '#b3344a', '#d4525a'],
  gold: ['#4a2a10', '#85561c', '#c38f33', '#ebc15a', '#fff0a8'],
  skin: ['#5d3228', '#9a5a43', '#d08e6c', '#f0bd98'],
  beard: ['#5b586e', '#8f8ca3', '#c3c0d2', '#e9e7f2', '#ffffff'],
  wood: ['#26150c', '#42261a', '#6a3f25', '#955f36', '#bd8550'],
  iron: ['#16141c', '#2a2733', '#43404f', '#625e70'],
  cyan: ['#0b2c4d', '#11528a', '#1f86c6', '#43c2f2', '#9eeaff', '#e4fbff'],
  violet: ['#2d0f55', '#5421a0', '#8c47e0', '#c38bff', '#ead2ff'],
  fire: ['#4d1206', '#8f2a0c', '#d0521a', '#f58a26', '#ffc247', '#fff0a0'],
  green: ['#12402a', '#23794a', '#43b865', '#8cf08a', '#d8ffc8'],
  pink: ['#4e1240', '#96256f', '#df4a9a', '#ff94c8', '#ffd6ec'],
  owl: ['#241913', '#3d2b1f', '#5e432e', '#86653f', '#b89968', '#e6d4a8'],
  ember: ['#ff6a2a'],
});

const c = name => palette.c(name);
export const INK = c('ink0');

// Light as lookup tables, in dithered steps.
export const LIGHT = {
  gem: palette.levels('#43c2f2', 4, 0.75),
  gemHot: palette.levels('#9eeaff', 4, 1.1),
  fire: palette.levels('#f58a26', 4, 0.55),
  moon: palette.levels('#cfc8e8', 3, 0.28),
  moonHalo: palette.levels('#8a86c8', 3, 0.35),
  flash: palette.levels('#ffffff', 4, 1),
  mend: palette.levels('#43b865', 4, 0.8),
  violet: palette.levels('#8c47e0', 4, 0.8),
  pink: palette.levels('#df4a9a', 4, 0.8),
  gold: palette.levels('#ebc15a', 4, 0.8),
  firefly: palette.levels('#b8f07a', 2, 0.5),
};
export const RIM = {
  gem: palette.add('#6fd8ff', 0.55),
  gemHot: palette.add('#c8f6ff', 0.9),
  moon: palette.add('#b8b2e0', 0.22),
  fire: palette.add('#ff9a3a', 0.4),
};
export const SHADE = {
  dim: palette.scale(0.72, 0.72, 0.85),
  haze: palette.blend('#3a3170', 0.35),
  mist: palette.blend('#4d4284', 0.5),
  soot: palette.blend('#16121a', 0.6),
  sootLight: palette.blend('#2a2230', 0.35),
};

// Colour ramps for particles: each walks white-hot → colour → dark as it ages.
export const RAMPS = {
  cyan: [c('star3'), c('cyan5'), c('cyan4'), c('cyan3'), c('cyan2'), c('cyan1'), c('sky4')],
  violet: [c('star3'), c('violet4'), c('violet3'), c('violet2'), c('violet1'), c('sky3')],
  fire: [c('fire5'), c('fire4'), c('fire3'), c('fire2'), c('fire1'), c('stone1')],
  ember: [c('fire4'), c('fire3'), c('fire2'), c('fire1')],
  gold: [c('star3'), c('gold4'), c('gold3'), c('gold2'), c('gold1')],
  green: [c('star3'), c('green4'), c('green3'), c('green2'), c('green1')],
  pink: [c('star3'), c('pink4'), c('pink3'), c('pink2'), c('pink1')],
  white: [c('star3'), c('star2'), c('star1'), c('star0')],
  dust: [c('moon3'), c('moon2'), c('moon1'), c('moon0'), c('sky5')],
  smoke: [c('haze2'), c('haze1'), c('haze0'), c('sky6')],
  mend: [c('green4'), c('cyan4'), c('green3'), c('cyan3'), c('green2')],
};
