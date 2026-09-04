// SPDX-License-Identifier: GPL-2.0-or-later

import { describe, expect, it } from "vitest";
import { withoutStaleCameraEcho } from "../src/interaction-state";
import { DEFAULT_STATE } from "../src/protocol";

describe("interactive camera authority", () => {
  it("drops a stale native camera echo while retaining unrelated state", () => {
    const update = {
      camera: { ...DEFAULT_STATE.camera, yawDeg: 5 },
      scene: { ...DEFAULT_STATE.scene, scale: 2 }
    };
    expect(withoutStaleCameraEcho(update, true, undefined)).toEqual({ scene: update.scene });
  });

  it("accepts a saved preset even during local camera authority", () => {
    const update = { camera: { ...DEFAULT_STATE.camera, focalLengthMm: 85 } };
    expect(withoutStaleCameraEcho(update, true, "applyPreset")).toBe(update);
  });

  it("accepts camera state after local authority expires", () => {
    const update = { camera: { ...DEFAULT_STATE.camera, yawDeg: 20 } };
    expect(withoutStaleCameraEcho(update, false, undefined)).toBe(update);
  });
});
