// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CdpClient } from "./cdp-client.mjs";
import { ObsWebSocketClient } from "./obs-websocket-client.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, items) => {
  if (index % 2 === 0) {
    assert(item.startsWith("--") && items[index + 1] !== undefined, "Arguments require --name value pairs");
    pairs.push([item.slice(2), items[index + 1]]);
  }
  return pairs;
}, []));
const root = path.resolve(import.meta.dirname, "../..");
const output = path.resolve(root, args.output ?? "output/obs-renderer");
assert(!path.relative(root, output).startsWith("..") && !path.isAbsolute(path.relative(root, output)), "Output must be inside the workspace");
const duration = Number(args["duration-seconds"] ?? 30);
assert(Number.isInteger(duration) && duration >= 10 && duration <= 1800, "Duration must be 10..1800 seconds");
const endpoint = new URL(args.cef ?? "http://127.0.0.1:9223");
assert(endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1", "CEF discovery must use 127.0.0.1");
assert(process.env.OBS_WEBSOCKET_PASSWORD, "Set OBS_WEBSOCKET_PASSWORD");
const client = new ObsWebSocketClient({ url: args.url ?? "ws://127.0.0.1:4456", password: process.env.OBS_WEBSOCKET_PASSWORD });
const report = { startedAt: new Date().toISOString(), durationSeconds: duration, failures: [] };
const digest = (data) => createHash("sha256").update(data).digest("hex");
const summarize = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, average: values.reduce((sum, v) => sum + v, 0) / values.length,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], maximum: sorted.at(-1) };
};
let cdp, source, original, originalUrl, recording = false;
let originalRecordingDirectory;
const originalMutes = [];
const snapshot = () => cdp.evaluate(`(() => {
  const value = window.obs3dgs?.snapshot();
  if (!value) return null;
  const { activeUrl, ...safe } = value;
  return safe;
})()`);
const waitReady = async () => {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if (await cdp.evaluate("Boolean(window.obs3dgs?.snapshot()?.meshSplats > 0 && document.getElementById('status').hidden)")) return;
    } catch { /* Navigation may still be committing. */ }
    await delay(500);
  }
  throw new Error("CEF scene did not become ready");
};
const moveCamera = async (seconds) => {
  const start = performance.now();
  let nextUpdate = start;
  let updates = 0;
  while (performance.now() - start < seconds * 1000) {
    const elapsed = (performance.now() - start) / 1000;
    await client.request("SetInputSettings", { inputUuid: source.inputUuid,
      inputSettings: { camera_yaw: original.camera_yaw + Math.sin(elapsed * Math.PI / 5) * 10 }, overlay: true });
    updates++;
    nextUpdate += 50;
    await delay(Math.max(0, nextUpdate - performance.now()));
    if (updates % 600 === 0) console.log(`Renderer motion: ${Math.round(elapsed)} / ${seconds} seconds`);
  }
  return updates;
};

await mkdir(output, { recursive: true });
try {
  await client.connect();
  const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
  source = inputs.inputs.find((input) => !input.inputName.startsWith("obs-3dgs-"));
  assert(source, "A loaded test source is required");
  original = (await client.request("GetInputSettings", { inputUuid: source.inputUuid })).inputSettings;
  assert(!original.live_lock, "Unlock the isolated test source before benchmarking");
  const targets = await (await fetch(new URL("/json/list", endpoint))).json();
  const target = targets.find((target) => target.type === "page" &&
    new URL(target.url).searchParams.get("sourceId") === source.inputUuid);
  assert(target, "The matching private Browser Source is not exposed by CEF");
  originalUrl = target.url;
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  const debugUrl = new URL(originalUrl);
  debugUrl.searchParams.set("debug", "1");
  await cdp.request("Page.navigate", { url: debugUrl.href });
  await waitReady();
  await cdp.evaluate("document.getElementById('debug-panel').hidden = true");
  report.source = { uuid: source.inputUuid, asset: path.basename(original.asset_path),
    assetSha256: digest(await readFile(original.asset_path)), settings: Object.fromEntries(Object.entries(original).filter(([key]) => key !== "asset_path")) };
  report.video = await client.request("GetVideoSettings");
  report.graphicsDevice = await cdp.evaluate(`(() => {
    const gl = document.getElementById('viewport').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })()`);
  if (args["plugin-dll"]) report.pluginSha256 = digest(await readFile(path.resolve(root, args["plugin-dll"])));
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    const state = await snapshot();
    if (!state.renderScheduled && !state.sorting && !state.sortDirty) break;
    await delay(500);
  }
  report.idleBefore = await snapshot();
  await delay(10_000);
  report.idleAfter = await snapshot();
  report.idlePassed = !report.idleAfter.renderScheduled && !report.idleAfter.sorting &&
    report.idleBefore.renderCount === report.idleAfter.renderCount &&
    report.idleBefore.lastSortTime === report.idleAfter.lastSortTime;

  await moveCamera(5);
  if (args.record === "true") {
    assert(!(await client.request("GetRecordStatus")).outputActive, "OBS is already recording");
    const directory = path.join(output, "recordings");
    await mkdir(directory, { recursive: true });
    originalRecordingDirectory = (await client.request("GetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "FilePath" })).parameterValue;
    await client.request("SetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "FilePath", parameterValue: directory.replaceAll("\\", "/") });
    const special = await client.request("GetSpecialInputs");
    for (const inputName of new Set(Object.values(special).filter(value => typeof value === "string" && value))) {
      const { inputMuted } = await client.request("GetInputMute", { inputName });
      originalMutes.push({ inputName, inputMuted });
      await client.request("SetInputMute", { inputName, inputMuted: true });
    }
    await client.request("StartRecord");
    recording = true;
    for (let attempt = 0; attempt < 80; attempt++) {
      if ((await client.request("GetRecordStatus")).outputActive) break;
      await delay(250);
    }
    assert((await client.request("GetRecordStatus")).outputActive, "Recording did not start");
    // Encoder timestamps can lag the frontend's active flag; include a full warm-up second.
    for (let attempt = 0; attempt < 80; attempt++) {
      if ((await client.request("GetRecordStatus")).outputDuration >= 1000) break;
      await delay(250);
    }
  }
  report.obsBefore = await client.request("GetStats");
  await cdp.evaluate("window.obs3dgs.startFrameRecording()");
  report.motionUpdates = await moveCamera(duration);
  const frames = await cdp.evaluate("window.obs3dgs.stopFrameRecording()");
  report.obsAfter = await client.request("GetStats");
  if (recording) report.recordingStatus = await client.request("GetRecordStatus");
  await writeFile(path.join(output, "frames.json"), JSON.stringify(frames) + "\n");
  const intervals = frames.timestampsMs.slice(1).map((value, index) => value - frames.timestampsMs[index]);
  report.intervalsMs = summarize(intervals);
  report.cpuSubmissionMs = summarize(frames.cpuSubmissionMs);
  report.averageFps = report.intervalsMs ? 1000 / report.intervalsMs.average : 0;
  report.captureOverflow = frames.overflow;
  const { imageData } = await client.request("GetSourceScreenshot", { sourceUuid: source.inputUuid, imageFormat: "png", imageWidth: 1280, imageHeight: 720 });
  const image = Buffer.from(imageData.split(",")[1], "base64");
  await writeFile(path.join(output, "moving.png"), image);
  report.screenshotSha256 = digest(image);
  report.coverage = "CEF render-frame intervals during sinusoidal native camera edits at 20 Hz; CPU submission is not GPU duration; static idle checked separately";
  if (!report.idlePassed) report.failures.push("Static view continued rendering or sorting");
  if (frames.overflow || intervals.length < duration * 10) report.failures.push("Incomplete frame capture");
} catch (error) {
  report.failures.push(error.message);
} finally {
  if (recording) {
    try {
      assert((await client.request("GetRecordStatus")).outputActive, "Recording was not active during cleanup");
      const stopped = await client.request("StopRecord");
      for (let attempt = 0; attempt < 80; attempt++) {
        if (!(await client.request("GetRecordStatus")).outputActive) break;
        await delay(250);
      }
      assert(!(await client.request("GetRecordStatus")).outputActive, "Recording did not stop");
      report.recording = { fileName: path.basename(stopped.outputPath), bytes: (await stat(stopped.outputPath)).size };
    }
    catch (error) { report.failures.push(`Stop recording: ${error.message}`); }
  }
  for (const mute of originalMutes) {
    try { await client.request("SetInputMute", mute); }
    catch (error) { report.failures.push(`Restore audio: ${error.message}`); }
  }
  if (originalRecordingDirectory !== undefined) {
    try { await client.request("SetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "FilePath", parameterValue: originalRecordingDirectory }); }
    catch (error) { report.failures.push(`Restore recording directory: ${error.message}`); }
  }
  if (original && source) {
    try { await client.request("SetInputSettings", { inputUuid: source.inputUuid, inputSettings: original, overlay: false }); }
    catch (error) { report.failures.push(`Restore settings: ${error.message}`); }
  }
  if (cdp && originalUrl) {
    try { await cdp.request("Page.navigate", { url: originalUrl }); }
    catch (error) { report.failures.push(`Restore page: ${error.message}`); }
  }
  cdp?.close();
  client.close();
  report.completedAt = new Date().toISOString();
  if (duration >= 1800 && args.record === "true" && report.obsAfter && report.obsBefore) {
    report.renderSkippedFrames = report.obsAfter.renderSkippedFrames - report.obsBefore.renderSkippedFrames;
    report.renderTotalFrames = report.obsAfter.renderTotalFrames - report.obsBefore.renderTotalFrames;
    report.renderSkipRatio = report.renderSkippedFrames / report.renderTotalFrames;
    report.meetsRtx4090Gate = report.failures.length === 0 && /RTX 4090/.test(report.graphicsDevice) &&
      original.quality_preset === "balanced" && report.video.baseWidth === 1920 && report.video.baseHeight === 1080 &&
      report.averageFps >= 58 && report.intervalsMs.p95 <= 20 && report.renderSkipRatio < 0.005 &&
      report.recordingStatus?.outputActive && report.recordingStatus.outputDuration >= 1800_000 && report.recording?.bytes > 0;
    if (!report.meetsRtx4090Gate) report.failures.push("The complete RTX 4090 recording/renderer gate did not pass");
  }
  report.passed = report.failures.length === 0;
  await writeFile(path.join(output, "renderer-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, averageFps: report.averageFps, intervalsMs: report.intervalsMs, idlePassed: report.idlePassed, failures: report.failures }));
}
if (!report.passed) process.exitCode = 1;
