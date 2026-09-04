import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, parseBridgeMessage, PROTOCOL_VERSION, RevisionGate } from "../src/protocol";
import { normalizeState } from "../src/state";

describe("control protocol", () => {
  it("accepts a valid protocol v1 message", () => {
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      sourceId: "source-1",
      revision: 7,
      type: "state",
      payload: { camera: { focalLengthMm: 50 } }
    };
    expect(parseBridgeMessage(message)).toEqual(message);
  });

  it("rejects incompatible versions and invalid revisions", () => {
    expect(parseBridgeMessage({
      protocolVersion: 2,
      sourceId: "source-1",
      revision: 1,
      type: "state",
      payload: {}
    })).toBeNull();
    expect(parseBridgeMessage({
      protocolVersion: PROTOCOL_VERSION,
      sourceId: "source-1",
      revision: -1,
      type: "state",
      payload: {}
    })).toBeNull();
  });

  it("clamps unsafe numeric state", () => {
    const state = normalizeState({
      quality: { ...DEFAULT_STATE.quality, preset: "custom", lodSplatCount: 99_000_000 },
      output: { ...DEFAULT_STATE.output, renderScale: 10, targetFps: 200 },
      camera: { ...DEFAULT_STATE.camera, focalLengthMm: 500, filmGaugeMm: 36 }
    });
    expect(state.quality.lodSplatCount).toBe(4_000_000);
    expect(state.output.renderScale).toBe(1);
    expect(state.output.targetFps).toBe(60);
    expect(state.camera.focalLengthMm).toBe(200);
  });

  it("does not merge unknown or prototype-like state keys", () => {
    const state = normalizeState({
      unknown: "ignored",
      __proto__: { polluted: true }
    } as Partial<typeof DEFAULT_STATE>);
    expect("unknown" in state).toBe(false);
    expect("polluted" in state).toBe(false);
  });

  it("keeps valid structure and enums when a JSON payload has wrong runtime types", () => {
    const state = normalizeState({
      output: null,
      quality: { preset: "impossible", lodEnabled: "yes" },
      display: { toneMapping: "cinematic" }
    } as unknown as Partial<typeof DEFAULT_STATE>);
    expect(state.output).toEqual(DEFAULT_STATE.output);
    expect(state.quality.preset).toBe("balanced");
    expect(state.quality.lodEnabled).toBe(true);
    expect(state.display.toneMapping).toBe("none");
  });

  it("accepts only monotonically increasing revisions", () => {
    const gate = new RevisionGate();
    expect(gate.accept(0)).toBe(true);
    expect(gate.accept(0)).toBe(false);
    expect(gate.accept(4)).toBe(true);
    expect(gate.accept(3)).toBe(false);
    expect(gate.current()).toBe(4);
  });
});
