// SPDX-License-Identifier: GPL-2.0-or-later
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ObsWebSocketClient } from "./obs-websocket-client.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "output/obs-formats");
const logPath = process.env.OBS_LOG_PATH;
assert(logPath && process.env.OBS_WEBSOCKET_PASSWORD, "Set OBS_LOG_PATH and OBS_WEBSOCKET_PASSWORD");
const client = new ObsWebSocketClient({ url: process.env.OBS_WEBSOCKET_URL ?? "ws://127.0.0.1:4456", password: process.env.OBS_WEBSOCKET_PASSWORD });
const report = { startedAt: new Date().toISOString(), cases: [], failures: [] };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const created = new Set();
await mkdir(output, { recursive: true });
await copyFile(path.join(root, "public/samples/knock-community-hall.sog"), path.join(output, "hall.zip"));
const files = ["format-grid.ply", "format-grid-compressed.ply", "format-grid.spz", "knock-community-hall.sog",
  "format-grid.splat", "format-grid.ksplat", "hall.zip"];
try {
  await client.connect();
  const { currentProgramSceneName: sceneName } = await client.request("GetCurrentProgramScene");
  for (const filename of files) {
    const assetPath = filename === "hall.zip" ? path.join(output, filename) : path.join(root, "public/samples", filename);
    const bytes = await readFile(assetPath);
    const row = { filename, bytes: bytes.length, sha256: hash(bytes), checks: {} };
    report.cases.push(row);
    let inputUuid;
    try {
      ({ inputUuid } = await client.request("CreateInput", { sceneName, inputName: `obs-3dgs-formats-${Date.now()}`,
        inputKind: "obs_3dgs_source", inputSettings: { asset_path: assetPath, follow_canvas: false, output_width: 1280, output_height: 720 }, sceneItemEnabled: true }));
      created.add(inputUuid);
      const readyMessage = `Scene ready for source ${inputUuid} (`;
      const errorMessage = `Runtime error for source ${inputUuid} (`;
      const start = performance.now();
      let ready = false;
      while (performance.now() - start < 60_000) {
        const log = await readFile(logPath, "utf8");
        if (log.includes(errorMessage)) throw new Error("Valid asset produced a runtime error");
        if (log.includes(readyMessage)) { ready = true; break; }
        await delay(250);
      }
      assert(ready, "Valid asset did not become ready");
      row.loadMs = performance.now() - start;
      await delay(1500);
      row.settings = (await client.request("GetInputSettings", { inputUuid })).inputSettings;
      delete row.settings.asset_path;
      const screenshot = async (name) => {
        const response = await client.request("GetSourceScreenshot", { sourceUuid: inputUuid, imageFormat: "png", imageWidth: 640, imageHeight: 360 });
        const data = Buffer.from(response.imageData.split(",")[1], "base64");
        await writeFile(path.join(output, name), data);
        return hash(data);
      };
      row.screenshot = `${filename}.png`;
      row.screenshotSha256 = await screenshot(row.screenshot);
      row.checks.valid = true;
      for (const mutation of ["truncated", "corrupt"]) {
        const invalidPath = path.join(output, `${mutation}-${filename}`);
        // SPLAT has no count header: half the records would still be a valid smaller scene.
        const truncatedLength = filename.endsWith(".splat") ? bytes.length - 1 : Math.floor(bytes.length / 2);
        await writeFile(invalidPath, mutation === "truncated" ? bytes.subarray(0, truncatedLength) : Buffer.alloc(17, 0xFF));
        const previousLog = (await readFile(logPath, "utf8")).length;
        await client.request("SetInputSettings", { inputUuid, inputSettings: { asset_path: invalidPath }, overlay: true });
        await delay(100);
        const duringSha256 = await screenshot(`during-${mutation}-${filename}.png`);
        assert.equal(duringSha256, row.screenshotSha256, `${mutation} replacement obscured the live scene during recovery`);
        let restored = false;
        for (let attempt = 0; attempt < 180; attempt++) {
          await delay(250);
          const settings = (await client.request("GetInputSettings", { inputUuid })).inputSettings;
          if (settings.asset_path === assetPath) { restored = true; break; }
        }
        assert(restored, `${mutation} asset did not restore the previous valid path`);
        // Runtime rollback reloads the previous model; native rejection keeps it immediately.
        const logDelta = (await readFile(logPath, "utf8")).slice(previousLog);
        if (logDelta.includes(errorMessage)) {
          for (let attempt = 0; attempt < 120; attempt++) {
            if ((await readFile(logPath, "utf8")).slice(previousLog).includes(readyMessage)) break;
            await delay(250);
          }
        }
        await delay(2000);
        row.checks[mutation] = { restoredPath: true, screenshotSha256: await screenshot(`${mutation}-${filename}.png`) };
        assert.equal(row.checks[mutation].screenshotSha256, row.screenshotSha256, `${mutation} asset changed the retained scene pixels`);
      }
      row.passed = true;
    } catch (error) {
      row.passed = false;
      row.error = error.message;
      report.failures.push(`${filename}: ${error.message}`);
    } finally {
      if (inputUuid) {
        await client.request("RemoveInput", { inputUuid });
        created.delete(inputUuid);
      }
    }
    console.log(`${filename}: ${row.passed ? "passed" : row.error}`);
  }
} finally {
  for (const inputUuid of created) await client.request("RemoveInput", { inputUuid }).catch(() => {});
  client.close();
  report.passed = report.failures.length === 0;
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, "formats-report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (!report.passed) process.exitCode = 1;
