// SPDX-License-Identifier: GPL-2.0-or-later

import { PROTOCOL_VERSION, type RuntimeEvent, type RuntimeEventType } from "./protocol";

interface BridgeOptions {
  sourceId: string;
  token: string;
}

const MAX_EVENT_BYTES = 64 * 1024;

export class RuntimeBridge {
  private readonly sourceId: string;
  private readonly token: string;
  private revision = 0;
  private readonly lastSent = new Map<RuntimeEventType, number>();
  private readonly pending = new Map<RuntimeEventType, {
    payload: Record<string, unknown>;
    maximumRate: number;
  }>();
  private readonly pendingTimers = new Map<RuntimeEventType, ReturnType<typeof setTimeout>>();

  constructor({ sourceId, token }: BridgeOptions) {
    this.sourceId = sourceId;
    this.token = token;
  }

  async send(type: RuntimeEventType, payload: Record<string, unknown>, maximumRate = Infinity): Promise<void> {
    if (!this.sourceId || !this.token) return;

    const now = performance.now();
    const previous = this.lastSent.get(type) ?? -Infinity;
    const minimumInterval = Number.isFinite(maximumRate) && maximumRate > 0 ? 1_000 / maximumRate : 0;
    if (now - previous < minimumInterval) {
      this.pending.set(type, { payload, maximumRate });
      if (!this.pendingTimers.has(type)) {
        const timer = setTimeout(() => {
          this.pendingTimers.delete(type);
          const pending = this.pending.get(type);
          if (!pending) return;
          this.pending.delete(type);
          void this.send(type, pending.payload, pending.maximumRate);
        }, Math.max(0, minimumInterval - (now - previous)));
        this.pendingTimers.set(type, timer);
      }
      return;
    }

    const pendingTimer = this.pendingTimers.get(type);
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      this.pendingTimers.delete(type);
    }
    this.pending.delete(type);

    const event: RuntimeEvent = {
      protocolVersion: PROTOCOL_VERSION,
      sourceId: this.sourceId,
      revision: ++this.revision,
      type,
      payload
    };
    const body = JSON.stringify(event);
    if (new TextEncoder().encode(body).byteLength > MAX_EVENT_BYTES) return;

    this.lastSent.set(type, now);
    try {
      await fetch(`/api/v1/sources/${encodeURIComponent(this.sourceId)}/events`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body,
        cache: "no-store",
        keepalive: false
      });
    } catch {
      // A source may be closing while an event is in flight. Runtime rendering must
      // never depend on the diagnostics channel being available.
    }
  }
}
