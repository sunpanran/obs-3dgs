// SPDX-License-Identifier: GPL-2.0-or-later
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CdpClient } from "./cdp-client.mjs";
import { ObsWebSocketClient } from "./obs-websocket-client.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "output/obs-context-recovery");
assert(process.env.OBS_WEBSOCKET_PASSWORD && process.env.OBS_LOG_PATH, "Set OBS_WEBSOCKET_PASSWORD and OBS_LOG_PATH");
const client = new ObsWebSocketClient({ url: process.env.OBS_WEBSOCKET_URL ?? "ws://127.0.0.1:4456", password: process.env.OBS_WEBSOCKET_PASSWORD });
const report = { startedAt: new Date().toISOString(), checks: {}, failures: [] };
let cdp, inputUuid;
const waitFor = async (predicate, label) => {
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    try { if (await predicate()) return; } catch { /* A navigation can replace the execution context. */ }
    await delay(250);
  }
  throw new Error(`Timed out: ${label}`);
};
const capture = async name => {
  const { imageData } = await client.request("GetSourceScreenshot", { sourceUuid: inputUuid, imageFormat: "png", imageWidth: 640, imageHeight: 360 });
  const bytes = Buffer.from(imageData.split(",")[1], "base64");
  await writeFile(path.join(output, name), bytes);
  return createHash("sha256").update(bytes).digest("hex");
};
const loseContext = () => cdp.evaluate(`(() => {
  window.testContextLoss = document.getElementById('viewport').getContext('webgl2').getExtension('WEBGL_lose_context');
  if (!window.testContextLoss) throw new Error('WEBGL_lose_context unavailable');
  window.testContextLoss.loseContext();
})()`);
await mkdir(output, { recursive: true });
try {
  await client.connect();
  assert(!(await client.request("GetRecordStatus")).outputActive && !(await client.request("GetStreamStatus")).outputActive, "Use an idle isolated OBS instance");
  const { currentProgramSceneName: sceneName } = await client.request("GetCurrentProgramScene");
  const asset = path.join(root, "public/samples/format-grid.ply");
  ({ inputUuid } = await client.request("CreateInput", { sceneName, inputKind: "obs_3dgs_source",
    inputName: `obs-3dgs-context-${Date.now()}`, sceneItemEnabled: true,
    inputSettings: { asset_path: asset, follow_canvas: false, output_width: 640, output_height: 360 } }));
  report.source = { uuid: inputUuid, fixture: "format-grid.ply", width: 640, height: 360,
    sha256: createHash("sha256").update(await readFile(asset)).digest("hex") };
  await waitFor(async () => (await readFile(process.env.OBS_LOG_PATH, "utf8")).includes(`Scene ready for source ${inputUuid} (`), "initial scene ready");
  const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const target = targets.find(t => t.type === "page" && new URL(t.url).searchParams.get("sourceId") === inputUuid);
  assert(target, "The dedicated CEF page is missing");
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await waitFor(() => cdp.evaluate("document.getElementById('status').hidden"), "initial status hidden");
  await delay(1500);
  report.settings = (await client.request("GetInputSettings", { inputUuid })).inputSettings;
  delete report.settings.asset_path;
  report.beforeSha256 = await capture("before.png");
  const firstOrigin = await cdp.evaluate("performance.timeOrigin");
  await loseContext();
  await waitFor(() => cdp.evaluate("document.getElementById('viewport').getContext('webgl2').isContextLost() && !document.getElementById('status').hidden"), "loss recovery overlay");
  report.checks.lossOverlay = true;
  await capture("lost.png");
  await cdp.evaluate("window.testContextLoss.restoreContext()");
  await waitFor(() => cdp.evaluate(`performance.timeOrigin !== ${firstOrigin} && document.getElementById('status').hidden`), "automatic reload and restored scene");
  await delay(1500);
  assert.equal(await cdp.evaluate("sessionStorage.getItem('obs3dgs-context-restores')"), "1");
  report.restoredSha256 = await capture("restored.png");
  assert.equal(report.restoredSha256, report.beforeSha256, "Restoration changed rendered pixels");
  report.checks.firstLossRestored = true;
  const secondOrigin = await cdp.evaluate("performance.timeOrigin");
  await loseContext();
  await waitFor(() => cdp.evaluate("document.getElementById('viewport').getContext('webgl2').isContextLost()"), "second context loss");
  await cdp.evaluate("window.testContextLoss.restoreContext()");
  await waitFor(async () => (await readFile(process.env.OBS_LOG_PATH, "utf8")).includes(`Runtime error for source ${inputUuid} (webgl-context-restore-failed)`), "retry limit error");
  await delay(2000);
  assert.equal(await cdp.evaluate("performance.timeOrigin"), secondOrigin, "A second automatic reload occurred");
  assert.equal(await cdp.evaluate("document.getElementById('status').hidden"), false);
  report.checks.retryLimitStableError = true;
  await capture("retry-limit.png");
  assert((await client.request("GetStats")).activeFps > 0, "OBS must remain responsive");
  report.checks.hostResponsive = true;
} catch (error) { report.failures.push(error.message); }
finally {
  cdp?.close();
  if (inputUuid) {
    try { await client.request("RemoveInput", { inputUuid }); }
    catch (error) { report.failures.push(`Cleanup: ${error.message}`); }
  }
  client.close();
  report.passed = report.failures.length === 0;
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, "context-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failures: report.failures }));
}
if (!report.passed) process.exitCode = 1;
