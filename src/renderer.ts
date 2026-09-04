// SPDX-License-Identifier: GPL-2.0-or-later

import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import * as THREE from "three";
import { resolveAppearanceExposure } from "./appearance";
import { applyCameraState, frameCameraForSphere, frameDistanceForSphere, fovFromFocalLength } from "./camera";
import type { RuntimeBridge } from "./bridge";
import { sanitizeErrorText } from "./error-text";
import { FrameRecorder } from "./frame-recorder";
import { I18n } from "./i18n";
import { withoutStaleCameraEcho } from "./interaction-state";
import type { BridgeMessage, CoordinatePreset, SourceState } from "./protocol";
import { DEFAULT_STATE, RevisionGate } from "./protocol";
import { PointerCamera } from "./pointer-camera";
import { installSparkToneMapping, updateSparkToneMapping } from "./spark-tone-mapping";
import { isActionAllowed, normalizeState } from "./state";

interface RuntimeElements {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  statusTitle: HTMLElement;
  statusDetail: HTMLElement;
  progress: HTMLElement;
  debugPanel: HTMLElement;
  debugTitle: HTMLElement;
  debugReady: HTMLElement;
  debugValues: HTMLElement;
}

interface RuntimeOptions {
  elements: RuntimeElements;
  bridge: RuntimeBridge;
  debug: boolean;
}

type RuntimeCommand = "frameAll" | "resetCamera" | "reload" | "showError";

interface RuntimeMetrics {
  fps: number;
  frameP95Ms: number;
  activeSplats: number;
  width: number;
  height: number;
  focalLengthMm: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
}

const DEG_TO_RAD = Math.PI / 180;

const coordinateRotation = (preset: CoordinatePreset): THREE.Euler => {
  switch (preset) {
    case "z-up":
      return new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ");
    case "opengl-y-up":
      return new THREE.Euler(0, 0, 0, "XYZ");
    case "auto":
    case "opencv-x-180":
      return new THREE.Euler(Math.PI, 0, 0, "XYZ");
  }
};

export class Obs3dgsRuntime {
  private readonly elements: RuntimeElements;
  private readonly bridge: RuntimeBridge;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly spark: SparkRenderer;
  private readonly scene = new THREE.Scene();
  private readonly sceneRoot = new THREE.Group();
  private readonly coordinateRoot = new THREE.Group();
  private readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 10_000);
  private readonly i18n = new I18n(DEFAULT_STATE.locale);
  private readonly pointerCamera: PointerCamera;
  private state = normalizeState(DEFAULT_STATE);
  private initialTarget = new THREE.Vector3();
  private sceneRadius = 1;
  private activeMesh: SplatMesh | null = null;
  private stagingMesh: SplatMesh | null = null;
  private cachedLocalBounds: THREE.Box3 | null = null;
  private loadGeneration = 0;
  private readonly revisionGate = new RevisionGate();
  private activeUrl = "";
  private visible = true;
  private rafId = 0;
  private renderUntil = 0;
  private lastFrameAt = 0;
  private frameTimes: number[] = [];
  private metricsStartedAt = performance.now();
  private latestMetrics: RuntimeMetrics | null = null;
  private localCameraAuthorityUntil = 0;
  private readonly frameRecorder = new FrameRecorder();

  constructor({ elements, bridge, debug }: RuntimeOptions) {
    this.elements = elements;
    this.bridge = bridge;
    this.renderer = new THREE.WebGLRenderer({
      canvas: elements.canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.spark = new SparkRenderer({
      renderer: this.renderer,
      premultipliedAlpha: true,
      encodeLinear: true,
      enable2DGS: false,
      enableLod: true,
      lodSplatCount: this.state.quality.lodSplatCount,
      onDirty: () => this.invalidate()
    });
    installSparkToneMapping(this.spark.material);
    this.scene.add(this.spark);
    this.scene.add(this.sceneRoot);
    this.sceneRoot.add(this.coordinateRoot);
    this.elements.debugPanel.hidden = !debug;
    this.pointerCamera = new PointerCamera({
      canvas: elements.canvas,
      camera: this.camera,
      getState: () => this.state.camera,
      getAspect: () => this.state.output.width / this.state.output.height,
      isLocked: () => this.state.safety.liveLock,
      onChange: (camera) => this.setInteractiveCamera(camera),
      onReset: () => this.resetCamera()
    });
    this.applyStateToRenderer();
    this.showEmptyState();
    void this.bridge.send("ready", {
      runtime: true,
      sceneLoaded: false,
      webgl2: this.renderer.capabilities.isWebGL2,
      device: this.graphicsDevice()
    });
  }

  dispose(): void {
    if (this.rafId > 0) cancelAnimationFrame(this.rafId);
    this.pointerCamera.dispose();
    this.stagingMesh?.dispose();
    this.activeMesh?.dispose();
    this.spark.dispose();
    this.renderer.dispose();
  }

  debugSnapshot(): Record<string, unknown> {
    let localBounds: Record<string, unknown> | null = null;
    if (this.activeMesh) {
      const bounds = this.cachedLocalBounds;
      if (bounds) {
      localBounds = {
        min: bounds.min.toArray(),
        max: bounds.max.toArray()
      };
      }
    }
    const splats = this.activeMesh ? this.meshSplatSource(this.activeMesh) : null;
    return {
      camera: this.state.camera,
      activeUrl: this.activeUrl,
      meshSplats: splats?.getNumSplats() ?? null,
      meshType: splats?.constructor.name ?? null,
      localBounds,
      renderScheduled: this.rafId !== 0,
      renderCount: this.renderer.info.render.frame,
      lastSortTime: this.spark.lastSortTime,
      sorting: this.spark.sorting,
      sortDirty: this.spark.sortDirty,
      metrics: this.latestMetrics
    };
  }

  startFrameRecording(): void {
    this.frameRecorder.start();
  }

  stopFrameRecording(): ReturnType<FrameRecorder["stop"]> {
    return this.frameRecorder.stop();
  }

  acceptMessage(message: BridgeMessage): void {
    if (!this.revisionGate.accept(message.revision)) return;

    if (message.type === "visibility") {
      const visible = (message.payload as Record<string, unknown>).visible;
      if (typeof visible === "boolean") {
        this.visible = visible;
        if (visible) this.invalidate(500);
      }
      return;
    }

    if (message.type === "command") {
      const commandPayload = message.payload as Record<string, unknown>;
      const command = commandPayload.command;
      if (typeof command === "string") this.runCommand(command as RuntimeCommand, commandPayload);
      return;
    }

    const allowedMutation = (message.payload as Record<string, unknown>)._allowedMutation;
    const previous = this.state;
    const update = withoutStaleCameraEcho(
      message.payload as Partial<SourceState>,
      performance.now() < this.localCameraAuthorityUntil,
      allowedMutation
    );
    const next = normalizeState(update, previous);
    const presetBypass = allowedMutation === "applyPreset" && this.onlyCameraChanged(previous, next);
    if (previous.safety.liveLock && next.safety.liveLock && this.hasLockedChanges(previous, next) && !presetBypass) {
      this.showTransientStatus(this.i18n.t("locked"));
      return;
    }

    this.state = next;
    this.i18n.setLocale(next.locale);
    this.applyStateToRenderer(previous);
    if (next.asset.localUrl !== previous.asset.localUrl) {
      void this.loadAsset(next.asset.localUrl, !next.asset.frameOnLoad);
    } else if (next.asset.localUrl && next.quality.lodEnabled !== previous.quality.lodEnabled) {
      void this.loadAsset(next.asset.localUrl, true);
    }
  }

  loadInitialAsset(url: string): void {
    this.state = normalizeState({ asset: { ...this.state.asset, localUrl: url, frameOnLoad: true } }, this.state);
    void this.loadAsset(url, false);
  }

  handleContextLost(): void {
    this.showStatus(this.i18n.t("webglLost"), this.i18n.t("webglRestoring"), 0);
    void this.bridge.send("error", { code: "webgl-context-lost", recoverable: true });
  }

  handleContextRestored(): void {
    const restores = Number(sessionStorage.getItem("obs3dgs-context-restores") ?? "0");
    if (restores < 1) {
      sessionStorage.setItem("obs3dgs-context-restores", String(restores + 1));
      location.reload();
      return;
    }
    this.showStatus(this.i18n.t("failed"), this.i18n.t("webglLost"), 0);
    void this.bridge.send("error", { code: "webgl-context-restore-failed", recoverable: false });
  }

  private runCommand(command: RuntimeCommand, payload: Record<string, unknown>): void {
    if (command === "frameAll") {
      this.frameAll();
    } else if (command === "resetCamera") {
      this.resetCamera();
    } else if (command === "reload" && isActionAllowed("reloadAsset", this.state.safety.liveLock)) {
      void this.loadAsset(this.state.asset.localUrl, true);
    } else if (command === "showError") {
      // Native validation errors already remain visible in properties and the Dock.
      // Preserve the live output when the rejected replacement has a valid predecessor.
      if (this.activeMesh) this.elements.status.hidden = true;
      else this.showStatus(this.i18n.t("failed"), typeof payload.message === "string" ? payload.message.slice(0, 320) : "", 0);
    }
  }

  private hasLockedChanges(previous: SourceState, next: SourceState): boolean {
    return JSON.stringify({
      asset: previous.asset,
      output: previous.output,
      scene: previous.scene,
      camera: previous.camera,
      display: previous.display,
      quality: previous.quality
    }) !== JSON.stringify({
      asset: next.asset,
      output: next.output,
      scene: next.scene,
      camera: next.camera,
      display: next.display,
      quality: next.quality
    });
  }

  private onlyCameraChanged(previous: SourceState, next: SourceState): boolean {
    return JSON.stringify({
      asset: previous.asset,
      output: previous.output,
      scene: previous.scene,
      display: previous.display,
      quality: previous.quality,
      safety: previous.safety
    }) === JSON.stringify({
      asset: next.asset,
      output: next.output,
      scene: next.scene,
      display: next.display,
      quality: next.quality,
      safety: next.safety
    });
  }

  private async loadAsset(url: string, preserveCamera: boolean): Promise<void> {
    const generation = ++this.loadGeneration;
    this.stagingMesh?.dispose();
    this.stagingMesh = null;
    if (!url) {
      this.activeMesh?.removeFromParent();
      this.activeMesh?.dispose();
      this.activeMesh = null;
      this.cachedLocalBounds = null;
      this.activeUrl = "";
      this.showEmptyState();
      this.invalidate();
      return;
    }

    this.showStatus(this.i18n.t("loading"), this.i18n.t("preparing"), 0.02);
    void this.bridge.send("progress", { phase: "loading", progress: 0 });

    let staging: SplatMesh | null = null;
    try {
      staging = new SplatMesh({
        url,
        enableLod: this.state.quality.lodEnabled,
        lod: this.state.quality.lodEnabled,
        onProgress: (event) => {
          if (generation !== this.loadGeneration) return;
          const total = event.total > 0 ? event.total : 0;
          const progress = total > 0 ? THREE.MathUtils.clamp(event.loaded / total, 0, 1) : 0;
          this.showStatus(this.i18n.t("loading"), total > 0 ? `${Math.round(progress * 100)}%` : this.i18n.t("preparing"), progress);
          void this.bridge.send("progress", { phase: "loading", progress, loadedBytes: event.loaded, totalBytes: total }, 10);
        }
      });
      this.stagingMesh = staging;
      await staging.initialized;
      if (generation !== this.loadGeneration) {
        staging.dispose();
        return;
      }

      this.applyMeshAppearance(staging);
      staging.enableLod = this.state.quality.lodEnabled;
      staging.updateGenerator();

      const previous = this.activeMesh;
      this.coordinateRoot.add(staging);
      this.activeMesh = staging;
      this.cachedLocalBounds = this.meshBounds(staging);
      this.stagingMesh = null;
      this.activeUrl = url;
      this.spark.enableLod = this.state.quality.lodEnabled;
      this.applySceneTransform();
      previous?.removeFromParent();
      previous?.dispose();

      if (!preserveCamera) {
        this.frameAll(true);
      } else {
        applyCameraState(this.camera, this.state.camera, this.state.output.width / this.state.output.height);
      }
      const initialBounds = this.worldBounds();
      if (initialBounds && !initialBounds.isEmpty()) {
        const initialSphere = initialBounds.getBoundingSphere(new THREE.Sphere());
        this.initialTarget.copy(initialSphere.center);
        this.sceneRadius = Math.max(0.001, initialSphere.radius);
        if (preserveCamera) this.updateAutomaticClipping(this.sceneRadius);
      }
      this.elements.status.hidden = true;
      this.elements.debugReady.dataset.ready = "true";
      // Keep a short post-load window so the first sort/LOD warm-up is not the
      // only performance sample shown in the Dock. Rendering still stops once
      // this window and all Spark dirty callbacks settle.
      this.invalidate(2_500);
      void this.bridge.send("ready", {
        runtime: true,
        sceneLoaded: true,
        device: this.graphicsDevice(),
        splatCount: this.meshSplatSource(staging)?.getNumSplats() ?? null,
        bounds: this.serializedBounds(),
        camera: this.state.camera
      });
    } catch (error) {
      if (generation !== this.loadGeneration) {
        staging?.dispose();
        return;
      }
      staging?.dispose();
      this.stagingMesh = null;
      const detail = sanitizeErrorText(error);
      this.showStatus(this.i18n.t("failed"), detail, 0);
      void this.bridge.send("error", { code: "asset-load-failed", message: detail, recoverable: this.activeMesh !== null });
      this.invalidate();
    }
  }

  private applyStateToRenderer(previous?: SourceState): void {
    const { width, height, renderScale, background } = this.state.output;
    const renderWidth = Math.max(1, Math.round(width * renderScale));
    const renderHeight = Math.max(1, Math.round(height * renderScale));
    this.renderer.setSize(renderWidth, renderHeight, false);
    this.elements.canvas.style.width = "100%";
    this.elements.canvas.style.height = "100%";
    this.renderer.setClearColor(
      new THREE.Color(background.color.r, background.color.g, background.color.b),
      background.mode === "transparent" ? 0 : 1
    );
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    const appearance = resolveAppearanceExposure(
      this.state.scene.recolor,
      this.state.display.exposure
    );
    updateSparkToneMapping(this.spark.material, this.state.display.toneMapping, appearance.shaderExposure);
    const lodModeChanged = previous && previous.quality.lodEnabled !== this.state.quality.lodEnabled;
    if (!lodModeChanged) this.spark.enableLod = this.state.quality.lodEnabled;
    this.spark.lodSplatCount = this.state.quality.lodSplatCount;
    this.applySceneTransform();
    applyCameraState(this.camera, this.state.camera, width / height);
    if (this.activeMesh) {
      const bounds = this.worldBounds();
      if (bounds && !bounds.isEmpty()) this.updateAutomaticClipping(bounds.getBoundingSphere(new THREE.Sphere()).radius);
    }
    if (this.activeMesh) {
      this.applyMeshAppearance(this.activeMesh);
      if (!lodModeChanged) this.activeMesh.enableLod = this.state.quality.lodEnabled;
      if (!previous || previous.scene.maxSh !== this.state.scene.maxSh || (!lodModeChanged &&
          previous.quality.lodEnabled !== this.state.quality.lodEnabled)) {
        this.activeMesh.updateGenerator();
      }
    }
    this.invalidate(400);
  }

  private applySceneTransform(): void {
    const { position, rotationDeg, scale } = this.state.scene;
    this.sceneRoot.position.set(position.x, position.y, position.z);
    this.sceneRoot.rotation.set(rotationDeg.x * DEG_TO_RAD, rotationDeg.y * DEG_TO_RAD, rotationDeg.z * DEG_TO_RAD, "XYZ");
    this.sceneRoot.scale.setScalar(scale);
    this.coordinateRoot.rotation.copy(coordinateRotation(this.state.asset.coordinatePreset));
    this.sceneRoot.updateMatrixWorld(true);
  }

  private applyMeshAppearance(mesh: SplatMesh): void {
    const appearance = resolveAppearanceExposure(
      this.state.scene.recolor,
      this.state.display.exposure
    );
    mesh.opacity = this.state.scene.opacity;
    mesh.recolor.setRGB(appearance.meshRecolor.r, appearance.meshRecolor.g, appearance.meshRecolor.b);
    mesh.maxSh = this.state.scene.maxSh;
  }

  private frameAll(initialLoad = false): void {
    if (!this.activeMesh || (!initialLoad && !isActionAllowed("frameAll", this.state.safety.liveLock))) return;
    const bounds = this.worldBounds();
    if (!bounds || bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const aspect = this.state.output.width / this.state.output.height;
    const camera = frameCameraForSphere(this.state.camera, sphere.center, sphere.radius, aspect, 1.1);
    this.setCamera(camera, true);
    this.updateAutomaticClipping(sphere.radius);
  }

  private resetCamera(): void {
    if (!isActionAllowed("resetCamera", this.state.safety.liveLock)) {
      this.showTransientStatus(this.i18n.t("locked"));
      return;
    }
    const aspect = this.state.output.width / this.state.output.height;
    this.setCamera({
      ...this.state.camera,
      target: { x: this.initialTarget.x, y: this.initialTarget.y, z: this.initialTarget.z },
      yawDeg: 35,
      pitchDeg: -12,
      rollDeg: 0,
      focalLengthMm: 35,
      distance: frameDistanceForSphere(this.sceneRadius, 35, aspect, 1.1)
    }, true);
    this.updateAutomaticClipping(this.sceneRadius);
  }

  private setInteractiveCamera(camera: SourceState["camera"]): void {
    if (!isActionAllowed("interactiveCamera", this.state.safety.liveLock)) return;
    this.localCameraAuthorityUntil = performance.now() + 250;
    this.setCamera(camera, true);
  }

  private setCamera(camera: SourceState["camera"], report: boolean): void {
    this.state = normalizeState({ camera }, this.state);
    applyCameraState(this.camera, this.state.camera, this.state.output.width / this.state.output.height);
    const bounds = this.worldBounds();
    if (bounds && !bounds.isEmpty()) this.updateAutomaticClipping(bounds.getBoundingSphere(new THREE.Sphere()).radius);
    this.invalidate(500);
    if (report) void this.bridge.send("cameraChanged", { camera: this.state.camera }, 10);
  }

  private updateAutomaticClipping(radius: number): void {
    if (!this.state.camera.autoClipping) {
      this.camera.near = this.state.camera.nearClip;
      this.camera.far = this.state.camera.farClip;
      this.camera.updateProjectionMatrix();
      return;
    }
    const distance = this.state.camera.distance;
    this.camera.near = Math.max(0.001, (distance - radius * 2) * 0.25);
    this.camera.far = Math.max(this.camera.near + 1, distance + radius * 4);
    this.camera.updateProjectionMatrix();
  }

  private worldBounds(): THREE.Box3 | null {
    if (!this.activeMesh) return null;
    this.sceneRoot.updateMatrixWorld(true);
    const bounds = this.cachedLocalBounds?.clone() ?? null;
    if (!bounds) return null;
    return bounds.applyMatrix4(this.activeMesh.matrixWorld);
  }

  private meshSplatSource(mesh: SplatMesh) {
    return mesh.packedSplats?.lodSplats ?? mesh.extSplats?.lodSplats ?? mesh.splats;
  }

  private meshBounds(mesh: SplatMesh): THREE.Box3 | null {
    const source = this.meshSplatSource(mesh);
    if (!source || source.getNumSplats() === 0) return null;
    const minimum = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maximum = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    source.forEachSplat((_index, center) => {
      if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
        minimum.min(center);
        maximum.max(center);
      }
    });
    const values = [minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z];
    return values.every(Number.isFinite) ? new THREE.Box3(minimum, maximum) : null;
  }

  private serializedBounds(): Record<string, unknown> | null {
    const bounds = this.worldBounds();
    if (!bounds) return null;
    return {
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
    };
  }

  private invalidate(activeForMs = 120): void {
    const now = performance.now();
    if (this.rafId === 0 && this.lastFrameAt > 0 && now - this.lastFrameAt > 500) {
      this.lastFrameAt = 0;
      this.frameTimes = [];
      this.metricsStartedAt = now;
    }
    this.renderUntil = Math.max(this.renderUntil, now + activeForMs);
    if (this.visible && this.rafId === 0) this.rafId = requestAnimationFrame(this.renderFrame);
  }

  private renderFrame = (timestamp: number): void => {
    this.rafId = -1;
    if (!this.visible) {
      this.rafId = 0;
      return;
    }
    const minimumInterval = 1_000 / this.state.output.targetFps;
    if (this.state.output.targetFps < 55 && timestamp - this.lastFrameAt < minimumInterval - 1) {
      this.rafId = requestAnimationFrame(this.renderFrame);
      return;
    }

    if (this.lastFrameAt > 0) this.frameTimes.push(timestamp - this.lastFrameAt);
    if (this.frameTimes.length > 240) this.frameTimes.splice(0, this.frameTimes.length - 240);
    this.lastFrameAt = timestamp;
    const submissionStartedAt = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frameRecorder.record(timestamp, performance.now() - submissionStartedAt);
    this.updateMetrics(timestamp);
    this.rafId = timestamp < this.renderUntil ? requestAnimationFrame(this.renderFrame) : 0;
  };

  private updateMetrics(timestamp: number): void {
    if (timestamp - this.metricsStartedAt < 1_000 || this.frameTimes.length === 0) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const average = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95 = sorted[p95Index] ?? 0;
    const fps = average > 0 ? 1_000 / average : 0;
    const fov = fovFromFocalLength(this.state.camera.focalLengthMm, this.state.output.width / this.state.output.height);
    const metrics = {
      fps,
      frameP95Ms: p95,
      activeSplats: this.spark.activeSplats,
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      focalLengthMm: this.state.camera.focalLengthMm,
      horizontalFovDeg: fov.horizontalDeg,
      verticalFovDeg: fov.verticalDeg
    };
    this.latestMetrics = metrics;
    this.renderDebug(metrics);
    void this.bridge.send("metrics", metrics, 1);
    this.frameTimes = [];
    this.metricsStartedAt = timestamp;
  }

  private renderDebug(metrics: RuntimeMetrics): void {
    const rows: [string, string][] = [
      [this.i18n.t("renderer"), this.renderer.capabilities.isWebGL2 ? "WebGL2" : "Unavailable"],
      [this.i18n.t("scene"), this.activeUrl ? "Loaded" : "Empty"],
      [this.i18n.t("resolution"), `${metrics.width}×${metrics.height}`],
      [this.i18n.t("fps"), metrics.fps.toFixed(1)],
      [this.i18n.t("frameP95"), `${metrics.frameP95Ms.toFixed(1)} ms`],
      [this.i18n.t("activeSplats"), Math.round(metrics.activeSplats).toLocaleString("en-US")],
      [this.i18n.t("focalLength"), `${metrics.focalLengthMm.toFixed(0)} mm`],
      [this.i18n.t("cameraDistance"), this.state.camera.distance.toFixed(3)],
      [
        this.i18n.t("cameraTarget"),
        `${this.state.camera.target.x.toFixed(2)}, ${this.state.camera.target.y.toFixed(2)}, ${this.state.camera.target.z.toFixed(2)}`
      ],
      [this.i18n.t("horizontalFov"), `${metrics.horizontalFovDeg.toFixed(1)}°`],
      [this.i18n.t("verticalFov"), `${metrics.verticalFovDeg.toFixed(1)}°`]
    ];
    this.elements.debugTitle.textContent = this.i18n.t("diagnostics");
    this.elements.debugValues.replaceChildren(...rows.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      return [term, description];
    }));
  }

  private graphicsDevice(): Record<string, string> {
    const context = this.renderer.getContext();
    const extension = context.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    return {
      api: "WebGL2",
      vendor: extension ? String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : "Unavailable",
      renderer: extension ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER))
    };
  }

  private showEmptyState(): void {
    this.showStatus(this.i18n.t("chooseScene"), this.i18n.t("chooseSceneDetail"), 0);
    this.elements.debugReady.dataset.ready = "false";
  }

  private showTransientStatus(title: string): void {
    this.showStatus(title, "", 0);
    window.setTimeout(() => {
      if (this.activeMesh) this.elements.status.hidden = true;
    }, 1_200);
  }

  private showStatus(title: string, detail: string, progress: number): void {
    this.elements.status.hidden = false;
    this.elements.statusTitle.textContent = title;
    this.elements.statusDetail.textContent = detail;
    const bar = this.elements.progress.querySelector("i");
    if (bar instanceof HTMLElement) bar.style.width = `${Math.round(THREE.MathUtils.clamp(progress, 0, 1) * 100)}%`;
  }
}
