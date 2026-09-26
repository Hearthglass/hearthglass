import assert from 'node:assert/strict';
import { createPalette, sprite, Surface, CLEAR, bayer, createParticles, createNoise } from '../pixel-engine.js';

const palette = createPalette({
  ink: ['#000000'],
  red: ['#400000', '#800000', '#c00000', '#ff4040'],
  blue: ['#000040', '#0000a0', '#4060ff'],
  white: ['#ffffff'],
});

// Palette: names, ramps, and lookup tables that never leave the palette.
{
  assert.equal(palette.count, 9);
  assert.equal(palette.c('red0'), 1);
  assert.equal(palette.c('red'), palette.c('red3'), 'a bare ramp name is its lightest colour');
  assert.deepEqual(palette.ramp('blue'), [5, 6, 7]);
  assert.equal(palette.lighter[palette.c('red1')], palette.c('red2'), 'lighter steps along the colour\'s own ramp');
  assert.equal(palette.lighter[palette.c('red3')], palette.c('red3'), 'the top of a ramp stays put');
  assert.equal(palette.darker[palette.c('blue0')], palette.c('blue0'));
  assert.throws(() => palette.c('green1'), /unknown colour/);
  for (const lut of [palette.blend('#ffffff', 0.5), palette.add('#4060ff', 0.8), palette.scale(0.3), ...palette.levels('#ff4040', 3)]) {
    for (let i = 0; i < palette.count; i++) assert(lut[i] < palette.count, 'a LUT maps every colour to a colour');
  }
  const same = palette.blend('#000000', 0);
  for (let i = 0; i < palette.count; i++) assert.equal(same[i], i, 'a zero-strength blend is the identity');
  assert.equal(palette.scale(0)[palette.c('white0')], palette.c('ink0'), 'full shadow is the darkest colour');
  assert.equal(palette.add('#ffffff', 1)[palette.c('red1')], palette.c('white0'), 'full white light saturates to white');
}

// Sprites: characters to palette indices, blanks clear, unknown characters rejected.
{
  const s = sprite(palette, { r: 'red2', b: 'blue1' }, ['.rr.', 'rbbr', ' rr ']);
  assert.equal(s.w, 4); assert.equal(s.h, 3);
  assert.equal(s.data[0], CLEAR);
  assert.equal(s.data[1], palette.c('red2'));
  assert.equal(s.data[5], palette.c('blue1'));
  assert.equal(s.data[8], CLEAR, 'a space is clear too');
  assert.throws(() => sprite(palette, { r: 'red2' }, ['rx']), /no 'x'/);
}

// Surface primitives clip, stay symmetric and land on whole pixels.
{
  const s = new Surface(16, 12, 0);
  s.rect(-4, -4, 8, 8, 2);
  assert.equal(s.get(0, 0), 2); assert.equal(s.get(3, 3), 2); assert.equal(s.get(4, 4), 0, 'rect clips at the origin');
  s.rect(12, 8, 20, 20, 3);
  assert.equal(s.get(15, 11), 3, 'rect clips at the far edge');
  assert.equal(s.get(99, 0), CLEAR, 'reads off the surface are clear');
  s.pset(-1, 5, 7); s.pset(16, 5, 7); // silently ignored

  const d = new Surface(21, 21, 0);
  d.disc(10, 10, 6, 1);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    assert.equal(d.get(x, y), d.get(20 - x, y), 'disc is mirror symmetric');
    assert.equal(d.get(x, y), d.get(x, 20 - y));
    assert.equal(d.get(x, y), d.get(y, x), 'and symmetric on the diagonal');
  }
  const l = new Surface(10, 10, 0);
  l.line(1, 1, 8, 5, 4);
  assert.equal(l.get(1, 1), 4); assert.equal(l.get(8, 5), 4, 'a line reaches both ends');
  let count = 0;
  for (const v of l.data) if (v === 4) count++;
  assert.equal(count, 8, 'a Bresenham line has one pixel per step of its long axis');

  const o = new Surface(5, 5, CLEAR);
  o.pset(2, 2, 1);
  o.outline(9);
  assert.equal(o.get(2, 2), 1);
  assert.equal(o.get(1, 2), 9); assert.equal(o.get(2, 1), 9);
  assert.equal(o.get(1, 1), CLEAR, 'a plain outline leaves the diagonals');
  const o8 = new Surface(5, 5, CLEAR);
  o8.pset(2, 2, 1);
  o8.outline(9, true);
  assert.equal(o8.get(1, 1), 9, 'a diagonal outline fills them');

  const img = sprite(palette, { r: 'red1', b: 'blue1' }, ['rb.']);
  const t = new Surface(4, 1, 0);
  t.blit(img, 0, 0, true);
  assert.deepEqual([...t.data], [0, palette.c('blue1'), palette.c('red1'), 0], 'flipped blit mirrors and skips clear');

  const g = new Surface(21, 21, palette.c('red0'));
  const luts = palette.levels('#ffffff', 3, 1);
  g.glow(10, 10, 9, luts, 1, 1, 1, 4);
  assert.equal(g.get(10, 10), palette.c('red0'), 'glow leaves the inner disc alone');
  let lit = 0, ring = 0;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    const r = Math.hypot(x - 10, y - 10);
    if (r >= 4 && r < 6) { ring++; if (g.get(x, y) !== palette.c('red0')) lit++; }
  }
  assert(lit > ring / 3, 'and lights (dithered) the ring just outside it');
  assert.equal(g.get(0, 0), palette.c('red0'), 'and nothing beyond its radius');
}

// Ordered dither thresholds cover (0, 1) evenly.
{
  const seen = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const b = bayer(x, y); assert(b > 0 && b < 1); seen.add(b); }
  assert.equal(seen.size, 16);
  assert.equal(bayer(5, 9), bayer(1, 1), 'the pattern tiles every 4 pixels');
}

// Particles reuse a fixed pool.
{
  const p = createParticles(4);
  const ramp = p.ramp([1, 2, 3]);
  for (let k = 0; k < 4; k++) assert(p.spawn(0, 0, 1, 0, 1, ramp) >= 0);
  assert.equal(p.spawn(0, 0, 0, 0, 1, ramp), -1, 'a full pool refuses rather than grows');
  assert.equal(p.count, 4);
  p.update(0.5);
  assert.equal(p.color(0), 2, 'colour walks the ramp with age');
  p.update(0.6);
  assert.equal(p.count, 0, 'particles expire at the end of their life');
  assert(p.spawn(0, 0, 0, 0, 1, ramp) >= 0, 'expired slots are reused');
}

// Noise is deterministic per seed and stays in range.
{
  const a = createNoise(42), b = createNoise(42), c = createNoise(43);
  let differs = false;
  for (let x = 0; x < 50; x += 0.7) {
    assert.equal(a.n2(x, x * 0.3), b.n2(x, x * 0.3));
    if (a.n1(x) !== c.n1(x)) differs = true;
    const v = a.fbm2(x, 3.1);
    assert(v >= 0 && v <= 1);
  }
  assert(differs, 'another seed gives another field');
}

console.log('PASS: pixel engine palette LUTs, sprites, primitives, glow, dither, particle pool and noise');
