// SPDX-License-Identifier: GPL-2.0-or-later

import { createHash, randomUUID } from "node:crypto";

const sha256Base64 = (value) => createHash("sha256").update(value, "utf8").digest("base64");

const authenticationResponse = (password, salt, challenge) => {
  const secret = sha256Base64(`${password}${salt}`);
  return sha256Base64(`${secret}${challenge}`);
};

export class ObsWebSocketClient {
  constructor({ url, password, timeoutMs = 10_000 }) {
    this.url = url;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
  }

  async connect() {
    if (this.socket)
      return;
    this.socket = new WebSocket(this.url, "obswebsocket.json");
    const identified = Promise.withResolvers();
    this.identified = identified;

    this.socket.addEventListener("message", (event) => this.handleMessage(event));
    this.socket.addEventListener("error", () => identified.reject(new Error(`Unable to connect to ${this.url}`)));
    this.socket.addEventListener("close", (event) => {
      const error = new Error(`OBS WebSocket closed (${event.code}): ${event.reason || "no reason"}`);
      identified.reject(error);
      for (const request of this.pending.values())
        request.reject(error);
      this.pending.clear();
    });

    await this.withTimeout(identified.promise, "OBS WebSocket identification");
  }

  async request(requestType, requestData = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      throw new Error("OBS WebSocket is not connected");
    const requestId = randomUUID();
    const response = Promise.withResolvers();
    this.pending.set(requestId, response);
    this.socket.send(JSON.stringify({
      op: 6,
      d: { requestType, requestId, requestData }
    }));
    return this.withTimeout(response.promise, requestType).finally(() => this.pending.delete(requestId));
  }

  close() {
    this.socket?.close(1000, "integration test complete");
    this.socket = undefined;
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.op === 0) {
      const authentication = message.d?.authentication;
      const identify = { rpcVersion: 1, eventSubscriptions: 0 };
      if (authentication) {
        if (!this.password)
          throw new Error("OBS WebSocket requires a password");
        identify.authentication = authenticationResponse(
          this.password,
          authentication.salt,
          authentication.challenge
        );
      }
      this.socket.send(JSON.stringify({ op: 1, d: identify }));
      return;
    }
    if (message.op === 2) {
      this.identified.resolve(message.d);
      return;
    }
    if (message.op !== 7)
      return;

    const request = this.pending.get(message.d?.requestId);
    if (!request)
      return;
    const status = message.d.requestStatus;
    if (status?.result) {
      request.resolve(message.d.responseData ?? {});
    } else {
      request.reject(new Error(
        `${message.d.requestType} failed (${status?.code ?? "unknown"}): ${status?.comment ?? "no comment"}`
      ));
    }
  }

  async withTimeout(promise, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
