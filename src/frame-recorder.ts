// SPDX-License-Identifier: GPL-2.0-or-later

// Opt-in diagnostics. Recording allocates once; the render callback only writes numbers.
export class FrameRecorder {
  private timestamps: Float64Array | null = null;
  private submissions: Float64Array | null = null;
  private count = 0;
  private overflow = false;

  start(capacity = 120_000): void {
    if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 240_000) {
      throw new RangeError("Frame capacity must be between 2 and 240000");
    }
    this.timestamps = new Float64Array(capacity);
    this.submissions = new Float64Array(capacity);
    this.count = 0;
    this.overflow = false;
  }

  record(timestamp: number, submissionMs: number): void {
    if (!this.timestamps || !this.submissions) return;
    if (this.count === this.timestamps.length) {
      this.overflow = true;
      return;
    }
    this.timestamps[this.count] = timestamp;
    this.submissions[this.count] = submissionMs;
    this.count++;
  }

  stop(): { timestampsMs: number[]; cpuSubmissionMs: number[]; overflow: boolean } {
    const result = {
      timestampsMs: Array.from(this.timestamps?.subarray(0, this.count) ?? []),
      cpuSubmissionMs: Array.from(this.submissions?.subarray(0, this.count) ?? []),
      overflow: this.overflow
    };
    this.timestamps = null;
    this.submissions = null;
    this.count = 0;
    this.overflow = false;
    return result;
  }
}
