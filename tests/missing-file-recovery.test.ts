import { describe, expect, it } from "vitest";
import { isMissingFileRecovery } from "../src/missing-file-recovery";
import { DEFAULT_STATE, type SourceState } from "../src/protocol";

const lockedState = (): SourceState => ({
  ...structuredClone(DEFAULT_STATE),
  safety: { liveLock: true }
});

const relocatedState = (previous: SourceState): SourceState => ({
  ...structuredClone(previous),
  asset: {
    ...previous.asset,
    localUrl: "http://127.0.0.1:1234/asset/relocated.ply?token=test",
    fileType: "ply",
    frameOnLoad: false
  }
});

describe("native missing-file recovery while live-locked", () => {
  it("permits an explicitly authorized asset relocation without changing the saved view", () => {
    const previous = lockedState();
    expect(isMissingFileRecovery(previous, relocatedState(previous), "recoverMissingFile")).toBe(true);
  });

  it.each([undefined, "applyPreset", "changeAsset"])("does not treat %s as recovery authorization", (mutation) => {
    const previous = lockedState();
    expect(isMissingFileRecovery(previous, relocatedState(previous), mutation)).toBe(false);
  });

  it.each([
    ["camera", (state: SourceState) => { state.camera.distance = 99; }],
    ["exposure", (state: SourceState) => { state.display.exposure = 2; }],
    ["scene position", (state: SourceState) => { state.scene.position.x = 10; }],
    ["render scale", (state: SourceState) => { state.output.renderScale = 1; }],
    ["quality", (state: SourceState) => { state.quality.lodSplatCount = 500_000; }],
    ["lock state", (state: SourceState) => { state.safety.liveLock = false; }],
    ["coordinate convention", (state: SourceState) => { state.asset.coordinatePreset = "opengl-y-up"; }],
    ["automatic reframing", (state: SourceState) => { state.asset.frameOnLoad = true; }]
  ] as const)("does not authorize a simultaneous change to %s", (_name, mutate) => {
    const previous = lockedState();
    const next = relocatedState(previous);
    mutate(next);
    expect(isMissingFileRecovery(previous, next, "recoverMissingFile")).toBe(false);
  });

  it("supports the Missing Files dialog's explicit clear-file action", () => {
    const previous = relocatedState(lockedState());
    const next = { ...structuredClone(previous), asset: { ...previous.asset, localUrl: "", fileType: "auto" } };
    expect(isMissingFileRecovery(previous, next, "recoverMissingFile")).toBe(true);
  });
});
