// SPDX-License-Identifier: GPL-2.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeBridge } from "../src/bridge";

describe("runtime bridge throttling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends the latest camera pose after the rate-limit interval", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const bridge = new RuntimeBridge({ sourceId: "source-1", token: "token" });

    await bridge.send("cameraChanged", { yawDeg: 10 }, 10);
    await bridge.send("cameraChanged", { yawDeg: 20 }, 10);
    await bridge.send("cameraChanged", { yawDeg: 30 }, 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(secondRequest.body)) as { payload: { yawDeg: number } };
    expect(body.payload.yawDeg).toBe(30);
  });
});
