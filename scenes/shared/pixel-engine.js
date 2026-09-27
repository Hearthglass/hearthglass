// A small palette-indexed software renderer for the pixel-art scenes.
//
// Everything is drawn into a Uint8Array of palette indices at a low logical resolution,
// then expanded through the palette once per frame and scaled up by a whole number with
// no smoothing. Light, shade, fog and glow never mix colours: they are lookup tables
// that send each palette index to another palette index, so every pixel on screen is
// always one of the palette's colours. Soft falloffs are an ordered (Bayer) dither
// between table levels, the way 16-bit era art did it.

export const CLEAR = 255;

const BAYER4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16));
/** Ordered-dither threshold in (0, 1) for a pixel. */
export const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A palette built from named ramps, each listed dark to light:
 * `{ robe: ['#3a1020', '#6b1f32', '#9c3040'] }` gives `robe0`, `robe1`, `robe2`.
 * `lighter`/`darker` step along a colour's own ramp.
 */
export function createPalette(ramps) {
  const rgb = [];
  const names = new Map();
  const rampOf = [];
  const posOf = [];
  const rampList = [];
  for (const [name, colors] of Object.entries(ramps)) {
    const indices = [];
    colors.forEach((hex, i) => {
      const index = rgb.length;
      if (index >= CLEAR) throw new Error('palette too large');
      rgb.push(parseHex(hex));
      names.set(`${name}${i}`, index);
      rampOf.push(rampList.length);
      posOf.push(i);
      indices.push(index);
    });
    names.set(name, indices[indices.length - 1]);
    rampList.push(indices);
  }
  const count = rgb.length;
  const colors = new Uint32Array(256);
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  rgb.forEach(([r, g, b], i) => {
    colors[i] = little ? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
  });
  const identity = () => {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  };
  const lighter = identity();
  const darker = identity();
  for (let i = 0; i < count; i++) {
    const ramp = rampList[rampOf[i]];
    lighter[i] = ramp[Math.min(ramp.length - 1, posOf[i] + 1)];
    darker[i] = ramp[Math.max(0, posOf[i] - 1)];
  }
  // "Redmean" weighted distance: cheap and good enough to keep hues from drifting.
  function nearest(r, g, b, exclude) {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < count; i++) {
      if (exclude && exclude.has(i)) continue;
      const [pr, pg, pb] = rgb[i];
      const mean = (pr + r) / 2;
      const dr = pr - r, dg = pg - g, db = pb - b;
      const distance = (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    return best;
  }
  function map(fn) {
    const lut = identity();
    for (let i = 0; i < count; i++) {
      const [r, g, b] = fn(rgb[i][0], rgb[i][1], rgb[i][2], i);
      lut[i] = nearest(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)));
    }
    return lut;
  }
  const api = {
    colors, rgb, count, lighter, darker, nearest, map,
    /** Palette index for a name like `robe1`, or a ramp's lightest for `robe`. */
    c(name) {
      const index = names.get(name);
      if (index === undefined) throw new Error(`unknown colour ${name}`);
      return index;
    },
    ramp(name) { return rampList[rampOf[api.c(`${name}0`)]]; },
    /** Mix every colour toward `hex` by t, then snap back to the palette. */
    blend(hex, t) {
      const [tr, tg, tb] = parseHex(hex);
      return map((r, g, b) => [r + (tr - r) * t, g + (tg - g) * t, b + (tb - b) * t]);
    },
    /** Add light of colour `hex` at strength t (screen-like, clamped). */
    add(hex, t) {
      const [tr, tg, tb] = parseHex(hex);
      return map((r, g, b) => [r + tr * t, g + tg * t, b + tb * t]);
    },
    /** Multiply toward black, keeping hue: shadows, night. */
    scale(fr, fg = fr, fb = fr) { return map((r, g, b) => [r * fr, g * fg, b * fb]); },
    /** Steps of a light: level k of n is add(hex, strength * k / n). */
    levels(hex, n, strength = 1, mode = 'add') {
      const out = [];
      for (let k = 1; k <= n; k++) out.push(mode === 'blend' ? api.blend(hex, strength * k / n) : api.add(hex, strength * k / n));
      return out;
    },
    /** Every index as a colour, for tests and tools. */
    hex(index) { return '#' + rgb[index].map(v => v.toString(16).padStart(2, '0')).join(''); },
  };
  return api;
}

/** A sprite from rows of characters; `key` maps each character to a palette name. Space and '.' are clear. */
export function sprite(palette, key, rows) {
  const lines = (Array.isArray(rows) ? rows : rows.split('\n')).filter((line, i, all) =>
    !(line.trim() === '' && (i === 0 || i === all.length - 1)));
  const w = Math.max(...lines.map(line => line.length));
  const h = lines.length;
  const data = new Uint8Array(w * h).fill(CLEAR);
  const lookup = new Map();
  for (const [ch, name] of Object.entries(key)) lookup.set(ch, name === null ? CLEAR : palette.c(name));
  for (let y = 0; y < h; y++) {
    const line = lines[y];
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch === ' ' || ch === '.') continue;
      if (!lookup.has(ch)) throw new Error(`sprite key has no '${ch}'`);
      data[y * w + x] = lookup.get(ch);
    }
  }
  return { w, h, data };
}

/** A palette-indexed image with drawing primitives. CLEAR pixels are transparent when blitted. */
export class Surface {
  constructor(w = 1, h = 1, fill = 0) {
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h).fill(fill);
    this.scratch = null;
  }
  resize(w, h, fill = 0) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h).fill(fill);
    this.scratch = null;
  }
  clear(c = CLEAR) { this.data.fill(c); }
  get(x, y) {
    x |= 0; y |= 0;
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : CLEAR;
  }
  pset(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }
  /** Apply a LUT to one pixel. */
  pmap(x, y, lut) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) {
      const i = y * this.w + x;
      if (this.data[i] !== CLEAR) this.data[i] = lut[this.data[i]];
    }
  }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) this.data.fill(c, yy * this.w + x0, yy * this.w + x1);
  }
  hline(x0, x1, y, c) {
    y = Math.round(y);
    if (y < 0 || y >= this.h) return;
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    x0 = Math.max(0, Math.round(x0)); x1 = Math.min(this.w - 1, Math.round(x1));
    if (x1 >= x0) this.data.fill(c, y * this.w + x0, y * this.w + x1 + 1);
  }
  vline(x, y0, y1, c) {
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    for (let y = Math.round(y0); y <= Math.round(y1); y++) this.pset(x, y, c);
  }
  /** Bresenham line. */
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.pset(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Line through a LUT instead of a colour: a beam of light, a streak of shadow. */
  lineMap(x0, y0, x1, y1, lut) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.pmap(x0, y0, lut);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Filled disc with a pixel-art friendly edge (r + 0.5 test). */
  disc(cx, cy, r, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    const rr = (r + 0.5) * (r + 0.5);
    const ri = Math.ceil(r);
    for (let y = -ri; y <= ri; y++) {
      const span = Math.floor(Math.sqrt(Math.max(0, rr - y * y)));
      if (y * y <= rr) this.hline(cx - span, cx + span, cy + y, c);
    }
  }
  /** One-pixel circle outline (midpoint). */
  ring(cx, cy, r, c) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r <= 0) { this.pset(cx, cy, c); return; }
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      this.pset(cx + x, cy + y, c); this.pset(cx - x, cy + y, c);
      this.pset(cx + x, cy - y, c); this.pset(cx - x, cy - y, c);
      this.pset(cx + y, cy + x, c); this.pset(cx - y, cy + x, c);
      this.pset(cx + y, cy - x, c); this.pset(cx - y, cy - x, c);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    const ryi = Math.ceil(ry);
    for (let y = -ryi; y <= ryi; y++) {
      const t = 1 - (y * y) / ((ry + 0.5) * (ry + 0.5));
      if (t < 0) continue;
      const span = Math.floor((rx + 0.5) * Math.sqrt(t) - 0.001);
      this.hline(cx - span, cx + span, cy + y, c);
    }
  }
  /** Filled convex or concave polygon (even-odd scanline). points: flat [x0,y0,x1,y1,...]. */
  poly(points, c) {
    const n = points.length / 2;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { minY = Math.min(minY, points[i * 2 + 1]); maxY = Math.max(maxY, points[i * 2 + 1]); }
    minY = Math.max(0, Math.ceil(minY - 0.5)); maxY = Math.min(this.h - 1, Math.floor(maxY - 0.5));
    const xs = this._xs || (this._xs = new Float32Array(64));
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      let count = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = points[i * 2 + 1], yj = points[j * 2 + 1];
        if ((yi > sy) !== (yj > sy)) {
          const xi = points[i * 2], xj = points[j * 2];
          if (count < 64) xs[count++] = xi + (sy - yi) / (yj - yi) * (xj - xi);
        }
      }
      // insertion sort; counts are tiny
      for (let a = 1; a < count; a++) { const v = xs[a]; let b = a - 1; while (b >= 0 && xs[b] > v) { xs[b + 1] = xs[b]; b--; } xs[b + 1] = v; }
      for (let k = 0; k + 1 < count; k += 2) this.hline(Math.ceil(xs[k] - 0.5), Math.floor(xs[k + 1] - 0.5), y, c);
    }
  }
  /** A thick segment as a quad with round-ish caps. */
  thick(x0, y0, x1, y1, width, c) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * width / 2, ny = dx / len * width / 2;
    this.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], c);
    if (width > 2) { this.disc(x0, y0, width / 2 - 0.5, c); this.disc(x1, y1, width / 2 - 0.5, c); }
  }
  /** Copy a sprite or surface. CLEAR source pixels are skipped. Optional LUT and horizontal flip. */
  blit(src, x, y, flip = false, lut = null) {
    x = Math.round(x); y = Math.round(y);
    const sw = src.w, sh = src.h, sd = src.data, dw = this.w, dd = this.data;
    const y0 = Math.max(0, -y), y1 = Math.min(sh, this.h - y);
    const x0 = Math.max(0, -x), x1 = Math.min(sw, this.w - x);
    for (let sy = y0; sy < y1; sy++) {
      const row = (sy + y) * dw + x;
      const srow = sy * sw;
      for (let sx = x0; sx < x1; sx++) {
        const c = sd[srow + (flip ? sw - 1 - sx : sx)];
        if (c !== CLEAR) dd[row + sx] = lut ? lut[c] : c;
      }
    }
  }
  /** Draw a sprite with each source row shifted by offsets[row] pixels (sway, wobble). */
  blitRows(src, x, y, offsets, flip = false, lut = null) {
    x = Math.round(x); y = Math.round(y);
    for (let sy = 0; sy < src.h; sy++) {
      const dy = y + sy;
      if (dy < 0 || dy >= this.h) continue;
      const shift = offsets ? Math.round(offsets[sy] || 0) : 0;
      for (let sx = 0; sx < src.w; sx++) {
        const c = src.data[sy * src.w + (flip ? src.w - 1 - sx : sx)];
        if (c === CLEAR) continue;
        const dx = x + sx + shift;
        if (dx >= 0 && dx < this.w) this.data[dy * this.w + dx] = lut ? lut[c] : c;
      }
    }
  }
  /** Draw a sprite rotated about its pivot (px, py) by angle, nearest-neighbour. */
  blitRotated(src, x, y, px, py, angle, flip = false, lut = null) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const r = Math.ceil(Math.hypot(Math.max(px, src.w - px), Math.max(py, src.h - py))) + 1;
    x = Math.round(x); y = Math.round(y);
    for (let dy = -r; dy <= r; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx;
        if (tx < 0 || tx >= this.w) continue;
        let sx = Math.floor(cos * dx + sin * dy + px + 0.5);
        const sy = Math.floor(-sin * dx + cos * dy + py + 0.5);
        if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
        if (flip) sx = src.w - 1 - sx;
        const c = src.data[sy * src.w + sx];
        if (c !== CLEAR) this.data[ty * this.w + tx] = lut ? lut[c] : c;
      }
    }
  }
  /** Apply a LUT across a rectangle. */
  mapRect(x, y, w, h, lut) {
    x = Math.round(x); y = Math.round(y);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + Math.round(w)), y1 = Math.min(this.h, y + Math.round(h));
    const d = this.data;
    for (let yy = y0; yy < y1; yy++) {
      for (let i = yy * this.w + x0, end = yy * this.w + x1; i < end; i++) if (d[i] !== CLEAR) d[i] = lut[d[i]];
    }
  }
  /**
   * A soft light (or shadow) as dithered steps of LUTs: `luts[k]` is level k+1.
   * `strength` scales the whole thing; falloff is quadratic to the radius. Pixels nearer
   * than `inner` are left alone (a halo around something, not on it).
   */
  glow(cx, cy, r, luts, strength = 1, rx = 1, ry = 1, inner = 0) {
    if (strength <= 0 || r <= 0) return;
    const inner2 = inner * inner, r2 = r * r;
    const n = luts.length;
    const ri = Math.ceil(r);
    const icx = Math.round(cx), icy = Math.round(cy);
    const x0 = Math.max(0, icx - Math.ceil(ri * rx)), x1 = Math.min(this.w - 1, icx + Math.ceil(ri * rx));
    const y0 = Math.max(0, icy - Math.ceil(ri * ry)), y1 = Math.min(this.h - 1, icy + Math.ceil(ri * ry));
    const d = this.data;
    for (let y = y0; y <= y1; y++) {
      const ny = (y - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) / rx;
        const d2 = nx * nx + ny * ny;
        if (d2 >= r2 || d2 < inner2) continue;
        const q = 1 - Math.sqrt(d2) / r;
        if (q <= 0) continue;
        const level = q * q * strength * n;
        let k = Math.floor(level);
        if (level - k > bayer(x, y)) k++;
        if (k <= 0) continue;
        const i = y * this.w + x;
        if (d[i] !== CLEAR) d[i] = luts[Math.min(n, k) - 1][d[i]];
      }
    }
  }
  /** For sprite layers: give every clear pixel touching a filled one colour c. */
  outline(c, diagonal = false) {
    const w = this.w, h = this.h, d = this.data;
    if (!this.scratch || this.scratch.length !== d.length) this.scratch = new Uint8Array(d.length);
    const s = this.scratch;
    s.set(d);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (s[i] !== CLEAR) continue;
        if ((x > 0 && s[i - 1] !== CLEAR) || (x < w - 1 && s[i + 1] !== CLEAR) ||
          (y > 0 && s[i - w] !== CLEAR) || (y < h - 1 && s[i + w] !== CLEAR) ||
          (diagonal && ((x > 0 && y > 0 && s[i - w - 1] !== CLEAR) || (x < w - 1 && y > 0 && s[i - w + 1] !== CLEAR) ||
            (x > 0 && y < h - 1 && s[i + w - 1] !== CLEAR) || (x < w - 1 && y < h - 1 && s[i + w + 1] !== CLEAR)))) d[i] = c;
      }
    }
  }
  /**
   * For sprite layers: light the edge pixels that face a light at (lx, ly) in layer space.
   * A pixel is a rim pixel when the neighbour one step toward the light is empty.
   */
  rim(lx, ly, lut, strength = 1, reach = 1) {
    if (strength <= 0) return;
    const w = this.w, h = this.h, d = this.data;
    if (!this.scratch || this.scratch.length !== d.length) this.scratch = new Uint8Array(d.length);
    const s = this.scratch;
    s.set(d);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (s[i] === CLEAR) continue;
        const dx = lx - x, dy = ly - y;
        const len = Math.hypot(dx, dy) || 1;
        let lit = false;
        for (let k = 1; k <= reach && !lit; k++) {
          const nx = Math.round(x + dx / len * k), ny = Math.round(y + dy / len * k);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || s[ny * w + nx] === CLEAR) lit = true;
        }
        if (lit && (strength >= 1 || strength > bayer(x, y))) d[i] = lut[s[i]];
      }
    }
  }
}

/**
 * The opaque runs of a full-screen layer, as [offset, length] pairs: baked once, they let
 * `blitRuns` copy a mostly-clear layer without testing every pixel each frame.
 */
export function opaqueRuns(src) {
  const d = src.data, n = d.length, out = [];
  let i = 0;
  while (i < n) {
    while (i < n && d[i] === CLEAR) i++;
    const start = i;
    while (i < n && d[i] !== CLEAR) i++;
    if (i > start) out.push(start, i - start);
  }
  return Int32Array.from(out);
}

/** Copy `src` onto a same-sized `dst` along runs from `opaqueRuns(src)`. */
export function blitRuns(dst, src, runs) {
  const dd = dst.data, sd = src.data;
  for (let r = 0; r < runs.length; r += 2) {
    const o = runs[r], end = o + runs[r + 1];
    if (end - o > 24) dd.set(sd.subarray(o, end), o);
    else for (let i = o; i < end; i++) dd[i] = sd[i];
  }
}

/**
 * Presents a Surface on a canvas: expands indices through the palette into an offscreen
 * image at logical size, then draws it scaled by a whole number with smoothing off.
 * The logical size is chosen so that about `targetRows` rows fill the screen height;
 * width follows the screen's shape, so the scene is never letterboxed.
 */
export function createPresenter(canvas, { targetRows = 180, minScale = 1 } = {}) {
  const context = canvas.getContext('2d', { alpha: false });
  const offscreen = document.createElement('canvas');
  const offContext = offscreen.getContext('2d', { alpha: false });
  let image = null, pixels = null;
  const state = { width: 1, height: 1, scale: 1, deviceWidth: 1, deviceHeight: 1, rows: targetRows };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, canvas.clientWidth), cssH = Math.max(1, canvas.clientHeight);
    const deviceW = Math.max(1, Math.round(cssW * dpr)), deviceH = Math.max(1, Math.round(cssH * dpr));
    const scale = Math.max(minScale, Math.round(deviceH / state.rows));
    const width = Math.ceil(deviceW / scale), height = Math.ceil(deviceH / scale);
    const changed = width !== state.width || height !== state.height || deviceW !== state.deviceWidth || deviceH !== state.deviceHeight;
    Object.assign(state, { width, height, scale, deviceWidth: deviceW, deviceHeight: deviceH });
    if (canvas.width !== deviceW) canvas.width = deviceW;
    if (canvas.height !== deviceH) canvas.height = deviceH;
    if (offscreen.width !== width || offscreen.height !== height || !image) {
      offscreen.width = width; offscreen.height = height;
      image = offContext.createImageData(width, height);
      pixels = new Uint32Array(image.data.buffer);
    }
    context.imageSmoothingEnabled = false;
    return changed;
  }
  function present(surface, palette) {
    const colors = palette.colors, src = surface.data, n = Math.min(src.length, pixels.length);
    for (let i = 0; i < n; i++) pixels[i] = colors[src[i]];
    offContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    if (api.view) {
      // Debug: blow a region up to fill the canvas, keeping its aspect.
      const { x, y, w } = api.view, h = w * state.deviceHeight / state.deviceWidth;
      context.fillStyle = '#000';
      context.fillRect(0, 0, state.deviceWidth, state.deviceHeight);
      context.drawImage(offscreen, x, y, w, h, 0, 0, state.deviceWidth, state.deviceHeight);
      return;
    }
    context.drawImage(offscreen, 0, 0, state.width * state.scale, state.height * state.scale);
  }
  /** Client (CSS px) to logical pixel coordinates. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = state.deviceWidth / Math.max(1, rect.width);
    return {
      x: (clientX - rect.left) * dpr / state.scale,
      y: (clientY - rect.top) * (state.deviceHeight / Math.max(1, rect.height)) / state.scale,
    };
  }
  function setRows(rows) { state.rows = rows; return resize(); }
  resize();
  const api = { state, resize, present, toLogical, setRows, offscreen, view: null };
  return api;
}

/**
 * Allocation-free particle pool. Each particle walks a colour ramp over its life
 * (typically white → magic colour → dark) and is drawn snapped to the grid.
 */
export function createParticles(max = 1024) {
  const x = new Float32Array(max), y = new Float32Array(max);
  const px = new Float32Array(max), py = new Float32Array(max);
  const vx = new Float32Array(max), vy = new Float32Array(max);
  const age = new Float32Array(max), life = new Float32Array(max);
  const gravity = new Float32Array(max), drag = new Float32Array(max);
  const ramp = new Uint8Array(max), kind = new Uint8Array(max), size = new Uint8Array(max);
  const alive = new Uint8Array(max);
  const ramps = [];
  let cursor = 0, count = 0;
  const api = {
    x, y, vx, vy, age, life, kind, alive, max,
    get count() { return count; },
    /** Register a colour ramp (array of palette indices); returns its id. */
    ramp(indices) { ramps.push(Uint8Array.from(indices)); return ramps.length - 1; },
    /** kind: 0 dot, 1 streak (draws from last position), 2 plus-sparkle, 3 2x2 chunk */
    spawn(sx, sy, svx, svy, slife, rampId, g = 0, dr = 0, k = 0, s = 1) {
      for (let tries = 0; tries < max; tries++) {
        const i = cursor;
        cursor = (cursor + 1) % max;
        if (alive[i]) continue;
        alive[i] = 1; count++;
        x[i] = px[i] = sx; y[i] = py[i] = sy; vx[i] = svx; vy[i] = svy;
        age[i] = 0; life[i] = slife; ramp[i] = rampId; gravity[i] = g; drag[i] = dr; kind[i] = k; size[i] = s;
        return i;
      }
      return -1;
    },
    kill(i) { if (alive[i]) { alive[i] = 0; count--; } },
    clear() { alive.fill(0); count = 0; },
    update(dt, field) {
      for (let i = 0; i < max; i++) {
        if (!alive[i]) continue;
        age[i] += dt;
        if (age[i] >= life[i]) { alive[i] = 0; count--; continue; }
        px[i] = x[i]; py[i] = y[i];
        if (field) field(i, dt);
        const damp = drag[i] > 0 ? Math.exp(-drag[i] * dt) : 1;
        vx[i] *= damp; vy[i] = vy[i] * damp + gravity[i] * dt;
        x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      }
    },
    color(i) {
      const r = ramps[ramp[i]];
      return r[Math.min(r.length - 1, Math.floor(age[i] / life[i] * r.length))];
    },
    draw(surface, filter = -1) {
      for (let i = 0; i < max; i++) {
        if (!alive[i] || (filter >= 0 && kind[i] !== filter)) continue;
        const c = api.color(i);
        const ix = Math.round(x[i]), iy = Math.round(y[i]);
        switch (kind[i]) {
          case 1: surface.line(Math.round(px[i] - vx[i] * 0.03), Math.round(py[i] - vy[i] * 0.03), ix, iy, c); break;
          case 2: {
            surface.pset(ix, iy, c);
            if (age[i] / life[i] < 0.6) {
              surface.pset(ix - 1, iy, c); surface.pset(ix + 1, iy, c);
              surface.pset(ix, iy - 1, c); surface.pset(ix, iy + 1, c);
            }
            break;
          }
          case 3: surface.rect(ix, iy, size[i], size[i], c); break;
          default: surface.pset(ix, iy, c);
        }
      }
    },
  };
  return api;
}

/** Deterministic value noise in 1D/2D for terrain, clouds and caustics. */
export function createNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const values = new Float32Array(256);
  for (let i = 0; i < 256; i++) values[i] = rand();
  const fade = t => t * t * (3 - 2 * t);
  function n1(x) {
    const xi = Math.floor(x), t = fade(x - xi);
    const a = values[perm[xi & 255]], b = values[perm[(xi + 1) & 255]];
    return a + (b - a) * t;
  }
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = fade(x - xi), ty = fade(y - yi);
    const a = values[perm[(perm[xi & 255] + yi) & 255]], b = values[perm[(perm[(xi + 1) & 255] + yi) & 255]];
    const c = values[perm[(perm[xi & 255] + yi + 1) & 255]], d = values[perm[(perm[(xi + 1) & 255] + yi + 1) & 255]];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }
  function fbm1(x, octaves = 4) { let sum = 0, amp = 0.5, f = 1, norm = 0; for (let o = 0; o < octaves; o++) { sum += n1(x * f) * amp; norm += amp; amp *= 0.5; f *= 2; } return sum / norm; }
  function fbm2(x, y, octaves = 4) { let sum = 0, amp = 0.5, f = 1, norm = 0; for (let o = 0; o < octaves; o++) { sum += n2(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; } return sum / norm; }
  return { n1, n2, fbm1, fbm2 };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOut = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
/** Frame-rate independent approach of `current` toward `target`. */
export const approach = (current, target, rate, dt) => target + (current - target) * Math.exp(-rate * dt);
/** Hold a value to a stepped animation rate (e.g. 10 fps) so motion reads as sprite frames. */
export const stepped = (t, fps) => Math.floor(t * fps) / fps;
