import { createPalette } from '../../shared/pixel-engine.js';

// Night at a wizard's observatory. Every ramp is hue-shifted, not just darkened: shadows
// fall toward indigo and violet, lights climb toward cream and coral. The sky and stone
// stay cool and quiet so the warm robe, the fire and the magic own the eye.
//
// Ramps are interpolated in OKLab between a few hand-picked keys, dark to light.

const toLinear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = v => {
  v = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
};
function oklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear((n >> 16) & 255), g = toLinear((n >> 8) & 255), b = toLinear(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
function hex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return '#' + rgb.map(v => toSrgb(v).toString(16).padStart(2, '0')).join('');
}
/** n colours spread evenly through the key colours. */
function ramp(n, ...keys) {
  const labs = keys.map(oklab), out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (labs.length - 1), k = Math.min(labs.length - 2, Math.floor(t)), f = t - k;
    out.push(hex(labs[k].map((v, j) => v + (labs[k + 1][j] - v) * f)));
  }
  return out;
}

export const palette = createPalette({
  ink: ['#06050d'],
  sky: ramp(12, '#060614', '#0f0d27', '#1b1840', '#2a2255', '#3d2c66', '#553870', '#6e4574'),
  neb: ramp(5, '#2e2a62', '#4a3f82', '#72609e', '#a38fbd', '#d2c3dc'),
  star: ramp(5, '#474b8c', '#8e93d0', '#cdd3ff', '#f2f3ff', '#ffffff'),
  tint: ['#ffd49a', '#ffaab0', '#9fd4ff'],
  cloud: ramp(7, '#131236', '#221d4b', '#352b60', '#4d3e74', '#6e5f8e', '#a497b8', '#e2dcec'),
  moon: ramp(8, '#44405e', '#6a6380', '#958b98', '#bdb09f', '#dccdb0', '#eee2c4', '#fff8e4'),
  far: ramp(6, '#191845', '#211f52', '#2b2961', '#3a3873', '#524f88', '#7a78a8'),
  snow: ramp(4, '#6a6aa0', '#9b9bcb', '#cfd1ee', '#f3f4ff'),
  mid: ramp(5, '#131538', '#191c45', '#222653', '#2f3463', '#46507c'),
  vale: ramp(5, '#0d152c', '#131e3a', '#1b2a49', '#26395a', '#3a5373'),
  near: ramp(4, '#090b1c', '#0e1226', '#141a32', '#1e2944'),
  stone: ramp(10, '#0b0a15', '#16141f', '#1f1c2c', '#2a263a', '#363147', '#453e56', '#574f66', '#6c6479', '#857c8f', '#a49ba8'),
  warm: ramp(5, '#2e1f28', '#4b2c2e', '#703f33', '#9a5a3b', '#c7804b'),
  moss: ramp(5, '#0f2525', '#183a2e', '#27563a', '#437543', '#76a059'),
  verd: ramp(6, '#0e2229', '#15373a', '#1f5250', '#317266', '#539a82', '#8cc6a4'),
  robe: ramp(8, '#1c0720', '#340b2d', '#521236', '#75173b', '#98203f', '#bb344a', '#dc5859', '#f5896f'),
  gold: ramp(6, '#35190d', '#683814', '#a1621d', '#d19a35', '#f0c95f', '#fff4b4'),
  brass: ramp(5, '#28200f', '#4f4220', '#857038', '#bba25a', '#eadb97'),
  skin: ramp(5, '#461f25', '#7a3c36', '#b06851', '#db9876', '#f7caa3'),
  beard: ramp(6, '#474562', '#6b6a88', '#9593ad', '#bdbbd0', '#e1e0ec', '#ffffff'),
  wood: ramp(7, '#1a0d0f', '#2e1814', '#4a291c', '#6b3e26', '#8f5932', '#b57944', '#d8a162'),
  iron: ramp(5, '#0e0d16', '#1c1a27', '#2d2a3b', '#45405a', '#67617e'),
  paper: ramp(4, '#6a5448', '#a2876a', '#d1b98e', '#f3e4bc'),
  book: ramp(4, '#0c2531', '#144152', '#1f626f', '#3a8c8a'),
  cyan: ['#0b2c4d', '#11528a', '#1f86c6', '#43c2f2', '#9eeaff', '#e4fbff'],
  violet: ['#2d0f55', '#5421a0', '#8c47e0', '#c38bff', '#ead2ff'],
  fire: ramp(7, '#3a0c09', '#6f1b0c', '#a9330f', '#dc5a1a', '#f58a26', '#ffc247', '#fff2a8'),
  green: ['#12402a', '#23794a', '#43b865', '#8cf08a', '#d8ffc8'],
  pink: ['#4e1240', '#96256f', '#df4a9a', '#ff94c8', '#ffd6ec'],
  owl: ramp(6, '#211611', '#3b291e', '#5d422d', '#86653f', '#b89968', '#e8d7ac'),
  ember: ['#ff6a2a'],
});

const c = name => palette.c(name);
export const INK = c('ink0');

// Light as lookup tables, in dithered steps.
export const LIGHT = {
  gem: palette.levels('#43c2f2', 4, 0.75),
  gemHot: palette.levels('#9eeaff', 4, 1.1),
  fire: palette.levels('#f58a26', 4, 0.55),
  lamp: palette.levels('#ffb347', 3, 0.45),
  moon: palette.levels('#cfc8e8', 3, 0.28),
  moonHalo: palette.levels('#8a86c8', 3, 0.35),
  flash: palette.levels('#ffffff', 4, 1),
  mend: palette.levels('#43b865', 4, 0.8),
  violet: palette.levels('#8c47e0', 4, 0.8),
  pink: palette.levels('#df4a9a', 4, 0.8),
  gold: palette.levels('#ebc15a', 4, 0.8),
  firefly: palette.levels('#b8f07a', 2, 0.5),
  potion: {
    cyan: palette.levels('#43c2f2', 2, 0.4),
    green: palette.levels('#43b865', 2, 0.4),
    pink: palette.levels('#df4a9a', 2, 0.4),
    violet: palette.levels('#8c47e0', 2, 0.45),
  },
};
export const RIM = {
  gem: palette.add('#6fd8ff', 0.55),
  gemHot: palette.add('#c8f6ff', 0.9),
  moon: palette.add('#b8b2e0', 0.22),
  fire: palette.add('#ff9a3a', 0.4),
};
export const SHADE = {
  dim: palette.scale(0.72, 0.72, 0.85),
  deep: palette.scale(0.5, 0.5, 0.65),
  haze: palette.blend('#3a3170', 0.35),
  mist: palette.blend('#4d4284', 0.45),
  fog: palette.blend('#6a5f96', 0.3),
  soot: palette.blend('#16121a', 0.6),
  sootLight: palette.blend('#2a2230', 0.35),
  shadow: palette.scale(0.55, 0.55, 0.7),
};

// Colour ramps for particles: each walks white-hot → colour → dark as it ages.
export const RAMPS = {
  cyan: [c('star4'), c('cyan5'), c('cyan4'), c('cyan3'), c('cyan2'), c('cyan1'), c('sky5')],
  violet: [c('star4'), c('violet4'), c('violet3'), c('violet2'), c('violet1'), c('sky4')],
  fire: [c('fire6'), c('fire5'), c('fire4'), c('fire3'), c('fire2'), c('fire1'), c('stone1')],
  ember: [c('fire5'), c('fire4'), c('fire3'), c('fire2'), c('fire1')],
  gold: [c('star4'), c('gold5'), c('gold4'), c('gold3'), c('gold2'), c('gold1')],
  green: [c('star4'), c('green4'), c('green3'), c('green2'), c('green1')],
  pink: [c('star4'), c('pink4'), c('pink3'), c('pink2'), c('pink1')],
  white: [c('star4'), c('star3'), c('star2'), c('star1'), c('star0')],
  dust: [c('moon5'), c('moon4'), c('moon3'), c('moon2'), c('moon1'), c('moon0'), c('sky6')],
  smoke: [c('cloud4'), c('cloud3'), c('cloud2'), c('cloud1'), c('sky7')],
  chimney: [c('cloud3'), c('cloud2'), c('mid4'), c('mid3')],
  mend: [c('green4'), c('cyan4'), c('green3'), c('cyan3'), c('green2')],
  flake: [c('snow3'), c('snow3'), c('snow3'), c('snow2')],
  flakeFar: [c('snow1'), c('snow1'), c('snow0')],
};
