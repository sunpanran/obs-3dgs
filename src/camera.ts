// SPDX-License-Identifier: GPL-2.0-or-later

import * as THREE from "three";
import type { SourceState } from "./protocol";

export interface FovPair {
  horizontalDeg: number;
  verticalDeg: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const clampFocalLength = (value: number): number => Math.min(200, Math.max(16, value));
export const clampPitch = (value: number): number => Math.min(89.5, Math.max(-89.5, value));

export const fovFromFocalLength = (focalLengthMm: number, aspect: number, filmGaugeMm = 36): FovPair => {
  const focal = clampFocalLength(focalLengthMm);
  const safeAspect = Math.max(0.01, aspect);
  const filmWidth = safeAspect >= 1 ? filmGaugeMm : filmGaugeMm * safeAspect;
  const filmHeight = safeAspect >= 1 ? filmGaugeMm / safeAspect : filmGaugeMm;
  return {
    horizontalDeg: 2 * Math.atan(filmWidth / (2 * focal)) * RAD_TO_DEG,
    verticalDeg: 2 * Math.atan(filmHeight / (2 * focal)) * RAD_TO_DEG
  };
};

export const applyCameraState = (camera: THREE.PerspectiveCamera, state: SourceState["camera"], aspect: number): void => {
  camera.aspect = Math.max(0.01, aspect);
  camera.filmGauge = state.filmGaugeMm;
  camera.setFocalLength(clampFocalLength(state.focalLengthMm));
  if (!state.autoClipping) {
    camera.near = state.nearClip;
    camera.far = Math.max(state.nearClip + 0.001, state.farClip);
  }

  const yaw = state.yawDeg * DEG_TO_RAD;
  const pitch = clampPitch(state.pitchDeg) * DEG_TO_RAD;
  const distance = Math.max(0.001, state.distance);
  const horizontal = Math.cos(pitch) * distance;
  const target = new THREE.Vector3(state.target.x, state.target.y, state.target.z);

  camera.position.set(
    target.x + Math.sin(yaw) * horizontal,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * horizontal
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  if (state.rollDeg !== 0) camera.rotateZ(state.rollDeg * DEG_TO_RAD);
  camera.updateProjectionMatrix();
};

export const cameraStateFromPose = (
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  previous: SourceState["camera"]
): SourceState["camera"] => {
  const offset = camera.position.clone().sub(target);
  const distance = Math.max(0.001, offset.length());
  return {
    ...previous,
    target: { x: target.x, y: target.y, z: target.z },
    yawDeg: Math.atan2(offset.x, offset.z) * RAD_TO_DEG,
    pitchDeg: Math.asin(THREE.MathUtils.clamp(offset.y / distance, -1, 1)) * RAD_TO_DEG,
    distance,
    focalLengthMm: camera.getFocalLength()
  };
};

export const frameDistanceForSphere = (
  radius: number,
  focalLengthMm: number,
  aspect: number,
  margin = 1.1
): number => {
  const fov = fovFromFocalLength(focalLengthMm, aspect);
  const limitingFov = Math.min(fov.horizontalDeg, fov.verticalDeg) * DEG_TO_RAD;
  return Math.max(0.01, (Math.max(radius, 0.001) * margin) / Math.sin(limitingFov / 2));
};

export const frameCameraForSphere = (
  camera: SourceState["camera"],
  center: THREE.Vector3,
  radius: number,
  aspect: number,
  margin = 1.1
): SourceState["camera"] => ({
  ...camera,
  target: { x: center.x, y: center.y, z: center.z },
  distance: frameDistanceForSphere(radius, camera.focalLengthMm, aspect, margin)
});
