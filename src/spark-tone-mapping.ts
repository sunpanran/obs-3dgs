// SPDX-License-Identifier: GPL-2.0-or-later

import type * as THREE from "three";
import type { ToneMappingMode } from "./protocol";

const DECLARATION_MARKER = "precision highp int;";
const OUTPUT_MARKER = "#include <logdepthbuf_fragment>";

const TONE_MAPPING_DECLARATIONS = /* glsl */ `
uniform int obs3dgsToneMapping;
uniform float obs3dgsExposure;

vec3 obs3dgsLinearToSrgb(vec3 color) {
  color = max(color, vec3(0.0));
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, lessThanEqual(color, vec3(0.0031308)));
}

vec3 obs3dgsAces(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}
`;

const TONE_MAPPING_OUTPUT = /* glsl */ `
if (fragColor.a > 0.0) {
  vec3 obs3dgsColor = fragColor.rgb / fragColor.a;
  obs3dgsColor *= obs3dgsExposure;
  if (obs3dgsToneMapping == 1) {
    obs3dgsColor = clamp(obs3dgsColor, 0.0, 1.0);
  } else if (obs3dgsToneMapping == 2) {
    obs3dgsColor = obs3dgsAces(obs3dgsColor);
  }
  fragColor.rgb = obs3dgsLinearToSrgb(obs3dgsColor) * fragColor.a;
}
`;

export const toneMappingModeId = (mode: ToneMappingMode): 0 | 1 | 2 =>
  mode === "linear" ? 1 : mode === "aces" ? 2 : 0;

export const installSparkToneMapping = (material: THREE.ShaderMaterial): void => {
  if (!material.fragmentShader.includes(DECLARATION_MARKER) || !material.fragmentShader.includes(OUTPUT_MARKER)) {
    throw new Error("Spark tone-mapping shader markers are unavailable");
  }
  material.fragmentShader = material.fragmentShader
    .replace(DECLARATION_MARKER, `${DECLARATION_MARKER}\n${TONE_MAPPING_DECLARATIONS}`)
    .replace(OUTPUT_MARKER, `${TONE_MAPPING_OUTPUT}\n${OUTPUT_MARKER}`);
  material.uniforms.obs3dgsToneMapping = { value: 0 };
  material.uniforms.obs3dgsExposure = { value: 1 };
  material.needsUpdate = true;
};

export const updateSparkToneMapping = (
  material: THREE.ShaderMaterial,
  mode: ToneMappingMode,
  exposure: number
): void => {
  const toneMapping = material.uniforms.obs3dgsToneMapping;
  const exposureUniform = material.uniforms.obs3dgsExposure;
  if (!toneMapping || !exposureUniform)
    throw new Error("Spark tone-mapping uniforms are unavailable");
  toneMapping.value = toneMappingModeId(mode);
  exposureUniform.value = exposure;
};
