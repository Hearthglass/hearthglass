import * as THREE from 'three';
import { extinctionGLSL, inscatterGLSL, shadowGLSL, waterTime } from './water.js';
import { createPostprocessing } from '../../shared/postprocessing.js';

const AO_SAMPLES=6,VOLUME_SAMPLES=16,VOLUME_SCALE=.25;
function passMaterial(uniforms, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader,
  });
}
function passScene(material) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return scene;
}

export function createComposite(camera, shadow) {
  const { target, post, postScene, postCamera } = createPostprocessing(camera, {
    samples: 2,
    uniforms: {
      ...shadow, reefTime: waterTime, eye: { value: new THREE.Vector3() },
      rayX: { value: new THREE.Vector3() }, rayY: { value: new THREE.Vector3() }, rayZ: { value: new THREE.Vector3() },
      volume: { value: null }, volumeSize: { value: new THREE.Vector2() },
    },
    fragmentShader: `uniform sampler2D beauty;uniform sampler2D depth;uniform sampler2D volume;uniform vec2 size;uniform vec2 volumeSize;uniform vec2 nearFar;uniform float aoRadiusScale;varying vec2 vUv;
      float distanceAt(vec2 p){float z=texture2D(depth,p).x;return nearFar.x*nearFar.y/(nearFar.y-z*(nearFar.y-nearFar.x));}
      void main(){
        vec3 color=texture2D(beauty,vUv).rgb;float center=distanceAt(vUv);float occlusion=0.;
        for(int i=0;i<${AO_SAMPLES};i++){
          float a=float(i)*2.399963;float radius=2.5+float(i)*${(14.85/(AO_SAMPLES-1)).toFixed(8)};
          float difference=center-distanceAt(vUv+vec2(cos(a),sin(a))*radius*aoRadiusScale/size);
          occlusion+=smoothstep(.012,.13,difference)*(1.-smoothstep(.2,.8,difference));
        }
        color*=1.-occlusion*${(.042*12/AO_SAMPLES).toFixed(8)};
        // Edge-aware upsample of the quarter-res shaft march, so a rock silhouette stays sharp.
        vec2 texel=1./volumeSize;vec3 glow=vec3(0.);float weight=0.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 p=vUv+vec2(float(x),float(y))*texel;float d=abs(distanceAt(p)-center);
          float w=exp(-d*d*8.);glow+=texture2D(volume,p).rgb*w;weight+=w;
        }
        color+=glow/max(weight,1e-4);
        float vignette=dot((vUv-.5)*vec2(1.,.85),(vUv-.5)*vec2(1.,.85));color*=1.-vignette*.16;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const volumeTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const blurTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const volumeUniforms = {
    depth: { value: target.depthTexture }, size: { value: new THREE.Vector2() }, nearFar: post.uniforms.nearFar,
    eye: post.uniforms.eye, rayX: post.uniforms.rayX, rayY: post.uniforms.rayY, rayZ: post.uniforms.rayZ,
    reefTime: waterTime, ...shadow,
  };
  const volumeMaterial = passMaterial(volumeUniforms, `uniform sampler2D depth;uniform vec2 size;uniform vec2 nearFar;
    uniform vec3 eye;uniform vec3 rayX;uniform vec3 rayY;uniform vec3 rayZ;uniform float reefTime;varying vec2 vUv;
    #include <packing>
    ${extinctionGLSL}${shadowGLSL}${inscatterGLSL}
    float distanceAt(vec2 p){float z=texture2D(depth,p).x;return nearFar.x*nearFar.y/(nearFar.y-z*(nearFar.y-nearFar.x));}
    void main(){
      float center=distanceAt(vUv);
      vec3 forward=normalize(rayZ);
      vec3 ray=normalize(rayZ+rayX*(vUv.x*2.-1.)+rayY*(vUv.y*2.-1.));
      float air=reefAirPath(eye,ray);
      float span=clamp(center/max(.05,dot(ray,forward))-air,0.,34.);
      float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
      vec3 glow=vec3(0.);
      for(int i=0;i<${VOLUME_SAMPLES};i++){
        float s=span*(float(i)+jitter)/${VOLUME_SAMPLES}.;vec3 p=eye+ray*(air+s);
        glow+=reefInscatter(p,reefTime,reefLit(p))*reefTransmittance(s);
      }
      gl_FragColor=vec4(glow*span/${VOLUME_SAMPLES}.,1.);
    }`);
  const blurMaterial = passMaterial({
    source: { value: volumeTarget.texture }, size: { value: new THREE.Vector2() }, axis: { value: new THREE.Vector2(1, 0) },
  }, `uniform sampler2D source;uniform vec2 size;uniform vec2 axis;varying vec2 vUv;
    void main(){
      vec2 texel=axis/size;
      vec3 c=texture2D(source,vUv).rgb*0.294117647;
      c+=texture2D(source,vUv+texel).rgb*0.352941176;
      c+=texture2D(source,vUv-texel).rgb*0.352941176;
      gl_FragColor=vec4(c,1.);
    }`);
  const volumeScene = passScene(volumeMaterial);
  const blurScene = passScene(blurMaterial);
  post.uniforms.volume.value = blurTarget.texture;
  return {
    target, post, postScene, postCamera, volumeTarget, blurTarget,
    resize(w, h) {
      const vw = Math.max(1, Math.round(w * VOLUME_SCALE)), vh = Math.max(1, Math.round(h * VOLUME_SCALE));
      volumeTarget.setSize(vw, vh); blurTarget.setSize(vw, vh);
      volumeMaterial.uniforms.size.value.set(w, h);
      blurMaterial.uniforms.size.value.set(vw, vh);
      post.uniforms.volumeSize.value.set(vw, vh);
    },
    composite(renderer) {
      renderer.setRenderTarget(volumeTarget);
      renderer.render(volumeScene, postCamera);
      blurMaterial.uniforms.source.value = volumeTarget.texture;
      blurMaterial.uniforms.axis.value.set(1, 0);
      renderer.setRenderTarget(blurTarget);
      renderer.render(blurScene, postCamera);
      blurMaterial.uniforms.source.value = blurTarget.texture;
      blurMaterial.uniforms.axis.value.set(0, 1);
      renderer.setRenderTarget(volumeTarget);
      renderer.render(blurScene, postCamera);
      post.uniforms.volume.value = volumeTarget.texture;
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
  };
}
