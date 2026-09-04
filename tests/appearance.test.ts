// SPDX-License-Identifier: GPL-2.0-or-later

import { describe, expect, it } from "vitest";
import { resolveAppearanceExposure } from "../src/appearance";

describe("appearance exposure", () => {
  it("keeps scene recolor independent and forwards exposure to the Spark shader", () => {
    expect(resolveAppearanceExposure({ r: 1, g: 0.5, b: 0.25 }, 2)).toEqual({
      meshRecolor: { r: 1, g: 0.5, b: 0.25 },
      shaderExposure: 2
    });
  });

});
