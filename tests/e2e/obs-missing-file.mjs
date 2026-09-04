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
  const mode = args.mode;
  if (mode !== "prepare" && mode !== "recover")
    throw new Error("--mode must be prepare or recover");
  if (!args["obs-log"])
    throw new Error("--obs-log is required");
  const password = process.env.OBS_WEBSOCKET_PASSWORD;
  if (!password)
    throw new Error("Set OBS_WEBSOCKET_PASSWORD before running the missing-file test");

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputDirectory = path.resolve(projectRoot, args.output ?? "output/obs-missing-file");
  const obsLogPath = path.resolve(projectRoot, args["obs-log"]);
  assertWorkspacePath(projectRoot, outputDirectory, "--output");
  assertWorkspacePath(projectRoot, obsLogPath, "--obs-log");
  await mkdir(outputDirectory, { recursive: true });
  if (!(await stat(obsLogPath)).isFile())
    throw new Error("--obs-log must point to the active OBS log file");

  const statePath = path.join(outputDirectory, "restart-state.json");
  const missingPath = path.join(outputDirectory, "missing-on-restart.sog");
  const relocatedPath = path.join(outputDirectory, "relocated-scene.sog");
  const client = new ObsWebSocketClient({
    url: args.url ?? "ws://127.0.0.1:4456",
    password,
    timeoutMs: 30_000
  });
  const report = {
    startedAt: new Date().toISOString(),
    mode,
    obsLogFile: path.basename(obsLogPath),
    checks: {},
    failures: []
  };
  let primaryError;
  let source;
  let originalAssetPath;

  const waitForReady = async (offset, inputUuid, timeoutMs = 90_000) => {
    const expected = `[obs-3dgs] Scene ready for source ${inputUuid} (`;
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const log = await readFile(obsLogPath, "utf8");
      if (log.indexOf(expected, offset) >= 0)
        return;
      await delay(500);
    }
    throw new Error(`Scene ${inputUuid} did not report ready after relinking`);
  };

  const setAsset = async (assetPath) => {
    const offset = (await readFile(obsLogPath, "utf8")).length;
    await client.request("SetInputSettings", {
      inputUuid: source.inputUuid,
      inputSettings: { asset_path: assetPath },
      overlay: true
    });
    await waitForReady(offset, source.inputUuid);
    await delay(1_000);
  };

  const capture = async (fileName) => {
    const response = await client.request("GetSourceScreenshot", {
      sourceUuid: source.inputUuid,
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

  try {
    await client.connect();
    const version = await client.request("GetVersion");
    report.version = {
      obsVersion: version.obsVersion,
      obsWebSocketVersion: version.obsWebSocketVersion,
      rpcVersion: version.rpcVersion
    };
    const inputs = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
    source = inputs.inputs?.find((input) => !input.inputName.startsWith("obs-3dgs-"));
    if (!source)
      throw new Error("No stable obs_3dgs_source is available for missing-file testing");
    const response = await client.request("GetInputSettings", { inputUuid: source.inputUuid });
    const currentAssetPath = response.inputSettings.asset_path;
    if (typeof currentAssetPath !== "string" || currentAssetPath.length === 0)
      throw new Error("The missing-file source does not have a configured asset");

    if (mode === "prepare") {
      originalAssetPath = currentAssetPath;
      assertWorkspacePath(projectRoot, originalAssetPath, "source asset");
      await copyFile(originalAssetPath, missingPath);
      await setAsset(missingPath);
      const prepared = await client.request("GetInputSettings", { inputUuid: source.inputUuid });
      if (prepared.inputSettings.asset_path !== missingPath)
        throw new Error("OBS did not persist the temporary asset path before restart");
      await writeFile(statePath, `${JSON.stringify({
        sourceUuid: source.inputUuid,
        originalAssetPath,
        missingPath,
        relocatedPath
      }, null, 2)}\n`, "utf8");
      report.source = {
        inputName: source.inputName,
        inputUuid: source.inputUuid,
        originalFileName: path.basename(originalAssetPath)
      };
      report.checks.prepared = {
        passed: true,
        temporaryFileName: path.basename(missingPath),
        stateFileName: path.basename(statePath)
      };
      report.nextStep = `Stop OBS, move ${path.basename(missingPath)} to ${path.basename(relocatedPath)}, then run recover`;
    } else {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      for (const [name, value] of Object.entries({
        originalAssetPath: state.originalAssetPath,
        missingPath: state.missingPath,
        relocatedPath: state.relocatedPath
      })) {
        if (typeof value !== "string")
          throw new Error(`Restart state is missing ${name}`);
        assertWorkspacePath(projectRoot, value, name);
      }
      originalAssetPath = state.originalAssetPath;
      if (source.inputUuid !== state.sourceUuid)
        throw new Error("The source UUID changed across the OBS restart");
      try {
        await stat(state.missingPath);
        throw new Error("The test asset still exists at the path that should be missing");
      } catch (error) {
        if (error?.code !== "ENOENT")
          throw error;
      }
      if (!(await stat(state.relocatedPath)).isFile())
        throw new Error("The relocated test asset is unavailable");
      if (currentAssetPath !== state.missingPath)
        throw new Error("OBS did not retain the missing asset path across restart");
      await delay(2_000);
      const missingScreenshot = await capture("missing-path.png");
      await setAsset(state.relocatedPath);
      const relocatedScreenshot = await capture("relocated.png");
      await setAsset(originalAssetPath);
      const restoredScreenshot = await capture("restored-original.png");
      if (relocatedScreenshot.sha256 !== restoredScreenshot.sha256)
        throw new Error("Relocated and restored copies rendered differently");
      report.source = {
        inputName: source.inputName,
        inputUuid: source.inputUuid,
        originalFileName: path.basename(originalAssetPath)
      };
      report.checks.missingPathPersisted = {
        passed: true,
        missingFileName: path.basename(state.missingPath),
        screenshot: missingScreenshot
      };
      report.checks.relinkedAndRestored = {
        passed: true,
        relocatedFileName: path.basename(state.relocatedPath),
        relocated: relocatedScreenshot,
        restored: restoredScreenshot
      };
    }
    report.completedAt = new Date().toISOString();
  } catch (error) {
    primaryError = error;
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (mode === "recover" && source && originalAssetPath) {
      try {
        const settings = await client.request("GetInputSettings", { inputUuid: source.inputUuid });
        if (settings.inputSettings.asset_path !== originalAssetPath)
          await setAsset(originalAssetPath);
      } catch (error) {
        report.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    client.close();
    report.passed = mode === "prepare"
      ? Boolean(report.checks.prepared) && report.failures.length === 0
      : Boolean(report.checks.missingPathPersisted && report.checks.relinkedAndRestored) && report.failures.length === 0;
    const reportPath = path.join(outputDirectory, `${mode}-report.json`);
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
