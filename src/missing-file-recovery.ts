// SPDX-License-Identifier: GPL-2.0-or-later

import type { SourceState } from "./protocol";

export const isMissingFileRecovery = (
  previous: SourceState,
  next: SourceState,
  allowedMutation: unknown
): boolean => {
  if (allowedMutation !== "recoverMissingFile"
    || next.asset.frameOnLoad
    || next.asset.coordinatePreset !== previous.asset.coordinatePreset) return false;

  // A native Missing Files confirmation can replace the asset URL/type, while
  // every camera, scene, output, quality and safety setting remains unchanged.
  return JSON.stringify({ ...previous, asset: next.asset, locale: next.locale }) === JSON.stringify(next);
};
