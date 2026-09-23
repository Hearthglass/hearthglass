import { register } from "node:module";
import assert from "node:assert/strict";

register("./three-loader.mjs", import.meta.url);
const THREE = await import("three");
const { BOUNDS, POPULATIONS, ADD_LIMIT, createFishSchool } = await import("../src/fish.js");
const { THICKETS } = await import("../src/plants.js");

const STEP = 1 / 60;
const inside = (p) =>
  p.x >= BOUNDS.minX - 0.05 && p.x <= BOUNDS.maxX + 0.05 &&
  p.y >= BOUNDS.minY - 0.05 && p.y <= BOUNDS.maxY + 0.05 &&
  p.z >= BOUNDS.minZ - 0.05 && p.z <= BOUNDS.maxZ + 0.05;
const meanNearest = (fish) => {
  let total = 0;
  for (const f of fish) {
    let nearest = Infinity;
    for (const other of fish) if (other !== f) nearest = Math.min(nearest, f.position.distanceTo(other.position));
    total += nearest;
  }
  return total / fish.length;
};

// Every tank size keeps its fish in the water, apart from each other and moving; the crowded
// tank may be tighter but must not collapse into a clump. Then fish are added by hand until
// the limit refuses one, and they must swim in from the side and settle like the rest.
const report = [];
for (const [level, count] of Object.entries(POPULATIONS)) {
  const scene = new THREE.Scene();
  const school = createFishSchool(scene, { thickets: THICKETS, count });
  const [bodies] = scene.children;
  assert.equal(school.fish.length, count);
  assert.equal(bodies.count, count);
  let spacing = 0, samples = 0, moving = 0;
  for (let frame = 0; frame < 60 * 60; frame++) {
    school.update(STEP, frame * STEP, null);
    if (frame % 60) continue;
    for (const f of school.fish) {
      assert.ok(Number.isFinite(f.position.x + f.position.y + f.position.z), `${level}: fish ${f.id} left the numbers`);
      assert.ok(inside(f.position), `${level}: fish ${f.id} outside the tank at ${f.position.toArray().map((v) => v.toFixed(2))}`);
    }
    if (frame >= 600) {
      spacing += meanNearest(school.fish);
      samples++;
      moving += school.fish.filter((f) => f.velocity.length() > 0.02).length / school.fish.length;
    }
  }
  spacing /= samples;
  moving /= samples;
  assert.ok(spacing > 0.45, `${level}: fish crowded to a mean nearest-neighbour of ${spacing.toFixed(3)}`);
  assert.ok(moving > 0.3, `${level}: only ${(moving * 100).toFixed(0)}% of fish moving`);

  let added = 0;
  while (school.addFish()) added++;
  assert.equal(added, ADD_LIMIT, `${level}: added ${added} fish, expected ${ADD_LIMIT}`);
  assert.equal(bodies.count, count + ADD_LIMIT);
  for (let frame = 0; frame < 60 * 30; frame++) school.update(STEP, 60 + frame * STEP, null);
  for (const f of school.fish) assert.ok(inside(f.position), `${level}: added fish ${f.id} outside the tank`);
  report.push(`${level} ${count}+${ADD_LIMIT}: spacing ${spacing.toFixed(2)}, ${(moving * 100).toFixed(0)}% moving`);
}
console.log(`PASS: ${report.join("; ")}`);
