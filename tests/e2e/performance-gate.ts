// SPDX-License-Identifier: GPL-2.0-or-later
export type HardwareGate = "rtx4090" | "rtx4060" | "apple-m1";

interface GateEvidence {
  device: string;
  durationSeconds: number;
  recordingMs: number;
  recordingBytes: number;
  averageFps: number;
  frameP95Ms: number;
  frameCount: number;
  frameSpanSeconds: number;
  renderSkipRatio: number;
  overflow: boolean;
  idlePassed: boolean;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  rasterWidth: number;
  rasterHeight: number;
  settings: Record<string, unknown>;
}

export function evaluatePerformanceGate(gate: HardwareGate, evidence: GateEvidence): string[] {
  const apple = gate === "apple-m1";
  const targetFps = apple ? 30 : 60;
  const minimumSeconds = apple ? 60 : 1800;
  const devicePattern = apple ? /\bApple M1\b(?!\s+(?:Pro|Max|Ultra))/i : gate === "rtx4060" ? /\bRTX 4060\b(?!\s+Ti)/i : /\bRTX 4090\b/i;
  const failures: string[] = [];
  if (!devicePattern.test(evidence.device) || /software|swiftshader|llvmpipe|paravirtual|laptop|mobile/i.test(evidence.device))
    failures.push("The detected GPU does not match the requested hardware gate");
  if (evidence.durationSeconds < minimumSeconds || evidence.recordingMs < evidence.durationSeconds * 1000 || evidence.recordingBytes <= 0)
    failures.push("The recording duration or artifact is incomplete");
  if (evidence.width !== 1920 || evidence.height !== 1080 || evidence.outputWidth !== 1920 || evidence.outputHeight !== 1080 ||
      evidence.outputFps !== targetFps || evidence.rasterWidth !== 1440 || evidence.rasterHeight !== 810)
    failures.push("The canvas, recording and internal raster do not match the required 1080p profile");
  const settings = evidence.settings;
  if (settings.render_scale !== 0.75 || settings.lod_splat_count !== 1_000_000 || settings.max_sh !== 2 ||
      settings.lod_enabled !== true || settings.target_fps !== targetFps)
    failures.push("The numeric quality settings do not match Balanced");
  if (!Number.isFinite(evidence.averageFps) || evidence.averageFps < (apple ? 29 : 58) ||
      !Number.isFinite(evidence.frameP95Ms) || evidence.frameP95Ms > (apple ? 36 : 20) ||
      !Number.isFinite(evidence.renderSkipRatio) || evidence.renderSkipRatio >= 0.005)
    failures.push("The frame-rate, frame-time or dropped-frame threshold was exceeded");
  if (evidence.overflow || !evidence.idlePassed || evidence.frameSpanSeconds < evidence.durationSeconds - 1 ||
      evidence.frameCount < evidence.durationSeconds * targetFps * 0.9)
    failures.push("The frame capture or static-idle evidence is incomplete");
  return failures;
}
