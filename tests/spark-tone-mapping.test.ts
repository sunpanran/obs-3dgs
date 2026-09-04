// SPDX-License-Identifier: GPL-2.0-or-later

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { installSparkToneMapping, toneMappingModeId, updateSparkToneMapping } from "../src/spark-tone-mapping";

describe("Spark tone mapping", () => {
  it("maps public modes to stable shader values", () => {
    expect(toneMappingModeId("none")).toBe(0);
    expect(toneMappingModeId("linear")).toBe(1);
    expect(toneMappingModeId("aces")).toBe(2);
  });

  it("injects exposure and ACES processing into the Spark fragment output", () => {
    const material = new THREE.ShaderMaterial({
      fragmentShader: "precision highp int;\nvoid main() {\n#include <logdepthbuf_fragment>\n}"
    });
    installSparkToneMapping(material);
    expect(material.fragmentShader).toContain("obs3dgsAces");
    expect(material.fragmentShader).toContain("fragColor.rgb / fragColor.a");
    updateSparkToneMapping(material, "aces", 1.75);
    expect(material.uniforms.obs3dgsToneMapping?.value).toBe(2);
    expect(material.uniforms.obs3dgsExposure?.value).toBe(1.75);
  });
});
