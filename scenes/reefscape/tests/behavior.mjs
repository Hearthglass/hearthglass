import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../../riverscape/tests/three-loader.mjs', import.meta.url);
const { ReefSimulation, FIXED_STEP, POPULATION, SHRIMP, SELECTION_HOLD }=await import('../src/simulation.js');
const { currentAt,responseAt,WAVES,SURFACE }=await import('../src/water.js');
const { HOST }=await import('../src/terrain.js');
const { Vector3, PerspectiveCamera }=await import('three');
const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const sim=new ReefSimulation();
assert.equal(sim.fish.length,19);assert.equal(sim.shrimp.length,2);assert.equal(POPULATION.clownfish,3);
// Percula sizes must stay on Buston & Cant's ladder: 1.26 between adjacent ranks, 1.37
// for the two smallest. A group that drifts off it stops reading as a dominance queue.
const clowns=sim.fish.filter(f=>f.kind==='clown').map(f=>f.size);
assert.ok(Math.abs(clowns[0]/clowns[1]-1.26)<.05&&Math.abs(clowns[1]/clowns[2]-1.37)<.05,`Rank ratios ${clowns}`);
// The terminal male is half again the length of his females, as FishBase's 15 cm against
// 7 cm and an aquarium harem's 12.5 cm against 9 both imply.
const goldies=sim.fish.filter(f=>f.kind==='anthias');
const male=goldies.find(f=>!f.rank),hens=goldies.filter(f=>f.rank);
assert.ok(male.size/(hens.reduce((s,f)=>s+f.size,0)/hens.length)>1.35,'Terminal male must outsize the harem');
let maxHome=0,cleaned=0,displayed=0,henDisplayed=0;
// The male retains a lower local slot, but a travelling group is not required to hold a
// fixed vertical hierarchy while turning, feeding, diving or navigating reef obstacles.
assert.ok(male.position.y<hens.reduce((n,f)=>n+f.position.y,0)/hens.length);
let shrimpRange=[0,0],shrimpHome=[0,0],shrimpWalked=0,advertising=0;
const shrimpWas=sim.shrimp.map(s=>s.position.clone());
for(let i=0;i<60*180;i++){
  if(i===60*10||i===60*32)sim.feed(-1.5,1.3);
  sim.step(FIXED_STEP);
  for(const f of sim.fish){if(f.state==='clean')cleaned++;if(f.state==='display')f.rank?henDisplayed++:displayed++;}
  // A cleaner shrimp is a station animal that takes excursions: it works its own shoulder,
  // leaves it for the sand or the next rock now and then and comes back, and every channel
  // the vertex shaders read has to stay finite.
  sim.shrimp.forEach((s,i)=>{
    const away=Math.hypot(s.position.x-s.home.x,s.position.z-s.home.z);shrimpRange[i]=Math.max(shrimpRange[i],away);if(away<SHRIMP.range+.1)shrimpHome[i]++;
    shrimpWalked+=Math.hypot(s.position.x-shrimpWas[i].x,s.position.z-shrimpWas[i].z);shrimpWas[i].copy(s.position);
    assert.ok([s.position.x,s.position.y,s.position.z,s.yaw,s.step,s.walk,s.pick,s.sway,s.signal,s.flick,s.reach,s.curl,s.rhythm].every(Number.isFinite),'Shrimp state finite');
  });
  advertising+=sim.shrimp.some(s=>s.state==='advertise')?1:0;
  if(i%60===0){
    assert.ok(sim.diagnostics().finite);
    for(const f of sim.fish){
      assert.ok(f.velocity.length()<1.701);
      if(f.kind==='clown')maxHome=Math.max(maxHome,Math.hypot(f.position.x-HOST.x,f.position.y-HOST.y,f.position.z-HOST.z));
    }
  }
}
assert.ok(maxHome<2.6,`Clownfish host radius ${maxHome}`);
// Reef-wide coverage now lives in locomotion.mjs. The old requirement that chromis
// remain over one coral >72% of the time contradicted free roaming.
// A fish swims where it points. Its velocity through the water must lie along its heading
// whenever it is under way; a body sliding sideways to its goal is the tell of a tracker.
let aligned=0,moving=0;const flow=V(),rel=V(),head=V();
for(let i=0;i<60*20;i++){sim.step(FIXED_STEP);for(const f of sim.fish){currentAt(f.position,sim.time,flow);rel.copy(f.velocity).sub(flow);if(rel.length()<.2)continue;head.set(Math.cos(f.yaw)*Math.cos(f.pitch),Math.sin(f.pitch),-Math.sin(f.yaw)*Math.cos(f.pitch));moving++;if(head.dot(rel)/rel.length()>.94)aligned++;}}
assert.ok(aligned/moving>.85,`Fish swim along their heading ${aligned}/${moving} of the time`);
// And it does not beat its tail without going anywhere: a bout must be followed by a
// glide, so no species beats more than half the time or glides all of it.
for(const kind of ['chromis','anthias']){const of=sim.fish.filter(f=>f.kind===kind);let beats=0,n=0;for(let i=0;i<60*30;i++){sim.step(FIXED_STEP);for(const f of of){n++;if(f.beat)beats++;}}assert.ok(beats/n>.12&&beats/n<.55,`${kind} bout fraction ${(beats/n).toFixed(2)}`);}
assert.ok(cleaned>0,'Fish must visit the cleaner shrimp');
// Stop-and-go over its own patch, and out and back: in three minutes each shrimp has to cover
// real ground, leave its shoulder at least once, never go further than an excursion allows,
// and still spend most of its time at the station, advertising often enough for a fish to come.
assert.ok(shrimpWalked>3,`Shrimp walked only ${shrimpWalked.toFixed(2)} u`);
sim.shrimp.forEach((s,i)=>{
  assert.ok(shrimpRange[i]>.9&&shrimpRange[i]<SHRIMP.roam+.2,`Shrimp ${i} strayed ${shrimpRange[i].toFixed(2)} u from its station`);
  assert.ok(shrimpHome[i]/(60*180)>.55,`Shrimp ${i} was at its station only ${(100*shrimpHome[i]/(60*180)).toFixed(0)}% of the time`);
});
assert.ok(advertising/(60*180)>.5,`A shrimp was advertising only ${(100*advertising/(60*180)).toFixed(0)}% of the time`);
assert.ok(displayed>0&&henDisplayed===0,`U-swim is male-only: male ${displayed}, females ${henDisplayed}`);
assert.ok(sim.consumed>0,'Fish must actually consume food');
assert.equal(sim.food.filter(p=>p.active).length,0,'Food bounded lifetime');
const a=new ReefSimulation(42),b=new ReefSimulation(42);
for(let i=0;i<600;i++){a.step(FIXED_STEP);b.step(FIXED_STEP);}
for(let i=0;i<a.fish.length;i++)assert.deepEqual(a.fish[i].position.toArray(),b.fish[i].position.toArray());
const threatened=a.fish[0];const pointer={position:threatened.position.clone(),speed:8};a.step(FIXED_STEP,pointer);assert.equal(threatened.state,'shelter');
// A startle runs through a school as a wave, not as one event. Frighten a single chromis
// and its pod must follow within a few frames — but not in the same one.
const wave=new ReefSimulation();
const seed=wave.fish.find(f=>f.kind==='chromis'),pod=wave.fish.filter(f=>f.kind==='chromis'&&f!==seed&&f.shoal===seed.shoal);
// A known nearby chain tests communication, not the chance that a travelling fish
// happens to have neighbours at one arbitrary moment.
[seed,...pod].forEach((f,i)=>{f.position.set(-.8+i*.65,6.8,3.4);f.velocity.set(0,0,0);f.goal.copy(f.position);f.goalTimer=5;});
seed.alarm=2.6;wave.step(FIXED_STEP);
const first=pod.filter(f=>f.alarm>0).length;
assert.ok(first<pod.length,`A startle cannot reach a whole pod in one frame (${first}/${pod.length})`);
for(let i=0;i<12;i++)wave.step(FIXED_STEP);
assert.ok(pod.filter(f=>f.alarm>0).length>first,'A startle must keep spreading through the pod');
const pool=new ReefSimulation();for(let i=0;i<30;i++){pool.lastFeed=-100;pool.feed(0,1);}assert.equal(pool.food.filter(p=>p.active).length,pool.food.length);
assert.equal(pool.feed(0,1),0,'Feed cooldown works');
for(const t of [0,1,10,100,10000]){
 const v=currentAt(V(0,2,0),t,V());assert.ok(v.toArray().every(Number.isFinite));assert.ok(v.length()<1.8);
 const response=responseAt(V(0,2,0),t,.8,V());assert.ok(response.toArray().every(Number.isFinite));
}
for(const w of WAVES)assert.ok(Math.abs(w.omega*w.omega-98.1*w.k*Math.tanh(w.k*SURFACE))<1e-9);
assert.throws(()=>sim.step(NaN),RangeError);assert.throws(()=>sim.step(1),RangeError);
// Curious mode: open water fish approach pointer; lunge still spooks fish to shelter.
const curSim=new ReefSimulation(1234);curSim.setMode('curious');
assert.equal(curSim.mode,'curious');
const curPointer={position:V(0,3,0),speed:0};
const beforeDist=curSim.fish.filter(f=>f.kind!=='clown').reduce((sum,f)=>sum+f.position.distanceTo(curPointer.position),0)/16;
for(let i=0;i<300;i++)curSim.step(FIXED_STEP,curPointer);
const afterDist=curSim.fish.filter(f=>f.kind!=='clown').reduce((sum,f)=>sum+f.position.distanceTo(curPointer.position),0)/16;
assert.ok(afterDist<beforeDist,`Curious reef fish should approach pointer: before ${beforeDist.toFixed(2)}, after ${afterDist.toFixed(2)}`);
const lungePointer={position:curSim.fish[0].position.clone(),speed:2.5};
curSim.step(FIXED_STEP,lungePointer);
assert.equal(curSim.fish[0].state,'shelter','Lunge must trigger shelter even in curious mode');

// Curious reaches the whole reef: a still-new cursor at one end draws the open-water fish
// from everywhere, and a cursor left still long enough is lost interest in.
const farSim=new ReefSimulation(4321);farSim.setMode('curious');
const farPointer={position:V(5,5,2.4),speed:0};
for(let i=0;i<60*10;i++)farSim.step(FIXED_STEP,farPointer);
const openFish=farSim.fish.filter(f=>f.kind!=='clown');
const gatheredReef=openFish.filter(f=>f.position.distanceTo(farPointer.position)<3.5).length;
assert.ok(gatheredReef>openFish.length*.6,`A curious reef must gather at the cursor (${gatheredReef} of ${openFish.length})`);
for(let i=0;i<60*12;i++)farSim.step(FIXED_STEP,farPointer);
assert.equal(farSim.fish.filter(f=>f.state==='curious').length,0,'A cursor left still is lost interest in');

// Shy: a cursor crossing at a steady pace pushes fish aside without sending them to cover.
const shySim=new ReefSimulation(2468);
for(let i=0;i<300;i++)shySim.step(FIXED_STEP);
let shyClosest=Infinity,shyPushed=0,shyCover=0;
for(let i=0;i<60*6;i++){
  const sweepPointer={position:V(-8+3*i/60,5.5,2.4),speed:1.5};
  shySim.step(FIXED_STEP,sweepPointer);
  for(const f of shySim.fish)if(f.kind!=='clown')shyClosest=Math.min(shyClosest,f.position.distanceTo(sweepPointer.position));
  shyPushed=Math.max(shyPushed,shySim.fish.filter(f=>f.wary>.2).length);
  shyCover+=shySim.fish.filter(f=>f.state==='shelter').length;
}
assert.ok(shyPushed>0,'A passing cursor must push some fish aside');
assert.equal(shyCover,0,'A steady cursor moves fish aside without sending them to cover');

// Drag selection: the finished marquee is held, then fades.
const selSim=new ReefSimulation(5678);
const selCamera=new PerspectiveCamera(36,16/9,0.08,140);
selCamera.position.set(0,3,10);
selCamera.lookAt(0,2,0);
selCamera.updateMatrixWorld();
selSim.setSelection({x0:0,y0:0,x1:1920,y1:1080},selCamera);
selSim.step(FIXED_STEP);
assert.ok(selSim.selectedFish.length>0,`Reefscape selection box should select fish (got ${selSim.selectedFish.length})`);
for(const idx of selSim.selectedFish){
  assert.equal(selSim.fish[idx].highlight,1.0,'Selected fish highlight should be 1.0');
  assert.ok(selSim.fish[idx].wasSelected,'wasSelected should be true');
}
selSim.setSelection(null);
for(let i=0;i<60;i++)selSim.step(FIXED_STEP);
for(const idx of selSim.selectedFish)assert.equal(selSim.fish[idx].highlight,1.0,'A finished selection must be held');
for(let i=0;i<Math.round((SELECTION_HOLD+2)/FIXED_STEP);i++)selSim.step(FIXED_STEP);
for(const f of selSim.fish)assert.equal(f.highlight,0,'The held selection fades once the hold is over');

// Drag gesture: a marquee selects; a drag begun on a selected fish carries the group to
// the cursor; letting go leaves it selected.
const onScreen=f=>{const q=f.position.clone().project(selCamera);return {x:(q.x*.5+.5)*1920,y:(-q.y*.5+.5)*1080};};
assert.equal(selSim.drag({phase:'start',x0:0,y0:0,x:5,y:5}),'select','A drag away from any selection draws a marquee');
selSim.drag({phase:'move',x0:0,y0:0,x:1920,y:1080});selSim.step(FIXED_STEP);
selSim.drag({phase:'end',x0:0,y0:0,x:1920,y:1080});
const reefGrabbed=selSim.selectedFish;
assert.ok(reefGrabbed.length>0,'The marquee drag must select fish');
const reefHandle=onScreen(selSim.fish[reefGrabbed[0]]);
assert.equal(selSim.drag({phase:'start',x0:reefHandle.x,y0:reefHandle.y,x:reefHandle.x,y:reefHandle.y}),'herd','A drag begun on a selected fish picks the group up');
const reefDrop={x:reefHandle.x<960?1450:450,y:420};
selSim.drag({phase:'move',x0:reefHandle.x,y0:reefHandle.y,x:reefDrop.x,y:reefDrop.y});
const reefScreenDistance=()=>reefGrabbed.reduce((sum,idx)=>{const at=onScreen(selSim.fish[idx]);return sum+Math.hypot(at.x-reefDrop.x,at.y-reefDrop.y);},0)/reefGrabbed.length;
const reefDragBefore=reefScreenDistance();
for(let i=0;i<60*6;i++)selSim.step(FIXED_STEP);
const reefDragAfter=reefScreenDistance();
assert.ok(reefDragAfter<reefDragBefore*.6,`The dragged reef group must come to the cursor (${reefDragBefore.toFixed(0)}px to ${reefDragAfter.toFixed(0)}px)`);
selSim.drag({phase:'end',x0:reefHandle.x,y0:reefHandle.y,x:reefDrop.x,y:reefDrop.y});
selSim.step(FIXED_STEP);
assert.deepEqual(selSim.selectedFish,reefGrabbed,'Letting go keeps the group selected');
for(let i=0;i<60*8;i++)selSim.step(FIXED_STEP);
assert.ok(selSim.fish.every(f=>f.state!=='herd'),'A group let go of settles once delivered');

// A quick flick: let go almost at once, and the group still swims on to where it was put.
const flickHandle=onScreen(selSim.fish[reefGrabbed[0]]);
assert.equal(selSim.drag({phase:'start',x0:flickHandle.x,y0:flickHandle.y,x:flickHandle.x,y:flickHandle.y}),'herd','The released group can be picked up again');
const flickTo={x:flickHandle.x<960?1450:450,y:420};
selSim.drag({phase:'move',x0:flickHandle.x,y0:flickHandle.y,x:flickTo.x,y:flickTo.y});selSim.step(FIXED_STEP);
selSim.drag({phase:'end',x0:flickHandle.x,y0:flickHandle.y,x:flickTo.x,y:flickTo.y});
const flickDistance=()=>reefGrabbed.reduce((sum,idx)=>{const at=onScreen(selSim.fish[idx]);return sum+Math.hypot(at.x-flickTo.x,at.y-flickTo.y);},0)/reefGrabbed.length;
const flickBefore=flickDistance();
for(let i=0;i<60*6;i++)selSim.step(FIXED_STEP);
const flickAfter=flickDistance();
assert.ok(flickAfter<flickBefore*.6,`A flicked reef group must still reach where it was let go (${flickBefore.toFixed(0)}px to ${flickAfter.toFixed(0)}px)`);

// Play Mode test: fish remain selected in play mode, herd to pointer, and stay selected on release
const playSim=new ReefSimulation(9999);
playSim.setPlayMode(true);
playSim.setSelection({x0:0,y0:0,x1:1920,y1:1080},selCamera);
playSim.step(FIXED_STEP);
assert.ok(playSim.selectedFish.length>0,'Play mode should select visible fish');
const herdedReefCount=playSim.selectedFish.length;

// In play mode, clearing the selection marquee (null) retains highlight = 1.0
playSim.setSelection(null);
for(let i=0;i<60;i++)playSim.step(FIXED_STEP);
for(const idx of playSim.selectedFish){
  assert.equal(playSim.fish[idx].highlight,1.0,'Play mode fish highlight should remain 1.0');
}

// Herd toward a pointer
const herdReefPointer={position:V(1.5,3.0,1.0),speed:0};
playSim.setHerd({active:true});
const reefDistBefore=playSim.selectedFish.reduce((sum,idx)=>sum+playSim.fish[idx].position.distanceTo(herdReefPointer.position),0)/herdedReefCount;
for(let i=0;i<120;i++)playSim.step(FIXED_STEP,herdReefPointer);
const reefDistAfter=playSim.selectedFish.reduce((sum,idx)=>sum+playSim.fish[idx].position.distanceTo(herdReefPointer.position),0)/herdedReefCount;
assert.ok(reefDistAfter<reefDistBefore,`Herded reef fish should follow pointer (before ${reefDistBefore.toFixed(2)}, after ${reefDistAfter.toFixed(2)})`);

// Release herd: the group stays selected in play mode, ready to be picked up again
playSim.setHerd({active:false});
playSim.step(FIXED_STEP,herdReefPointer);
assert.equal(playSim.selectedFish.length,herdedReefCount,'Released reef fish stay selected in play mode');
for(let i=0;i<60*8;i++)playSim.step(FIXED_STEP);
assert.ok(playSim.fish.every(f=>f.state!=='herd'),'A released herd settles once delivered');
playSim.setPlayMode(false);
assert.equal(playSim.selectedFish.length,0,'Leaving play mode clears the selection');

console.log(JSON.stringify({pass:true,simulatedSeconds:sim.time,consumed:sim.consumed,maxClownfishHostDistance:maxHome,...sim.diagnostics()},null,2));
