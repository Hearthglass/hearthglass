import * as THREE from 'three';
import { randomGenerator } from './math.js';
import { extinctionGLSL, shadowGLSL, inscatterGLSL, waterTime, SURFACE } from './water.js';
import { ANEMONES } from './layout.js';

const MOTE_GAIN=110,MOTES=1400,BUBBLES=720,N=MOTES+BUBBLES;
export function createParticles(scene,simulation,shadow){
  const rng=randomGenerator(846),pos=new Float32Array(N*3),grain=new Float32Array(N*3),seed=new Float32Array(N),kind=new Float32Array(N);
  for(let i=0;i<MOTES;i++){
    pos.set([(rng()-.5)*21,rng()*8,-4+rng()*10],i*3);
    const big=rng()<.08,size=big?1.4+rng()*1.1:.5+rng()*.55;
    grain.set([size,big?.55+rng()*.45:1.1+rng()*1.1,.006+rng()*.01],i*3);
    seed[i]=rng();kind[i]=0;
  }
  for(let i=0;i<BUBBLES;i++){
    const k=MOTES+i;let x,y,z,size;
    if(i<220){
      // Columns rising behind the rock, out of the wide view's rear shadow.
      x=-1.2+(rng()-.5)*5.4;z=-3.4+rng()*1.4;y=.4+rng()*2.2;size=.028+rng()*.04;
    }else if(i<420){
      // Curtain from a hidden return nozzle on the right rear glass.
      x=8.4+(rng()-.5)*.6;z=-2.8+rng()*1.8;y=.2+rng()*1.4;size=.018+rng()*.028;
    }else if(i<620){
      const host=ANEMONES[i%ANEMONES.length];
      x=host.x+(rng()-.5)*host.radius*.7;z=host.z+(rng()-.5)*host.radius*.55;y=host.y-.4+rng()*.8;size=.016+rng()*.03;
    }else{
      // Rock pores on the island shoulders.
      x=(rng()<.5?-5.4:5.2)+(rng()-.5)*1.8;z=.4+rng()*1.8;y=.3+rng()*1.6;size=.014+rng()*.026;
    }
    pos.set([x,y,z],k*3);grain.set([size,1,0],k*3);seed[k]=rng();kind[k]=1;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('grain',new THREE.BufferAttribute(grain,3));
  g.setAttribute('seed',new THREE.BufferAttribute(seed,1));
  g.setAttribute('kind',new THREE.BufferAttribute(kind,1));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{pixelRatio:{value:1},reefTime:waterTime,...shadow},
    vertexShader:`uniform float pixelRatio;uniform float reefTime;attribute vec3 grain;attribute float seed;attribute float kind;varying vec3 glow;varying float disc;varying float vKind;varying vec2 vGlint;
      #include <packing>
      ${extinctionGLSL}${shadowGLSL}${inscatterGLSL}
      vec3 reefDrift(vec3 p,float t){
        float y=clamp(p.y,0.,${SURFACE.toFixed(2)}),wall=max(0.,1.-pow(p.x/9.65,8.));
        float profile=(.64+.36*sin(3.14159265*y/${SURFACE.toFixed(2)}))*wall;
        float drive=.10+.25*cos(.88*t+.2)+.115*cos(.49*t+1.8);
        return vec3(profile,.045*sin(p.x*.30)*sin(3.14159265*y/${SURFACE.toFixed(2)}),.12*sin(p.x*.23+p.z*.37)*profile)*drive;
      }
      void main(){
        vKind=kind;vec3 p=position;
        if(kind>.5){
          float speed=1.1+grain.x*28.,travel=${SURFACE.toFixed(2)}-position.y;
          float cling=1.0+seed*2.8,period=cling+travel/speed+1.6+seed*8.0;
          float age=mod(reefTime+seed*period,period),free=max(age-cling,0.);
          float risen=speed*(free-.45*(1.-exp(-free/.45)));
          p.y+=min(risen,travel);
          p.x+=sin(free*6.+seed*20.)*.04*smoothstep(0.,.8,free);
          p.z+=cos(free*5.1+seed*17.)*.03*smoothstep(0.,.8,free);
        }else{
          vec3 flow=reefDrift(position,reefTime);
          p.x=mod(position.x+reefTime*flow.x*3.4+11.,22.)-11.;
          p.y=mod(position.y-reefTime*grain.z-0.4,8.4)+0.4;
          p.z=mod(position.z+reefTime*flow.z*3.4+5.,10.)-5.;
        }
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        disc=clamp((kind>.5?70.*grain.x:22.*grain.x)/(-mv.z),2.,12.);gl_PointSize=disc*pixelRatio;
        vec3 light=reefInscatter(p,reefTime,reefLit(p));
        float path=reefTransmittance(reefWaterPath(p,cameraPosition)).g;
        if(kind>.5){
          glow=vec3(.55,.72,.9)*(.12+.88*dot(light,vec3(.3,.4,.3))*${MOTE_GAIN.toFixed(1)}*.018)*path;
          vGlint=vec2(-.16,.2);
        }else{
          // A quarter of the motes sit in beams and take most of the brightness; the rest
          // stay a faint haze so the water has a front and a back without snow.
          float shaft=dot(light,vec3(.25,.45,.30));
          glow=grain.y*${MOTE_GAIN.toFixed(1)}*pow(shaft,1.35)*vec3(.62,.84,1.)*path;
        }
      }`,
    fragmentShader:`varying vec3 glow;varying float disc;varying float vKind;varying vec2 vGlint;
      void main(){vec2 c=gl_PointCoord-.5;float r=length(c)*2.;
        if(vKind>.5){
          if(r>1.)discard;
          float rim=smoothstep(.5,1.,r),glint=exp(-dot(c-vGlint,c-vGlint)*55.);
          gl_FragColor=vec4(glow*(.35+.65*rim)+vec3(glint*1.6),(.25+.55*rim)*min(1.,6./disc));
        }else{
          float a=exp(-dot(c,c)*10.)*min(1.,5./disc);gl_FragColor=vec4(glow*a,1.);
        }}`});
  const points=new THREE.Points(g,mat);points.frustumCulled=false;scene.add(points);
  const foodGeo=new THREE.SphereGeometry(1,7,5),foodMat=new THREE.MeshStandardMaterial({color:'#b49366',roughness:.9});
  const pellets=new THREE.InstancedMesh(foodGeo,foodMat,simulation.food.length);pellets.frustumCulled=false;scene.add(pellets);const dummy=new THREE.Object3D();
  return {update(){
    simulation.food.forEach((p,i)=>{dummy.position.copy(p.position);dummy.scale.setScalar(p.active?p.size*(1-Math.pow(p.age/36,4)):0);dummy.updateMatrix();pellets.setMatrixAt(i,dummy.matrix);});
    pellets.instanceMatrix.needsUpdate=true;
  },setPixelRatio(r){mat.uniforms.pixelRatio.value=r;}};
}
