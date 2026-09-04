// SPDX-License-Identifier: GPL-2.0-or-later

export class CdpClient {
  constructor(url) {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))
      throw new Error("CEF debugging must use a loopback WebSocket");
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CEF connection timed out")), 10_000);
      this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CEF connection failed")); }, { once: true });
      this.socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(String(data));
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(`CEF ${request.method}: ${message.error.message}`));
        else request.resolve(message.result);
      });
      this.socket.addEventListener("close", () => {
        for (const request of this.pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error("CEF closed during a request"));
        }
        this.pending.clear();
      });
    });
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CEF ${method} timed out`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.request("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error("CEF evaluation failed; inspect the test expression");
    return result.result.value;
  }

  close() { this.socket?.close(); }
}
