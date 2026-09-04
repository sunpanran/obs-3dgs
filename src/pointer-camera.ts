// SPDX-License-Identifier: GPL-2.0-or-later

import * as THREE from "three";
import { applyCameraState } from "./camera";
import type { SourceState } from "./protocol";

interface PointerCameraOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  getState: () => SourceState["camera"];
  getAspect: () => number;
  isLocked: () => boolean;
  onChange: (camera: SourceState["camera"]) => void;
  onReset: () => void;
}

export class PointerCamera {
  private readonly options: PointerCameraOptions;
  private pointerId: number | null = null;
  private button = -1;
  private lastX = 0;
  private lastY = 0;

  constructor(options: PointerCameraOptions) {
    this.options = options;
    const { canvas } = options;
    canvas.addEventListener("contextmenu", this.preventContextMenu);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
  }

  dispose(): void {
    const { canvas } = this.options;
    canvas.removeEventListener("contextmenu", this.preventContextMenu);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  private preventContextMenu = (event: MouseEvent): void => event.preventDefault();

  private onPointerDown = (event: PointerEvent): void => {
    if (this.options.isLocked() || (event.button !== 0 && event.button !== 2)) return;
    this.pointerId = event.pointerId;
    this.button = event.button;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.options.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId || this.options.isLocked()) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    const state = this.options.getState();

    if (this.button === 0) {
      this.commit({
        ...state,
        yawDeg: state.yawDeg - dx * 0.25,
        pitchDeg: THREE.MathUtils.clamp(state.pitchDeg + dy * 0.25, -89.5, 89.5)
      });
      return;
    }

    const camera = this.options.camera;
    applyCameraState(camera, state, this.options.getAspect());
    camera.updateMatrixWorld();
    const panScale = Math.max(state.distance, 0.001) * 0.0015;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const target = new THREE.Vector3(state.target.x, state.target.y, state.target.z)
      .addScaledVector(right, -dx * panScale)
      .addScaledVector(up, dy * panScale);
    this.commit({ ...state, target: { x: target.x, y: target.y, z: target.z } });
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    if (this.options.canvas.hasPointerCapture(event.pointerId)) {
      this.options.canvas.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.button = -1;
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.options.isLocked()) return;
    event.preventDefault();
    const state = this.options.getState();
    this.commit({
      ...state,
      distance: THREE.MathUtils.clamp(state.distance * Math.exp(event.deltaY * 0.001), 0.001, 1_000_000)
    });
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.options.isLocked() || event.key.toLowerCase() !== "r") return;
    event.preventDefault();
    this.options.onReset();
  };

  private commit(state: SourceState["camera"]): void {
    this.options.onChange(state);
  }
}
