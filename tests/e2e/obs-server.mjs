// SPDX-License-Identifier: GPL-2.0-or-later
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CdpClient } from "./cdp-client.mjs";
import { ObsWebSocketClient } from "./obs-websocket-client.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "output/obs-server");
const client = new ObsWebSocketClient({ url: process.env.OBS_WEBSOCKET_URL ?? "ws://127.0.0.1:4456", password: process.env.OBS_WEBSOCKET_PASSWORD });
const report = { startedAt: new Date().toISOString(), checks: [], failures: [] };
let cdp, originalUrl;
await mkdir(output, { recursive: true });
try {
  await client.connect();
  const { inputs } = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
  const source = inputs.find(i => !i.inputName.startsWith("obs-3dgs-"));
  assert(source, "A loaded source is required");
  const settings = (await client.request("GetInputSettings", { inputUuid: source.inputUuid })).inputSettings;
  const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const target = targets.find(t => t.type === "page" && new URL(t.url).searchParams.get("sourceId") === source.inputUuid);
  assert(target, "Matching CEF page is required");
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  // Keep the selected source's bearer capability in memory; never write it to logs/reports.
  const runtime = new URL(target.url);
  const token = runtime.searchParams.get("token");
  originalUrl = target.url;
  const debugUrl = new URL(originalUrl);
  debugUrl.searchParams.set("debug", "1");
  await cdp.request("Page.navigate", { url: debugUrl.href });
  let asset;
  for (let attempt = 0; attempt < 120; attempt++) {
    await delay(500);
    try { asset = await cdp.evaluate("window.obs3dgs?.snapshot()?.activeUrl"); } catch { /* Navigation. */ }
    if (asset) break;
  }
  assert(asset, "CEF did not finish mapping the selected asset");
  const selectedUrl = new URL(asset);
  const localBytes = await readFile(settings.asset_path);
  const check = async (name, run) => {
    try { await run(); report.checks.push({ name, passed: true }); }
    catch (error) { report.checks.push({ name, passed: false }); report.failures.push(`${name}: ${error.message}`); }
  };
  await check("authenticated HEAD", async () => {
    const response = await fetch(selectedUrl, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(Number(response.headers.get("content-length")), localBytes.length);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  });
  await check("exact byte range", async () => {
    const response = await fetch(selectedUrl, { headers: { Range: "bytes=17-128" } });
    assert.equal(response.status, 206);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), localBytes.subarray(17, 129));
  });
  await check("suffix range", async () => {
    const response = await fetch(selectedUrl, { headers: { Range: "bytes=-64" } });
    assert.equal(response.status, 206);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), localBytes.subarray(-64));
  });
  for (const range of ["bytes=0-1,4-5", `bytes=${localBytes.length}-`, "bytes=7-3"]) {
    await check(`reject range ${range}`, async () => assert.equal((await fetch(selectedUrl, { headers: { Range: range } })).status, 416));
  }
  for (const invalidToken of ["", "invalid-token"]) {
    await check(invalidToken ? "reject wrong token" : "reject absent token", async () => {
      const url = new URL(selectedUrl);
      url.search = invalidToken ? `token=${invalidToken}` : "";
      assert.equal((await fetch(url)).status, 401);
    });
  }
  await check("asset directory is not served", async () => {
    const url = new URL(".", selectedUrl);
    url.searchParams.set("token", token);
    assert.equal((await fetch(url)).status, 404);
  });
  await check("web traversal cannot reach plugin data", async () => {
    assert.equal((await fetch(new URL("/web/%2e%2e%2flocale/en-US.ini", runtime))).status, 404);
  });
  const eventUrl = new URL(`/api/v1/sources/${source.inputUuid}/events`, runtime);
  const event = { protocolVersion: 1, sourceId: source.inputUuid, revision: 1, type: "metrics", payload: {} };
  for (const [name, body] of [["invalid JSON", "{"], ["wrong protocol type", JSON.stringify({ ...event, protocolVersion: "1" })],
    ["wrong source type", JSON.stringify({ ...event, sourceId: [] })], ["negative revision", JSON.stringify({ ...event, revision: -1 })]]) {
    await check(name, async () => assert.equal((await fetch(eventUrl, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body })).status, 400));
  }
  await check("oversized event", async () => assert.equal((await fetch(eventUrl, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "x".repeat(65537)
  })).status, 413));
  await check("host remains responsive", async () => assert((await client.request("GetStats")).activeFps > 0));
} catch (error) { report.failures.push(error.message); }
finally {
  if (cdp && originalUrl) await cdp.request("Page.navigate", { url: originalUrl }).catch(() => {});
  cdp?.close(); client.close();
  report.completedAt = new Date().toISOString();
  report.passed = report.failures.length === 0;
  await writeFile(path.join(output, "server-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
if (!report.passed) process.exitCode = 1;
