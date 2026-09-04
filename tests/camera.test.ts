import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyCameraState, frameCameraForSphere, frameDistanceForSphere, fovFromFocalLength } from "../src/camera";
import { DEFAULT_STATE } from "../src/protocol";
import { normalizeState } from "../src/state";

describe("photographic camera", () => {
  it("keeps the same camera pose when a multi-turn yaw/roll is normalized", () => {
    const state = { ...DEFAULT_STATE.camera, yawDeg: 803.45, rollDeg: -730 };
    const before = new THREE.PerspectiveCamera();
    const after = new THREE.PerspectiveCamera();
    applyCameraState(before, state, 16 / 9);
    applyCameraState(after, normalizeState({ camera: state }).camera, 16 / 9);
    expect(before.position.distanceTo(after.position)).toBeLessThan(1e-10);
    expect(Math.abs(before.quaternion.dot(after.quaternion))).toBeCloseTo(1, 12);
    expect(after.getFocalLength()).toBe(before.getFocalLength());
  });
  it("derives full-frame FOV from focal length", () => {
    const fov = fovFromFocalLength(35, 16 / 9);
    expect(fov.horizontalDeg).toBeCloseTo(54.43, 1);
    expect(fov.verticalDeg).toBeCloseTo(32.27, 1);
  });

  it("keeps focal length while aspect ratio changes", () => {
    const wide = fovFromFocalLength(50, 16 / 9);
    const square = fovFromFocalLength(50, 1);
    expect(wide.horizontalDeg).toBeCloseTo(square.horizontalDeg, 8);
    expect(wide.verticalDeg).toBeLessThan(square.verticalDeg);
  });

  it("moves a telephoto camera farther away when framing the same sphere", () => {
    const wide = frameDistanceForSphere(2, 24, 16 / 9);
    const telephoto = frameDistanceForSphere(2, 85, 16 / 9);
    expect(telephoto).toBeGreaterThan(wide);
  });

  it("frames all without changing lens or viewing direction", () => {
    const camera = { ...DEFAULT_STATE.camera, focalLengthMm: 85, yawDeg: 72, pitchDeg: -20 };
    const framed = frameCameraForSphere(camera, new THREE.Vector3(1, 2, 3), 4, 16 / 9);
    expect(framed.target).toEqual({ x: 1, y: 2, z: 3 });
    expect(framed.focalLengthMm).toBe(85);
    expect(framed.yawDeg).toBe(72);
    expect(framed.pitchDeg).toBe(-20);
    expect(framed.distance).toBeGreaterThan(4);
  });

  it("performs optical zoom without moving the camera", () => {
    const camera = new THREE.PerspectiveCamera();
    applyCameraState(camera, { ...DEFAULT_STATE.camera, focalLengthMm: 24 }, 16 / 9);
    const widePosition = camera.position.clone();
    applyCameraState(camera, { ...DEFAULT_STATE.camera, focalLengthMm: 85 }, 16 / 9);
    expect(camera.position.distanceTo(widePosition)).toBeLessThan(1e-10);
    expect(camera.getFocalLength()).toBeCloseTo(85, 8);
  });
});
