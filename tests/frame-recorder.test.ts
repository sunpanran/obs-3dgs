// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from "vitest";
import { FrameRecorder } from "../src/frame-recorder";

describe("opt-in frame capture", () => {
  it("records raw frame timestamps separately from CPU submission durations", () => {
    const recorder = new FrameRecorder();
    recorder.record(1, 1);
    recorder.start(3);
    recorder.record(100, 2);
    recorder.record(116.7, 3);
    recorder.record(150, 4);
    expect(recorder.stop()).toEqual({
      timestampsMs: [100, 116.7, 150], cpuSubmissionMs: [2, 3, 4], overflow: false
    });
    recorder.record(200, 5);
    expect(recorder.stop().timestampsMs).toEqual([]);
  });

  it("reports overflow instead of silently claiming complete evidence", () => {
    const recorder = new FrameRecorder();
    recorder.start(2);
    for (let frame = 0; frame < 100; frame++) recorder.record(frame, 1);
    expect(recorder.stop()).toEqual({ timestampsMs: [0, 1], cpuSubmissionMs: [1, 1], overflow: true });
    recorder.start(2);
    expect(recorder.stop().overflow).toBe(false);
  });

  it("rejects unbounded allocations", () => {
    const recorder = new FrameRecorder();
    for (const capacity of [0, 1, 2.5, Infinity, NaN, 240_001]) {
      expect(() => recorder.start(capacity)).toThrow(RangeError);
    }
  });
});
