// SPDX-License-Identifier: GPL-2.0-or-later

import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const decodeScreenshot = (imageData) => {
  const match = /^data:image\/png;base64,(.+)$/s.exec(imageData);
  if (!match)
    throw new Error("OBS returned an invalid PNG data URL");
  return Buffer.from(match[1], "base64");
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  const url = args.url ?? "ws://127.0.0.1:4456";
  const cycles = Number.parseInt(args.cycles ?? "100", 10);
  if (!Number.isSafeInteger(cycles) || cycles < 1 || cycles > 1_000)
    throw new Error("--cycles must be an integer from 1 to 1000");
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  if (!password)
    throw new Error("Set OBS_WEBSOCKET_PASSWORD before running the lifecycle test");

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputDirectory = path.resolve(projectRoot, args.output ?? "output/obs-integration");
  const relativeOutput = path.relative(projectRoot, outputDirectory);
  if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput))
    throw new Error("--output must remain inside the project workspace");
  await mkdir(outputDirectory, { recursive: true });

  const client = new ObsWebSocketClient({ url, password, timeoutMs: 20_000 });
  const createdInputs = new Set();
  const report = {
    startedAt: new Date().toISOString(),
    cycles,
    samples: [],
    failures: []
  };

  try {
    await client.connect();
    const version = await client.request("GetVersion");
    report.version = {
      obsVersion: version.obsVersion,
      obsWebSocketVersion: version.obsWebSocketVersion,
      rpcVersion: version.rpcVersion
    };
    for (const required of ["CreateInput", "RemoveInput", "GetStats", "GetSourceScreenshot"]) {
      if (!version.availableRequests?.includes(required))
        throw new Error(`OBS WebSocket does not provide ${required}`);
    }

    const kinds = await client.request("GetInputKindList", { unversioned: true });
    if (!kinds.inputKinds?.includes("obs_3dgs_source"))
      throw new Error("obs_3dgs_source is not registered in the automated OBS instance");

    const scenes = await client.request("GetSceneList");
    const sceneName = args.scene ?? scenes.currentProgramSceneName ?? scenes.currentPreviewSceneName;
    if (!sceneName)
      throw new Error("No OBS scene is available for lifecycle testing");
    report.sceneName = sceneName;

    const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    const loadedInput = inputs.inputs?.find((input) => !input.inputName.startsWith("obs-3dgs-lifecycle-"));
    if (loadedInput) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const screenshot = await client.request("GetSourceScreenshot", {
            sourceUuid: loadedInput.inputUuid,
            imageFormat: "png",
            imageWidth: 1280,
            imageHeight: 720,
            imageCompressionQuality: 100
          });
          const bytes = decodeScreenshot(screenshot.imageData);
          if (bytes.length < 20_000)
            throw new Error(`Screenshot is unexpectedly small (${bytes.length} bytes)`);
          const screenshotPath = path.join(outputDirectory, "loaded-scene.png");
          await writeFile(screenshotPath, bytes);
          report.loadedScene = {
            inputName: loadedInput.inputName,
            inputUuid: loadedInput.inputUuid,
            screenshot: path.relative(projectRoot, screenshotPath).replaceAll("\\", "/"),
            screenshotBytes: bytes.length,
            screenshotSha256: createHash("sha256").update(bytes).digest("hex")
          };
          break;
        } catch (error) {
          if (attempt === 19)
            throw error;
          await delay(1_000);
        }
      }
    }

    const baseline = await client.request("GetStats");
    report.baseline = baseline;
    report.samples.push({ cycle: 0, ...baseline });

    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      const inputName = `obs-3dgs-lifecycle-${String(cycle).padStart(4, "0")}`;
      const created = await client.request("CreateInput", {
        sceneName,
        inputName,
        inputKind: "obs_3dgs_source",
        inputSettings: {},
        sceneItemEnabled: false
      });
      createdInputs.add(created.inputUuid);
      await client.request("RemoveInput", { inputUuid: created.inputUuid });
      createdInputs.delete(created.inputUuid);
      if (cycle % 10 === 0 || cycle === cycles) {
        const sample = await client.request("GetStats");
        report.samples.push({ cycle, ...sample });
        process.stdout.write(
          `cycle ${cycle}/${cycles}: ${sample.memoryUsage.toFixed(1)} MB, ${sample.activeFps.toFixed(1)} FPS\n`
        );
      }
    }

    await delay(5_000);
    report.final = await client.request("GetStats");
    const remaining = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    const leakedInputs = remaining.inputs?.filter((input) => input.inputName.startsWith("obs-3dgs-lifecycle-")) ?? [];
    if (leakedInputs.length > 0)
      throw new Error(`${leakedInputs.length} lifecycle inputs remained after cleanup`);

    report.memoryGrowthMb = report.final.memoryUsage - baseline.memoryUsage;
    report.renderSkippedFrameDelta = report.final.renderSkippedFrames - baseline.renderSkippedFrames;
    report.renderTotalFrameDelta = report.final.renderTotalFrames - baseline.renderTotalFrames;
    report.renderSkippedPercent = report.renderTotalFrameDelta > 0
      ? (report.renderSkippedFrameDelta / report.renderTotalFrameDelta) * 100
      : 0;
    report.completedAt = new Date().toISOString();
  } finally {
    for (const inputUuid of createdInputs) {
      try {
        await client.request("RemoveInput", { inputUuid });
      } catch (error) {
        report.failures.push(String(error));
      }
    }
    client.close();
    const reportPath = path.join(outputDirectory, "lifecycle-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const info = await stat(reportPath);
    process.stdout.write(`wrote ${path.relative(projectRoot, reportPath)} (${info.size} bytes)\n`);
  }
};

await main();
