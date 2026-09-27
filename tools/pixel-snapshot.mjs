// Renders a still of a pixel scene straight from its framebuffer and writes it as an
// indexed PNG, scaled up by a whole number so every art pixel stays square and crisp.
//
//   node tools/pixel-snapshot.mjs moonspire docs/images/moonspire-wide.png
//   node tools/pixel-snapshot.mjs pixelreef docs/images/pixelreef-wide.png [--night]
//
// Used for the gallery previews and the readme. No browser needed.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { bootScene } from '../scenes/shared/tests/headless.mjs';

const [scene = 'moonspire', out = `${scene}.png`, ...flags] = process.argv.slice(2);
const WIDTH = 1440, HEIGHT = 750;
const SCALES = { moonspire: 2, pixelreef: 4 };
const SCALE = SCALES[scene] ?? 4;

const SETUPS = {
  // The wizard mid-charge at the moon, a firework opening over the valley.
  async moonspire(app) {
    const D = app.scene.debug, L = D.layout;
    app.seconds(4);
    app.press(L.moonX, L.moonY);
    app.seconds(1.5);
    D.firework(L.W * 0.46, L.horizonY * 0.32, 0.85);
    D.backdrop.launchShootingStar(L.W * 0.3, L.horizonY * 0.12);
    app.seconds(0.42);
  },
  // Midday on the reef: the chest just opened, the octopus out of its cave.
  async pixelreef(app) {
    const D = app.scene.debug, L = D.layout;
    app.seconds(30);
    D.critters.pokeOcto();
    app.seconds(2);
    app.hostClick(D.props.chest.x, D.props.chest.y - 6);
    app.seconds(0.9);
    if (flags.includes('--night')) { app.key('l'); app.seconds(8); }
    void L;
  },
};

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An 8-bit indexed PNG of the surface, each pixel repeated `scale` times, cropped to w×h. */
export function encodeIndexedPng(surface, palette, scale, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const plte = Buffer.alloc(palette.count * 3);
  palette.rgb.forEach(([r, g, b], i) => { plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b; });
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    const sy = Math.min(surface.h - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = surface.data[sy * surface.w + Math.min(surface.w - 1, Math.floor(x / scale))];
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (!SETUPS[scene]) throw new Error(`no setup for ${scene}; try ${Object.keys(SETUPS).join(', ')}`);
const app = await bootScene(`../../${scene}/src/main.js`, { size: [WIDTH, HEIGHT], search: '?capture' });
if (app.presenter.state.scale !== SCALE) throw new Error(`expected a ${SCALE}x scale, got ${app.presenter.state.scale}`);
await SETUPS[scene](app);
const surface = app.render();
writeFileSync(out, encodeIndexedPng(surface, app.scene.palette, SCALE, WIDTH, HEIGHT));
console.log(`${out}: ${surface.w}x${surface.h} art pixels at ${SCALE}x`);
