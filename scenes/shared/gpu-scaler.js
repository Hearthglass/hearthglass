// Bidirectional resolution scaler. GPU time from EXT_disjoint_timer_query_webgl2
// when the driver reports it; otherwise the CPU cost around the render call.
// Scales both down and back up so a fast GPU keeps full resolution.
export function createGpuScaler(renderer, {
  min = 0.72, max = 1, stepDown = 0.1, stepUp = 0.06,
  downFrames = 48, upFrames = 90, capture = false,
} = {}) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const queries = ext ? [gl.createQuery(), gl.createQuery()] : null;
  let slot = 0, pending = -1, scale = 1, slow = 0, fast = 0, gpuMs = 0, cpuMs = 0, open = false;
  const target = (fps) => 1000 / Math.max(1, fps);
  return {
    get scale() { return scale; },
    reset() { scale = 1; slow = 0; fast = 0; },
    begin() {
      cpuMs = performance.now();
      if (!queries) return;
      if (pending >= 0 && gl.getQueryParameter(queries[pending], gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
          gpuMs = gl.getQueryParameter(queries[pending], gl.QUERY_RESULT) / 1e6;
        pending = -1;
      }
      if (pending === slot) return;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, queries[slot]);
      open = true;
    },
    end(fps, elapsed) {
      if (queries && open) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending = slot;
        slot ^= 1;
        open = false;
      }
      cpuMs = performance.now() - cpuMs;
      const budget = target(fps);
      const cost = gpuMs > 0 ? gpuMs : cpuMs;
      if (capture) return false;
      const tight = cost > budget * 0.85 || elapsed > 1.65 / Math.max(1, fps);
      const spare = gpuMs > 0 ? gpuMs < budget * 0.55 : cpuMs < budget * 0.45;
      if (tight) { slow++; fast = 0; }
      else if (spare) { fast++; slow = Math.max(0, slow - 1); }
      else { slow = Math.max(0, slow - 1); fast = Math.max(0, fast - 1); }
      if (slow > downFrames && scale > min) {
        scale = Math.max(min, scale - stepDown); slow = 0; fast = 0; return true;
      }
      if (fast > upFrames && scale < max) {
        scale = Math.min(max, scale + stepUp); slow = 0; fast = 0; return true;
      }
      return false;
    },
  };
}
