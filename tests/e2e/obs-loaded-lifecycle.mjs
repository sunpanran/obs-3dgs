// SPDX-License-Identifier: GPL-2.0-or-later

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { ObsWebSocketClient } from "./obs-websocket-client.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseArguments = (values) => {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined)
      throw new Error(`Invalid argument near ${key ?? "end of command"}`);
    options[key.slice(2)] = value;
  }
  return options;
};

const integerOption = (value, fallback, minimum, maximum, name) => {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return parsed;
};

const decodeScreenshot = (imageData) => {
  const match = /^data:image\/png;base64,(.+)$/s.exec(imageData);
  if (!match)
    throw new Error("OBS returned an invalid PNG data URL");
  return Buffer.from(match[1], "base64");
};

const assertWorkspacePath = (projectRoot, target, name) => {
  const relative = path.relative(projectRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`${name} must remain inside the project workspace`);
  return relative;
};

const percentile = (values, percentage) => {
  if (values.length === 0)
    return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  const cycles = integerOption(args.cycles, 20, 1, 100, "--cycles");
  const readyTimeoutMs = integerOption(args["ready-timeout-ms"], 60_000, 5_000, 120_000, "--ready-timeout-ms");
  const cooldownMs = integerOption(args["cooldown-ms"], 2_000, 0, 30_000, "--cooldown-ms");
  const settleMs = integerOption(args["settle-ms"], 10_000, 0, 60_000, "--settle-ms");
  const minimumScreenshotBytes = integerOption(
    args["min-screenshot-bytes"],
    20_000,
    1_000,
    20_000_000,
    "--min-screenshot-bytes"
  );
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  if (!password)
    throw new Error("Set OBS_WEBSOCKET_PASSWORD before running the loaded lifecycle test");

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const assetPath = path.resolve(projectRoot, args.asset ?? "public/samples/knock-community-hall.sog");
  assertWorkspacePath(projectRoot, assetPath, "--asset");
  const assetInfo = await stat(assetPath);
  if (!assetInfo.isFile())
    throw new Error("--asset must point to a file");
  if (!args["obs-log"])
    throw new Error("--obs-log is required so scene readiness is not inferred from a black screenshot");
  const obsLogPath = path.resolve(projectRoot, args["obs-log"]);
  assertWorkspacePath(projectRoot, obsLogPath, "--obs-log");
  const obsLogInfo = await stat(obsLogPath);
  if (!obsLogInfo.isFile())
    throw new Error("--obs-log must point to the active OBS log file");
  const outputDirectory = path.resolve(projectRoot, args.output ?? "output/obs-loaded-lifecycle");
  assertWorkspacePath(projectRoot, outputDirectory, "--output");
  await mkdir(outputDirectory, { recursive: true });

  const client = new ObsWebSocketClient({
    url: args.url ?? "ws://127.0.0.1:4456",
    password,
    timeoutMs: 20_000
  });
  const createdInputs = new Set();
  const prefix = `obs-3dgs-loaded-${Date.now()}-`;
  const report = {
    startedAt: new Date().toISOString(),
    cycles,
    asset: {
      fileName: path.basename(assetPath),
      sizeBytes: assetInfo.size
    },
    obsLogFile: path.basename(obsLogPath),
    samples: [],
    failures: []
  };
  let primaryError;

  const waitForRemoval = async (inputUuid) => {
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
      if (!inputs.inputs?.some((input) => input.inputUuid === inputUuid))
        return;
      await delay(100);
    }
    throw new Error(`Input ${inputUuid} remained after RemoveInput`);
  };

  const waitForSceneReady = async (inputUuid) => {
    const deadline = performance.now() + readyTimeoutMs;
    while (performance.now() < deadline) {
      const log = await readFile(obsLogPath, "utf8");
      if (log.includes(`[obs-3dgs] Runtime error for source ${inputUuid} (`))
        throw new Error(`The renderer reported an error for source ${inputUuid}`);
      if (log.includes(`[obs-3dgs] Scene ready for source ${inputUuid} (`))
        return;
      await delay(500);
    }
    throw new Error(`Scene ${inputUuid} did not report ready within ${readyTimeoutMs} ms`);
  };

  const captureScene = async (inputUuid) => {
    await delay(500);
    const screenshot = await client.request("GetSourceScreenshot", {
      sourceUuid: inputUuid,
      imageFormat: "png",
      imageWidth: 960,
      imageHeight: 540,
      imageCompressionQuality: 100
    });
    const bytes = decodeScreenshot(screenshot.imageData);
    if (bytes.length < minimumScreenshotBytes)
      throw new Error(`Ready scene screenshot is unexpectedly small (${bytes.length} bytes)`);
    return bytes;
  };

  try {
    await client.connect();
    const version = await client.request("GetVersion");
    report.version = {
      obsVersion: version.obsVersion,
      obsWebSocketVersion: version.obsWebSocketVersion,
      rpcVersion: version.rpcVersion
    };
    for (const required of [
      "CreateInput",
      "SetInputSettings",
      "RemoveInput",
      "GetInputList",
      "GetStats",
      "GetSourceScreenshot"
    ]) {
      if (!version.availableRequests?.includes(required))
        throw new Error(`OBS WebSocket does not provide ${required}`);
    }

    const kinds = await client.request("GetInputKindList", { unversioned: true });
    if (!kinds.inputKinds?.includes("obs_3dgs_source"))
      throw new Error("obs_3dgs_source is not registered in the automated OBS instance");
    const scenes = await client.request("GetSceneList");
    const sceneName = args.scene ?? scenes.currentProgramSceneName ?? scenes.currentPreviewSceneName;
    if (!sceneName)
      throw new Error("No OBS scene is available for loaded lifecycle testing");
    report.sceneName = sceneName;

    const before = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    if (before.inputs?.some((input) => input.inputName.startsWith("obs-3dgs-loaded-")))
      throw new Error("A stale loaded-lifecycle source exists before the test");

    report.baseline = await client.request("GetStats");
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      const inputName = `${prefix}${String(cycle).padStart(2, "0")}`;
      const started = performance.now();
      const created = await client.request("CreateInput", {
        sceneName,
        inputName,
        inputKind: "obs_3dgs_source",
        inputSettings: {},
        sceneItemEnabled: true
      });
      createdInputs.add(created.inputUuid);
      await client.request("SetInputSettings", {
        inputUuid: created.inputUuid,
        inputSettings: { asset_path: assetPath },
        overlay: true
      });
      await waitForSceneReady(created.inputUuid);
      const screenshotBytes = await captureScene(created.inputUuid);
      const loadSeconds = (performance.now() - started) / 1_000;
      const readyStats = await client.request("GetStats");

      if (cycle === 1 || cycle === cycles) {
        const screenshotPath = path.join(outputDirectory, `loaded-cycle-${String(cycle).padStart(2, "0")}.png`);
        await writeFile(screenshotPath, screenshotBytes);
      }

      await client.request("RemoveInput", { inputUuid: created.inputUuid });
      createdInputs.delete(created.inputUuid);
      await waitForRemoval(created.inputUuid);
      if (cooldownMs > 0)
        await delay(cooldownMs);
      const removedStats = await client.request("GetStats");
      report.samples.push({
        cycle,
        loadSeconds,
        screenshotBytes: screenshotBytes.length,
        screenshotSha256: createHash("sha256").update(screenshotBytes).digest("hex"),
        ready: readyStats,
        removed: removedStats
      });
      process.stdout.write(
        `cycle ${cycle}/${cycles}: ready in ${loadSeconds.toFixed(1)} s, ` +
        `${removedStats.memoryUsage.toFixed(1)} MB after removal\n`
      );
    }

    if (settleMs > 0)
      await delay(settleMs);
    report.final = await client.request("GetStats");
    const loadTimes = report.samples.map((sample) => sample.loadSeconds);
    report.summary = {
      meanLoadSeconds: loadTimes.reduce((sum, value) => sum + value, 0) / loadTimes.length,
      p95LoadSeconds: percentile(loadTimes, 0.95),
      memoryGrowthMb: report.final.memoryUsage - report.baseline.memoryUsage,
      renderSkippedFrameDelta: report.final.renderSkippedFrames - report.baseline.renderSkippedFrames,
      renderTotalFrameDelta: report.final.renderTotalFrames - report.baseline.renderTotalFrames
    };
    report.summary.renderSkippedPercent = report.summary.renderTotalFrameDelta > 0
      ? (report.summary.renderSkippedFrameDelta / report.summary.renderTotalFrameDelta) * 100
      : 0;
    report.completedAt = new Date().toISOString();
  } catch (error) {
    primaryError = error;
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    for (const inputUuid of createdInputs) {
      try {
        await client.request("RemoveInput", { inputUuid });
      } catch (error) {
        report.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    client.close();
    const reportPath = path.join(outputDirectory, "loaded-lifecycle-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const info = await stat(reportPath);
    process.stdout.write(`wrote ${path.relative(projectRoot, reportPath)} (${info.size} bytes)\n`);
  }

  if (primaryError)
    throw primaryError;
};

await main();
