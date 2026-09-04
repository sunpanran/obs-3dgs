// SPDX-License-Identifier: GPL-2.0-or-later

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  if (!password)
    throw new Error("Set OBS_WEBSOCKET_PASSWORD before running the behavior test");
  if (!args["obs-log"])
    throw new Error("--obs-log is required for deterministic runtime recovery checks");

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputDirectory = path.resolve(projectRoot, args.output ?? "output/obs-behavior");
  assertWorkspacePath(projectRoot, outputDirectory, "--output");
  await mkdir(outputDirectory, { recursive: true });
  const obsLogPath = path.resolve(projectRoot, args["obs-log"]);
  assertWorkspacePath(projectRoot, obsLogPath, "--obs-log");
  if (!(await stat(obsLogPath)).isFile())
    throw new Error("--obs-log must point to the active OBS log file");

  const corruptPath = path.join(outputDirectory, "corrupt-runtime.sog");
  const corruptBytes = Buffer.alloc(64);
  corruptBytes.set([0x50, 0x4B, 0x03, 0x04]);
  await writeFile(corruptPath, corruptBytes);

  const client = new ObsWebSocketClient({
    url: args.url ?? "ws://127.0.0.1:4456",
    password,
    timeoutMs: 30_000
  });
  const report = {
    startedAt: new Date().toISOString(),
    obsLogFile: path.basename(obsLogPath),
    checks: {},
    failures: []
  };
  let originalSettings;
  let source;
  let primaryError;

  const setSettings = (inputSettings, overlay = true) => client.request("SetInputSettings", {
    inputUuid: source.inputUuid,
    inputSettings,
    overlay
  });

  const currentSettings = async () => {
    const response = await client.request("GetInputSettings", { inputUuid: source.inputUuid });
    return response.inputSettings;
  };

  const capture = async (requestData, fileName) => {
    const response = await client.request("GetSourceScreenshot", {
      ...requestData,
      imageFormat: "png",
      imageWidth: 1_280,
      imageHeight: 720,
      imageCompressionQuality: 100
    });
    const bytes = decodeScreenshot(response.imageData);
    if (bytes.length < 20_000)
      throw new Error(`${fileName} is unexpectedly small (${bytes.length} bytes)`);
    await writeFile(path.join(outputDirectory, fileName), bytes);
    return { fileName, sizeBytes: bytes.length, sha256: sha256(bytes) };
  };

  const waitForLog = async (offset, text, timeoutMs = 90_000) => {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const log = await readFile(obsLogPath, "utf8");
      const matchAt = log.indexOf(text, offset);
      if (matchAt >= 0)
        return matchAt + text.length;
      await delay(500);
    }
    throw new Error(`OBS log did not contain the expected event: ${text}`);
  };

  const waitForCamera = async (expected, timeoutMs = 5_000) => {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const settings = await currentSettings();
      const matches = Object.entries(expected).every(([key, value]) => settings[key] === value);
      if (matches)
        return settings;
      await delay(100);
    }
    throw new Error("Camera settings did not reach the expected preset state");
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
      "GetInputSettings",
      "SetInputSettings",
      "GetSourceScreenshot",
      "GetSceneList",
      "GetHotkeyList",
      "TriggerHotkeyByName"
    ])
      if (!version.availableRequests?.includes(required))
        throw new Error(`OBS WebSocket does not provide ${required}`);

    const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    source = inputs.inputs?.find((input) => !input.inputName.startsWith("obs-3dgs-"));
    if (!source)
      throw new Error("No stable obs_3dgs_source is available for behavior testing");
    originalSettings = await currentSettings();
    const originalAssetPath = originalSettings.asset_path;
    if (typeof originalAssetPath !== "string" || originalAssetPath.length === 0)
      throw new Error("The behavior-test source does not have a loaded asset");
    report.source = {
      inputName: source.inputName,
      inputUuid: source.inputUuid,
      assetFileName: path.basename(originalAssetPath)
    };

    const presetOne = {
      name: "Behavior preset 1",
      target: {
        x: Number(originalSettings.camera_target_x),
        y: Number(originalSettings.camera_target_y),
        z: Number(originalSettings.camera_target_z)
      },
      yawDeg: Number(originalSettings.camera_yaw),
      pitchDeg: Number(originalSettings.camera_pitch),
      rollDeg: Number(originalSettings.camera_roll),
      distance: Number(originalSettings.camera_distance),
      focalLengthMm: Number(originalSettings.focal_length_mm)
    };
    const presetTwo = {
      ...presetOne,
      name: "Behavior preset 2",
      yawDeg: presetOne.yawDeg + 17,
      pitchDeg: Math.max(-80, Math.min(80, presetOne.pitchDeg - 5)),
      distance: presetOne.distance + 2,
      focalLengthMm: presetOne.focalLengthMm === 50 ? 85 : 50
    };
    await setSettings({
      camera_presets_json: JSON.stringify([presetOne, presetTwo]),
      active_camera_preset: 0
    });
    await delay(500);

    await setSettings({ live_lock: true });
    await delay(500);
    const lockedBaseline = await currentSettings();
    const attempted = {
      exposure: Number(lockedBaseline.exposure) === 1.75 ? 0.5 : 1.75,
      focal_length_mm: Number(lockedBaseline.focal_length_mm) === 85 ? 50 : 85,
      scene_scale: Number(lockedBaseline.scene_scale) + 1,
      camera_yaw: Number(lockedBaseline.camera_yaw) + 15,
      background_mode: lockedBaseline.background_mode === "transparent" ? "opaque" : "transparent"
    };
    await setSettings(attempted);
    await delay(1_000);
    const lockedResult = await currentSettings();
    for (const key of Object.keys(attempted)) {
      if (lockedResult[key] !== lockedBaseline[key])
        throw new Error(`Live lock allowed ${key} to change`);
    }
    report.checks.liveLock = { passed: true, blockedSettings: Object.keys(attempted) };

    const hotkeyList = await client.request("GetHotkeyList");
    const expectedHotkeys = [
      "obs3dgs.reset_camera",
      "obs3dgs.previous_preset",
      "obs3dgs.next_preset",
      "obs3dgs.preset_1",
      "obs3dgs.preset_2",
      "obs3dgs.preset_3",
      "obs3dgs.preset_4"
    ];
    for (const hotkey of expectedHotkeys)
      if (!hotkeyList.hotkeys?.includes(hotkey))
        throw new Error(`OBS did not register ${hotkey}`);

    const presetOneSettings = {
      camera_yaw: presetOne.yawDeg,
      camera_pitch: presetOne.pitchDeg,
      camera_roll: presetOne.rollDeg,
      camera_distance: presetOne.distance,
      focal_length_mm: presetOne.focalLengthMm,
      active_camera_preset: 0
    };
    const presetTwoSettings = {
      camera_yaw: presetTwo.yawDeg,
      camera_pitch: presetTwo.pitchDeg,
      camera_roll: presetTwo.rollDeg,
      camera_distance: presetTwo.distance,
      focal_length_mm: presetTwo.focalLengthMm,
      active_camera_preset: 1
    };
    await client.request("TriggerHotkeyByName", { hotkeyName: "obs3dgs.next_preset" });
    await waitForCamera(presetTwoSettings);
    await client.request("TriggerHotkeyByName", { hotkeyName: "obs3dgs.previous_preset" });
    await waitForCamera(presetOneSettings);
    await client.request("TriggerHotkeyByName", { hotkeyName: "obs3dgs.preset_2" });
    await waitForCamera(presetTwoSettings);
    await client.request("TriggerHotkeyByName", { hotkeyName: "obs3dgs.preset_1" });
    const beforeBlockedReset = await waitForCamera(presetOneSettings);
    await client.request("TriggerHotkeyByName", { hotkeyName: "obs3dgs.reset_camera" });
    await delay(500);
    const afterBlockedReset = await currentSettings();
    for (const key of Object.keys(presetOneSettings)) {
      if (afterBlockedReset[key] !== beforeBlockedReset[key])
        throw new Error(`Live lock allowed reset-camera hotkey to change ${key}`);
    }
    report.checks.lockedPresetHotkeys = {
      passed: true,
      registeredHotkeys: expectedHotkeys,
      allowedWhileLocked: ["previous_preset", "next_preset", "preset_1", "preset_2"],
      blockedWhileLocked: ["reset_camera"]
    };
    await setSettings({ live_lock: false });
    await delay(500);

    const scenes = await client.request("GetSceneList");
    const sceneName = args.scene ?? scenes.currentProgramSceneName ?? scenes.currentPreviewSceneName;
    if (!sceneName)
      throw new Error("No scene is available for transparent-compositing checks");
    await setSettings({ background_mode: "opaque" });
    await delay(500);
    const opaqueScene = await capture({ sourceName: sceneName }, "composite-opaque.png");
    await setSettings({ background_mode: "transparent" });
    await delay(500);
    const transparentScene = await capture({ sourceName: sceneName }, "composite-transparent.png");
    if (opaqueScene.sha256 === transparentScene.sha256)
      throw new Error("Transparent and opaque scene composites are identical");
    report.checks.transparentComposite = { passed: true, opaqueScene, transparentScene };
    await setSettings({ background_mode: originalSettings.background_mode ?? "opaque" });
    await delay(500);

    const validBefore = await capture({ sourceUuid: source.inputUuid }, "recovery-before.png");
    const logOffset = (await readFile(obsLogPath, "utf8")).length;
    await setSettings({ asset_path: corruptPath });
    const afterError = await waitForLog(
      logOffset,
      `[obs-3dgs] Runtime error for source ${source.inputUuid} (asset-load-failed)`
    );
    await waitForLog(afterError, `[obs-3dgs] Scene ready for source ${source.inputUuid} (`);
    await delay(1_000);
    const recoveredSettings = await currentSettings();
    if (recoveredSettings.asset_path !== originalAssetPath)
      throw new Error("Runtime failure did not restore the previous asset path");
    const validAfter = await capture({ sourceUuid: source.inputUuid }, "recovery-after.png");
    if (validBefore.sha256 !== validAfter.sha256)
      throw new Error("The recovered scene frame differs from the pre-failure frame");
    report.checks.failedStagingRecovery = {
      passed: true,
      fixtureFileName: path.basename(corruptPath),
      before: validBefore,
      after: validAfter
    };

    const cancellationA = path.join(outputDirectory, "cancellation-a.sog");
    const cancellationB = path.join(outputDirectory, "cancellation-b.sog");
    await copyFile(originalAssetPath, cancellationA);
    await copyFile(originalAssetPath, cancellationB);
    const cancellationLogOffset = (await readFile(obsLogPath, "utf8")).length;
    await setSettings({ asset_path: cancellationA });
    await delay(100);
    await setSettings({ asset_path: cancellationB });
    const afterCancellationReady = await waitForLog(
      cancellationLogOffset,
      `[obs-3dgs] Scene ready for source ${source.inputUuid} (`
    );
    const cancellationLog = await readFile(obsLogPath, "utf8");
    if (cancellationLog.slice(cancellationLogOffset, afterCancellationReady).includes(
      `[obs-3dgs] Runtime error for source ${source.inputUuid} (`
    ))
      throw new Error("The superseded staging load reported an error after cancellation");
    await delay(1_000);
    const cancellationSettings = await currentSettings();
    if (cancellationSettings.asset_path !== cancellationB)
      throw new Error("The latest selected asset did not win the cancellation race");
    const cancellationResult = await capture({ sourceUuid: source.inputUuid }, "cancellation-latest.png");

    const restoreLogOffset = (await readFile(obsLogPath, "utf8")).length;
    await setSettings({ asset_path: originalAssetPath });
    await waitForLog(restoreLogOffset, `[obs-3dgs] Scene ready for source ${source.inputUuid} (`);
    await delay(1_000);
    const restoredAfterCancellation = await capture(
      { sourceUuid: source.inputUuid },
      "cancellation-restored.png"
    );
    if (cancellationResult.sha256 !== restoredAfterCancellation.sha256)
      throw new Error("Successful staging and restored-original frames differ for identical assets");
    report.checks.latestSelectionCancellation = {
      passed: true,
      supersededFileName: path.basename(cancellationA),
      selectedFileName: path.basename(cancellationB),
      selected: cancellationResult,
      restored: restoredAfterCancellation
    };
    report.completedAt = new Date().toISOString();
  } catch (error) {
    primaryError = error;
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (source && originalSettings) {
      try {
        await setSettings(originalSettings, false);
        await delay(500);
      } catch (error) {
        report.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    client.close();
    report.passed = Object.keys(report.checks).length === 5 && report.failures.length === 0;
    const reportPath = path.join(outputDirectory, "behavior-report.json");
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
