import { QUALITY_PRESETS, qualityName, renderScale } from '../../shared/render-policy.js';
// Rendering budgets, kept separate from animation and habitat behaviour. The reference
// profile reproduces the uploaded rendering/density settings for local A/B checks.
export const PROFILES = Object.freeze({
  balanced: Object.freeze({
    name: 'balanced',
    shadowSize: 2048,
    // Cheap plant depth only follows the slow drag, so 15 Hz does not step the way a
    // full-ripple shadow would at 20–30 fps. Static wood and stone stay in the map.
    shadowHz: 15,
    batteryShadowHz: 8,
    aoSamples: 6,
    backgroundDensity: 0.7,
    backgroundRows: 20,
    backgroundCols: 2,
    powerPreference: 'low-power',
  }),
  reference: Object.freeze({
    name: 'reference',
    shadowSize: 4096,
    shadowHz: Infinity,
    batteryShadowHz: 15,
    aoSamples: 8,
    backgroundDensity: 1,
    backgroundRows: 30,
    backgroundCols: 6,
    powerPreference: 'high-performance',
  }),
});

export function renderSettings({
  profile = 'balanced', wallpaper = false, pixelRatio = 1, onBattery = false,
} = {}) {
  const budget = PROFILES[profile] || PROFILES.balanced;
  const dpr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const referenceResolution = wallpaper ? Math.min(2, Math.max(1.5, dpr)) : 1.5;
  return {
    ...budget,
    // Do not make Retina resolution a multiplier of an already supersampled target.
    resolution: budget.name === 'reference' ? referenceResolution :
      renderScale(profile, pixelRatio, onBattery),
    maxPixels: budget.name === 'reference' ? Infinity : QUALITY_PRESETS[qualityName(profile)].pixels,
    referenceResolution,
    shadowHz: onBattery ? budget.batteryShadowHz : budget.shadowHz,
    // Needles and ribbon edges far thinner than a pixel need 4x MSAA to hold together
    // (the reference profile also spends it on quarter-sample leaf translucency). Keep it
    // and the HDR format: changing either would be a much larger visual change.
    samples: 4,
  };
}

export { framebufferSize } from '../../shared/render-policy.js';
