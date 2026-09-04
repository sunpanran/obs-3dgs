// SPDX-License-Identifier: GPL-2.0-or-later

import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
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

const assertWorkspacePath = (projectRoot, target, name) => {
  const relative = path.relative(projectRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`${name} must remain inside the project workspace`);
};

const decodeScreenshot = (imageData) => {
  const match = /^data:image\/png;base64,(.+)$/s.exec(imageData);
  if (!match)
    throw new Error("OBS returned an invalid PNG data URL");
  return Buffer.from(match[1], "base64");
};

const percentile = (values, percentage) => {
  if (values.length === 0)
    return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  const durationSeconds = integerOption(args["duration-seconds"], 60, 10, 3_600, "--duration-seconds");
  const sampleIntervalMs = integerOption(args["sample-interval-ms"], 1_000, 250, 10_000, "--sample-interval-ms");
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  if (!password)
    throw new Error("Set OBS_WEBSOCKET_PASSWORD before running the OBS performance test");

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputDirectory = path.resolve(projectRoot, args.output ?? "output/obs-performance");
  assertWorkspacePath(projectRoot, outputDirectory, "--output");
  const recordingDirectory = path.join(outputDirectory, "recordings");
  await mkdir(recordingDirectory, { recursive: true });

  const client = new ObsWebSocketClient({
    url: args.url ?? "ws://127.0.0.1:4456",
    password,
    timeoutMs: 30_000
  });
  const report = {
    startedAt: new Date().toISOString(),
    requestedDurationSeconds: durationSeconds,
    sampleIntervalMs,
    target: {
      width: 1_920,
      height: 1_080,
      fpsNumerator: 60,
      fpsDenominator: 1,
      qualityPreset: "balanced"
    },
    samples: [],
    failures: []
  };
  let recordingActive = false;
  let primaryError;
  let previousVideoSettings;

  const setProfileParameter = async (parameterCategory, parameterName, parameterValue) => {
    await client.request("SetProfileParameter", { parameterCategory, parameterName, parameterValue });
    const readBack = await client.request("GetProfileParameter", { parameterCategory, parameterName });
    if (readBack.parameterValue !== parameterValue)
      throw new Error(`OBS did not retain ${parameterCategory}.${parameterName}`);
  };

  const waitForRecordingState = async (expectedActive, timeoutMs = 10_000) => {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const status = await client.request("GetRecordStatus");
      if (status.outputActive === expectedActive)
        return status;
      await delay(250);
    }
    throw new Error(`OBS recording did not become ${expectedActive ? "active" : "inactive"}`);
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
      "GetVideoSettings",
      "SetVideoSettings",
      "GetProfileParameter",
      "SetProfileParameter",
      "GetRecordStatus",
      "StartRecord",
      "StopRecord",
      "GetStats",
      "GetInputList",
      "GetSourceScreenshot"
    ]) {
      if (!version.availableRequests?.includes(required))
        throw new Error(`OBS WebSocket does not provide ${required}`);
    }

    const recordStatus = await client.request("GetRecordStatus");
    if (recordStatus.outputActive)
      throw new Error("OBS recording is already active");

    const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    const source = inputs.inputs?.find((input) => !input.inputName.startsWith("obs-3dgs-"));
    if (!source)
      throw new Error("No loaded obs_3dgs_source is available for the performance test");
    report.source = { inputName: source.inputName, inputUuid: source.inputUuid };

    previousVideoSettings = await client.request("GetVideoSettings");
    await client.request("SetVideoSettings", {
      fpsNumerator: 60,
      fpsDenominator: 1,
      baseWidth: 1_920,
      baseHeight: 1_080,
      outputWidth: 1_920,
      outputHeight: 1_080
    });

    await setProfileParameter("Output", "Mode", "Simple");
    await setProfileParameter("SimpleOutput", "FilePath", recordingDirectory.replaceAll("\\", "/"));
    await setProfileParameter("SimpleOutput", "RecFormat2", "mkv");
    await setProfileParameter("SimpleOutput", "RecQuality", "Small");
    await setProfileParameter("SimpleOutput", "RecEncoder", "nvenc");

    const fpsDeadline = performance.now() + 30_000;
    let consecutiveReadySamples = 0;
    while (performance.now() < fpsDeadline && consecutiveReadySamples < 3) {
      const stats = await client.request("GetStats");
      consecutiveReadySamples = stats.activeFps >= 59 ? consecutiveReadySamples + 1 : 0;
      if (consecutiveReadySamples < 3)
        await delay(1_000);
    }
    if (consecutiveReadySamples < 3)
      throw new Error("OBS did not stabilize at 60 FPS after SetVideoSettings");

    await delay(5_000);
    const screenshot = await client.request("GetSourceScreenshot", {
      sourceUuid: source.inputUuid,
      imageFormat: "png",
      imageWidth: 1_280,
      imageHeight: 720,
      imageCompressionQuality: 100
    });
    const screenshotBytes = decodeScreenshot(screenshot.imageData);
    const screenshotPath = path.join(outputDirectory, "preflight-scene.png");
    await writeFile(screenshotPath, screenshotBytes);
    report.screenshot = {
      fileName: path.basename(screenshotPath),
      sizeBytes: screenshotBytes.length,
      sha256: createHash("sha256").update(screenshotBytes).digest("hex")
    };

    report.baseline = await client.request("GetStats");
    await client.request("StartRecord");
    await waitForRecordingState(true);
    recordingActive = true;
    const recordingStarted = performance.now();
    let nextProgress = 10;
    while (performance.now() - recordingStarted < durationSeconds * 1_000) {
      await delay(sampleIntervalMs);
      const stats = await client.request("GetStats");
      report.samples.push({ elapsedSeconds: (performance.now() - recordingStarted) / 1_000, ...stats });
      const elapsed = (performance.now() - recordingStarted) / 1_000;
      if (elapsed >= nextProgress) {
        process.stdout.write(
          `${Math.min(durationSeconds, Math.round(elapsed))}/${durationSeconds} s: ` +
          `${stats.activeFps.toFixed(1)} FPS, ${stats.averageFrameRenderTime.toFixed(2)} ms\n`
        );
        nextProgress += 10;
      }
    }

    const statusBeforeStop = await client.request("GetRecordStatus");
    if (!statusBeforeStop.outputActive)
      throw new Error("OBS recording stopped unexpectedly before the requested duration elapsed");
    const stopped = await client.request("StopRecord");
    await waitForRecordingState(false, 30_000);
    recordingActive = false;
    await delay(500);
    const recordingPath = path.resolve(stopped.outputPath);
    assertWorkspacePath(projectRoot, recordingPath, "recording output");
    const recordingInfo = await stat(recordingPath);
    if (!recordingInfo.isFile() || recordingInfo.size < 1_000_000)
      throw new Error("OBS recording output is missing or unexpectedly small");
    report.recording = {
      fileName: path.basename(recordingPath),
      sizeBytes: recordingInfo.size
    };
    report.final = await client.request("GetStats");

    const fpsSamples = report.samples.map((sample) => sample.activeFps);
    const renderTimeSamples = report.samples.map((sample) => sample.averageFrameRenderTime);
    const renderSkippedFrameDelta = report.final.renderSkippedFrames - report.baseline.renderSkippedFrames;
    const renderTotalFrameDelta = report.final.renderTotalFrames - report.baseline.renderTotalFrames;
    const outputSkippedFrameDelta = report.final.outputSkippedFrames - report.baseline.outputSkippedFrames;
    const outputTotalFrameDelta = report.final.outputTotalFrames - report.baseline.outputTotalFrames;
    report.summary = {
      actualDurationSeconds: report.samples.at(-1)?.elapsedSeconds ?? 0,
      meanActiveFps: fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length,
      minimumActiveFps: Math.min(...fpsSamples),
      meanFrameRenderTimeMs: renderTimeSamples.reduce((sum, value) => sum + value, 0) / renderTimeSamples.length,
      p95SampledAverageRenderTimeMs: percentile(renderTimeSamples, 0.95),
      maximumSampledAverageRenderTimeMs: Math.max(...renderTimeSamples),
      renderSkippedFrameDelta,
      renderTotalFrameDelta,
      renderSkippedPercent: renderTotalFrameDelta > 0 ? (renderSkippedFrameDelta / renderTotalFrameDelta) * 100 : 0,
      outputSkippedFrameDelta,
      outputTotalFrameDelta,
      outputSkippedPercent: outputTotalFrameDelta > 0 ? (outputSkippedFrameDelta / outputTotalFrameDelta) * 100 : 0
    };
    // GetStats returns an average, not a frame-duration distribution. Do not
    // treat quantiles of those averages as the required renderer frame P95.
    report.summary.meetsStaticRecordingThresholds = report.summary.meanActiveFps >= 58 &&
      report.summary.renderSkippedPercent < 0.5;
    report.fullPerformanceGate = {
      status: "not-verified",
      missing: ["individual-renderer-frame-times", "interactive-camera-workload"],
      workload: "static-scene-recording"
    };
    report.completedAt = new Date().toISOString();
  } catch (error) {
    primaryError = error;
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (recordingActive) {
      try {
        const status = await client.request("GetRecordStatus");
        if (status.outputActive) {
          await client.request("StopRecord");
          await waitForRecordingState(false, 30_000);
        }
        recordingActive = false;
      } catch (error) {
        report.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (previousVideoSettings) {
      try {
        await client.request("SetVideoSettings", {
          fpsNumerator: previousVideoSettings.fpsNumerator,
          fpsDenominator: previousVideoSettings.fpsDenominator,
          baseWidth: previousVideoSettings.baseWidth,
          baseHeight: previousVideoSettings.baseHeight,
          outputWidth: previousVideoSettings.outputWidth,
          outputHeight: previousVideoSettings.outputHeight
        });
      } catch (error) {
        report.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    client.close();
    report.passed = Boolean(report.summary?.meetsStaticRecordingThresholds) && report.failures.length === 0;
    const reportPath = path.join(outputDirectory, "performance-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const info = await stat(reportPath);
    process.stdout.write(`wrote ${path.relative(projectRoot, reportPath)} (${info.size} bytes)\n`);
  }

  if (primaryError)
    throw primaryError;
  if (report.failures.length > 0)
    throw new Error(report.failures[0]);
};

await main();
