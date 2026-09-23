import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../../riverscape/tests/three-loader.mjs',import.meta.url);
const THREE=await import('three');
const { ReefSimulation,FIXED_STEP,POPULATIONS,ADD_LIMIT }=await import('../src/simulation.js');
const { createFishSchool }=await import('../src/fish-model.js');
const { clearWater }=await import('../src/navigation.js');
const { TANK }=await import('../src/layout.js');

// Every tank size keeps its fish in open water, apart and moving, with the clownfish still
// three on the anemone. Then fish are added until the limit refuses one; they join their
// species' mesh and stay in open water like the rest.
// Inside the glass and under the surface.
const inside=p=>p.x>TANK.left&&p.x<TANK.right&&p.z>TANK.back&&p.z<TANK.front&&p.y>0&&p.y<TANK.surface;
const report=[];
for(const [level,shoal] of Object.entries(POPULATIONS)){
  const sim=new ReefSimulation(undefined,level),school=createFishSchool(new THREE.Scene(),sim);
  const count=3+shoal.chromis+shoal.anthias;
  assert.equal(sim.fish.length,count);assert.equal(sim.fish.filter(f=>f.kind==='clown').length,3);
  let spacing=0,samples=0,buried=0;
  for(let step=0;step<60/FIXED_STEP;step++){
    sim.step(FIXED_STEP,null);
    if(step%Math.round(1/FIXED_STEP))continue;
    for(const f of sim.fish){
      assert.ok(Number.isFinite(f.position.x+f.position.y+f.position.z),`${level}: a fish left the numbers`);
      assert.ok(inside(f.position),`${level}: a ${f.kind} left the tank at ${f.position.toArray().map(v=>v.toFixed(2))}`);
      // Clownfish bathe among the anemone's tentacles, which clearWater counts as solid.
      if(f.kind!=='clown'&&!clearWater(f.position,.05))buried++;
    }
    let total=0;for(const f of sim.fish){let nearest=Infinity;for(const o of sim.fish)if(o!==f)nearest=Math.min(nearest,f.position.distanceTo(o.position));total+=nearest;}
    spacing+=total/sim.fish.length;samples++;
  }
  spacing/=samples;
  assert.ok(spacing>.35,`${level}: fish crowded to a mean nearest-neighbour of ${spacing.toFixed(3)}`);
  assert.ok(buried<=samples*count*.01,`${level}: fish inside rock on ${buried} samples`);
  let added=0;while(sim.addFish())added++;
  assert.equal(added,ADD_LIMIT);
  school.update();
  assert.equal(school.groups.reduce((n,g)=>n+g.mesh.count,0),count+ADD_LIMIT,`${level}: added fish missing from the meshes`);
  for(let step=0;step<30/FIXED_STEP;step++)sim.step(FIXED_STEP,null);
  for(const f of sim.fish)assert.ok(inside(f.position),`${level}: an added ${f.kind} left the tank`);
  report.push(`${level} ${count}+${ADD_LIMIT}: spacing ${spacing.toFixed(2)}`);
}
console.log(`PASS: ${report.join('; ')}`);
