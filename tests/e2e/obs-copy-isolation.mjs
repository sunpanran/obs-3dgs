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

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  if (!args["obs-log"])
    throw new Error("--obs-log is required");
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  if (!password)
    throw new Error("Set OBS_WEBSOCKET_PASSWORD before running the copy-isolation test");

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputDirectory = path.resolve(projectRoot, args.output ?? "output/obs-copy-isolation");
  const obsLogPath = path.resolve(projectRoot, args["obs-log"]);
  assertWorkspacePath(projectRoot, outputDirectory, "--output");
  assertWorkspacePath(projectRoot, obsLogPath, "--obs-log");
  await mkdir(outputDirectory, { recursive: true });
  if (!(await stat(obsLogPath)).isFile())
    throw new Error("--obs-log must point to the active OBS log file");

  const client = new ObsWebSocketClient({
    url: args.url ?? "ws://127.0.0.1:4456",
    password,
    timeoutMs: 30_000
  });
  const report = {
    startedAt: new Date().toISOString(),
    obsLogFile: path.basename(obsLogPath),
    failures: []
  };
  let copiedSourceUuid;
  let primaryError;

  const waitForReady = async (offset, inputUuid) => {
    const expected = `[obs-3dgs] Scene ready for source ${inputUuid} (`;
    const deadline = performance.now() + 90_000;
    while (performance.now() < deadline) {
      const log = await readFile(obsLogPath, "utf8");
      if (log.indexOf(expected, offset) >= 0)
        return;
      await delay(500);
    }
    throw new Error(`Copied source ${inputUuid} did not report ready`);
  };

  const getSettings = async (inputUuid) => {
    const response = await client.request("GetInputSettings", { inputUuid });
    return response.inputSettings;
  };

  const capture = async (inputUuid, fileName) => {
    const response = await client.request("GetSourceScreenshot", {
      sourceUuid: inputUuid,
      imageFormat: "png",
      imageWidth: 1_280,
      imageHeight: 720,
      imageCompressionQuality: 100
    });
    const bytes = decodeScreenshot(response.imageData);
    if (bytes.length < 20_000)
      throw new Error(`${fileName} is unexpectedly small (${bytes.length} bytes)`);
    await writeFile(path.join(outputDirectory, fileName), bytes);
    return {
      fileName,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
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
      "RemoveInput",
      "GetInputList",
      "GetInputSettings",
      "SetInputSettings",
      "GetSourceScreenshot",
      "GetSceneList"
    ])
      if (!version.availableRequests?.includes(required))
        throw new Error(`OBS WebSocket does not provide ${required}`);

    const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    const original = inputs.inputs?.find((input) => !input.inputName.startsWith("obs-3dgs-"));
    if (!original)
      throw new Error("No stable obs_3dgs_source is available for copy-isolation testing");
    const originalSettings = await getSettings(original.inputUuid);
    if (!originalSettings.asset_path)
      throw new Error("The original source does not have a loaded asset");
    const scenes = await client.request("GetSceneList");
    const sceneName = args.scene ?? scenes.currentProgramSceneName ?? scenes.currentPreviewSceneName;
    if (!sceneName)
      throw new Error("No scene is available for copy-isolation testing");

    const copiedSettings = { ...originalSettings };
    delete copiedSettings.undo_uuid;
    copiedSettings.live_lock = false;
    const logOffset = (await readFile(obsLogPath, "utf8")).length;
    const copyInputName = `obs-3dgs-copy-${Date.now()}`;
    const copied = await client.request("CreateInput", {
      sceneName,
      inputName: copyInputName,
      inputKind: "obs_3dgs_source",
      inputSettings: copiedSettings,
      sceneItemEnabled: true
    });
    copiedSourceUuid = copied.inputUuid;
    await waitForReady(logOffset, copiedSourceUuid);
    await delay(1_000);
    const originalScreenshot = await capture(original.inputUuid, "original.png");
    const copyBeforeScreenshot = await capture(copiedSourceUuid, "copy-before.png");

    const copyMutation = {
      camera_yaw: Number(copiedSettings.camera_yaw) + 33,
      focal_length_mm: Number(copiedSettings.focal_length_mm) === 85 ? 50 : 85,
      exposure: Number(copiedSettings.exposure) === 1.4 ? 0.7 : 1.4,
      camera_presets_json: JSON.stringify([{
        name: "Copy-only preset",
        target: {
          x: Number(copiedSettings.camera_target_x),
          y: Number(copiedSettings.camera_target_y),
          z: Number(copiedSettings.camera_target_z)
        },
        yawDeg: Number(copiedSettings.camera_yaw) + 33,
        pitchDeg: Number(copiedSettings.camera_pitch),
        rollDeg: Number(copiedSettings.camera_roll),
        distance: Number(copiedSettings.camera_distance),
        focalLengthMm: Number(copiedSettings.focal_length_mm) === 85 ? 50 : 85
      }])
    };
    await client.request("SetInputSettings", {
      inputUuid: copiedSourceUuid,
      inputSettings: copyMutation,
      overlay: true
    });
    await delay(1_000);
    const originalAfter = await getSettings(original.inputUuid);
    const copyAfter = await getSettings(copiedSourceUuid);
    for (const key of Object.keys(copyMutation)) {
      if (originalAfter[key] !== originalSettings[key])
        throw new Error(`Copy mutation leaked into original setting ${key}`);
      if (copyAfter[key] !== copyMutation[key])
        throw new Error(`Copied source did not retain independent setting ${key}`);
    }
    const copyAfterScreenshot = await capture(copiedSourceUuid, "copy-after.png");
    if (copyBeforeScreenshot.sha256 === copyAfterScreenshot.sha256)
      throw new Error("Changing the copied camera and exposure did not change its rendered frame");

    report.original = {
      inputName: original.inputName,
      inputUuid: original.inputUuid,
      assetFileName: path.basename(originalSettings.asset_path),
      screenshot: originalScreenshot
    };
    report.copy = {
      inputName: copyInputName,
      inputUuid: copiedSourceUuid,
      before: copyBeforeScreenshot,
      after: copyAfterScreenshot
    };
    report.checks = {
      independentSettings: true,
      independentCameraPresetJson: true,
      independentRenderedFrame: true
    };

    await client.request("RemoveInput", { inputUuid: copiedSourceUuid });
    copiedSourceUuid = undefined;
    await delay(2_000);
    const remaining = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    if (remaining.inputs?.some((input) => input.inputName.startsWith("obs-3dgs-copy-")))
      throw new Error("The copied source remained after cleanup");
    report.completedAt = new Date().toISOString();
  } catch (error) {
    primaryError = error;
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (copiedSourceUuid) {
      try {
        await client.request("RemoveInput", { inputUuid: copiedSourceUuid });
      } catch (error) {
        report.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    client.close();
    report.passed = Boolean(report.checks?.independentSettings) && report.failures.length === 0;
    const reportPath = path.join(outputDirectory, "copy-isolation-report.json");
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
