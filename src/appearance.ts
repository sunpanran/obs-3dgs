// SPDX-License-Identifier: GPL-2.0-or-later

import type { ColorValue } from "./protocol";

export interface AppearanceExposure {
  meshRecolor: ColorValue;
  shaderExposure: number;
}

// Spark's display shader performs exposure and tone mapping in linear space;
// recolor remains an independent user-controlled multiplier.
export const resolveAppearanceExposure = (
  recolor: ColorValue,
  exposure: number
): AppearanceExposure => ({
  meshRecolor: { ...recolor },
  shaderExposure: exposure
});
