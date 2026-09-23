import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../../riverscape/tests/three-loader.mjs',import.meta.url);
const THREE=await import('three');
const { ReefSimulation,FIXED_STEP }=await import('../src/simulation.js');
const { createShrimp,antennaDepth }=await import('../src/shrimp.js');

// Sixty seconds of cleaner shrimp, drawn at 30 fps. At every frame, on both sides, the
// antennae as the shader draws them, turned as far as the model turned them, must clear
// the rock. The same frames unturned are measured too, so the test is known to be
// exercising contact at all.
const sim=new ReefSimulation(),shrimp=createShrimp(new THREE.Scene(),sim),point=new THREE.Vector3();
let frames=0,wouldClip=0,clipped=0,deepest=0;
for(let step=0;step<60/FIXED_STEP;step++){
  sim.step(FIXED_STEP,null);
  if(step%Math.round(1/(30*FIXED_STEP)))continue;
  shrimp.update();frames++;
  shrimp.models.forEach((m,i)=>{
    for(const [side,raise,roll] of [[-1,'x','z'],[1,'y','w']]){
      if(antennaDepth(sim.shrimp[i],m.root,side,0,0,point)>0)wouldClip++;
      const depth=antennaDepth(sim.shrimp[i],m.root,side,m.lift.value[raise],m.lift.value[roll],point);
      if(depth>0){clipped++;deepest=Math.max(deepest,depth);}
    }
  });
}
assert.ok(frames>1500,`expected ~1800 frames, got ${frames}`);
assert.ok(wouldClip>100,`expected the shrimp to meet rock often enough to test (${wouldClip} side-frames)`);
assert.equal(clipped,0,`antennae drawn inside the rock on ${clipped} side-frames, ${(deepest*100).toFixed(1)} cm deep at worst`);
console.log(`PASS: ${frames} frames; ${wouldClip} side-frames would have put an antenna into the rock, none do.`);
