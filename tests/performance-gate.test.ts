// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from "vitest";
import { evaluatePerformanceGate } from "./e2e/performance-gate";

const evidence = {
  device: "ANGLE NVIDIA GeForce RTX 4090", durationSeconds: 1800, recordingMs: 1801000, recordingBytes: 200000000,
  averageFps: 60, frameP95Ms: 16.7, frameCount: 108000, frameSpanSeconds: 1799.99, renderSkipRatio: 0,
  overflow: false, idlePassed: true, width: 1920, height: 1080, outputWidth: 1920, outputHeight: 1080,
  outputFps: 60, rasterWidth: 1440, rasterHeight: 810,
  settings: { render_scale: 0.75, lod_splat_count: 1000000, max_sh: 2, lod_enabled: true, target_fps: 60 }
};

it("requires actual 1080p rendering, a full recording and all raw-frame evidence", () => {
  expect(evaluatePerformanceGate("rtx4090", evidence)).toEqual([]);
  for (const update of [{ rasterWidth: 960 }, { recordingMs: 10000 }, { frameSpanSeconds: 10 },
    { frameCount: 10 }, { overflow: true }, { frameP95Ms: 25 }, { renderSkipRatio: 0.005 }, { device: "RTX 4090 Laptop GPU" }]) {
    expect(evaluatePerformanceGate("rtx4090", { ...evidence, ...update }).length).toBeGreaterThan(0);
  }
});

it("accepts the M1 numeric Balanced profile even when its 30 FPS setting is labelled Custom", () => {
  const m1 = { ...evidence, device: "ANGLE Metal Renderer: Apple M1", durationSeconds: 60, recordingMs: 61000,
    frameCount: 1800, frameSpanSeconds: 59.99, averageFps: 30, frameP95Ms: 33.4, outputFps: 30,
    settings: { ...evidence.settings, target_fps: 30, quality_preset: "custom" } };
  expect(evaluatePerformanceGate("apple-m1", m1)).toEqual([]);
  for (const device of ["Apple M2", "Apple M1 Pro", "Apple M1 Max", "Apple Paravirtual device", "SwiftShader"]) {
    expect(evaluatePerformanceGate("apple-m1", { ...m1, device }).length).toBeGreaterThan(0);
  }
  expect(evaluatePerformanceGate("apple-m1", { ...m1, settings: { ...m1.settings, lod_splat_count: 500000 } }).length).toBeGreaterThan(0);
});
