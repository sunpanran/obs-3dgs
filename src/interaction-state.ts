// SPDX-License-Identifier: GPL-2.0-or-later

import type { SourceState } from "./protocol";

export const withoutStaleCameraEcho = (
  update: Partial<SourceState>,
  localCameraAuthority: boolean,
  allowedMutation: unknown
): Partial<SourceState> => {
  if (!localCameraAuthority || !update.camera || allowedMutation === "applyPreset")
    return update;
  const sanitized = { ...update };
  delete sanitized.camera;
  return sanitized;
};
