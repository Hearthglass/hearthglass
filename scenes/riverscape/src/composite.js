import { createPostprocessing } from '../../shared/postprocessing.js';

export function createComposite(camera, settings) {
  return createPostprocessing(camera, { samples: settings.samples,
    fragmentShader: `
      uniform sampler2D beauty;uniform sampler2D depth;uniform vec2 size;uniform vec2 nearFar;uniform float aoRadiusScale;varying vec2 vUv;
      float distanceAt(vec2 p){float z=texture2D(depth,p).x;return nearFar.x*nearFar.y/(nearFar.y-z*(nearFar.y-nearFar.x));}
      float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
      bool finite(vec3 c){return !any(isnan(c))&&!any(isinf(c));}
      float safeLuma(vec3 c){return finite(c)?luma(c):0.;}
      void main(){
        vec3 color=texture2D(beauty,vUv).rgb;
        // Fireflies: a needle tip or leaf edge far thinner than a pixel can catch a highlight
        // bright enough that one multisample of it outweighs the rest of the pixel, and as the
        // plants sway those lone pixels flicker on and off all over the planting (a few go
        // dark the same way). A pixel much brighter than every one of its four neighbours, or
        // much darker than every one, takes their average colour instead. A thin line, bright
        // or dark, keeps neighbours like itself along its length and is left alone. Shading
        // that went NaN or infinite upstream is replaced the same way.
        vec2 texel=1./size;
        vec3 right=texture2D(beauty,vUv+vec2(texel.x,0.)).rgb,left=texture2D(beauty,vUv-vec2(texel.x,0.)).rgb;
        vec3 up=texture2D(beauty,vUv+vec2(0.,texel.y)).rgb,down=texture2D(beauty,vUv-vec2(0.,texel.y)).rgb;
        vec4 around=vec4(safeLuma(right),safeLuma(left),safeLuma(up),safeLuma(down));
        float highest=max(max(around.x,around.y),max(around.z,around.w)),lowest=min(min(around.x,around.y),min(around.z,around.w));
        float bright=luma(color);
        if(!finite(color)||bright>highest*1.3+.01||bright<lowest*.6-.005){
          vec3 sum=vec3(0.);float n=0.;
          if(finite(right)){sum+=right;n++;}if(finite(left)){sum+=left;n++;}
          if(finite(up)){sum+=up;n++;}if(finite(down)){sum+=down;n++;}
          color=n>0.?sum/n:vec3(0.);
        }
        float center=distanceAt(vUv);float occlusion=0.;
        for(int i=0;i<${settings.aoSamples};i++) {
          float a=float(i)*2.399963;float radius=2.5+float(i)*${(14.85 / (settings.aoSamples - 1)).toFixed(8)};
          float sampleDepth=distanceAt(vUv+vec2(cos(a),sin(a))*radius*aoRadiusScale/size);
          float difference=center-sampleDepth;
          occlusion+=smoothstep(.012,.13,difference)*(1.-smoothstep(.2,.8,difference));
        }
        color*=1.-occlusion*${(0.022 * 12 / settings.aoSamples).toFixed(8)};
        float vignette=dot((vUv-.5)*vec2(1.,.85),(vUv-.5)*vec2(1.,.85));
        color*=1.-vignette*.15;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
