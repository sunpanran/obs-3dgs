// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ObsWebSocketClient } from "./obs-websocket-client.mjs";

// Run against an isolated OBS copy, before and after installing the new DLL/web bundle.
const phase = process.argv[2];
assert(["before", "after"].includes(phase), "Expected before or after");
const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "output/obs-angle-roundtrip");
const instance = path.join(root, "tmp/obs-automated-32.2.2");
const logRoot = path.join(instance, "config/obs-studio/logs");
const logs = (await readdir(logRoot)).filter((name) => name.endsWith(".txt")).sort();
const logPath = path.join(logRoot, logs.at(-1));
const config = JSON.parse(await readFile(path.join(instance, "config/obs-studio/plugin_config/obs-websocket/config.json")));
const client = new ObsWebSocketClient({ url: `ws://127.0.0.1:${config.server_port}`, password: config.server_password });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(output, { recursive: true });
try {
  await client.connect();
  const { inputs } = await client.request("GetInputList", { inputKind: "obs_3dgs_source" });
  const source = inputs.find((input) => input.inputName === "3DGS 场景");
  assert(source, "Expected the existing isolated 3DGS source");
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if ((await readFile(logPath, "utf8")).includes(`Scene ready for source ${source.inputUuid} (`)) {
      ready = true;
      break;
    }
    await delay(500);
  }
  assert(ready, "Scene did not report ready");
  await delay(3000);
  const { inputSettings: settings } = await client.request("GetInputSettings", { inputUuid: source.inputUuid });
  const { imageData } = await client.request("GetSourceScreenshot", {
    sourceUuid: source.inputUuid, imageFormat: "png", imageWidth: 1280, imageHeight: 720
  });
  const bytes = Buffer.from(imageData.split(",")[1], "base64");
  await writeFile(path.join(output, `${phase}.png`), bytes);
  const pose = Object.fromEntries(Object.entries(settings).filter(([key]) =>
    key.startsWith("camera_") && key !== "camera_presets_json" || ["focal_length_mm", "render_scale", "quality_preset",
      "position_x", "position_y", "position_z", "rotation_x", "rotation_y", "rotation_z", "scene_scale"].includes(key)));
  const report = {
    phase, testedAt: new Date().toISOString(), sourceUuid: source.inputUuid,
    asset: path.basename(settings.asset_path), assetSha256: digest(await readFile(settings.asset_path)),
    dllSha256: digest(await readFile(path.join(instance, "obs-plugins/64bit/obs-3dgs.dll"))),
    video: await client.request("GetVideoSettings"), pose, screenshotSha256: digest(bytes)
  };
  if (phase === "after") {
    const before = JSON.parse(await readFile(path.join(output, "before.json"), "utf8"));
    assert.equal(report.sourceUuid, before.sourceUuid);
    assert.equal(report.assetSha256, before.assetSha256);
    assert.deepEqual(report.video, before.video);
    for (const [key, value] of Object.entries(pose)) {
      if (["camera_yaw", "camera_roll"].includes(key)) {
        assert(value >= -180 && value < 180, `${key} outside UI range`);
        const delta = (value - before.pose[key]) / 360;
        assert(Math.abs(delta - Math.round(delta)) < 1e-10, `${key} changed camera direction`);
      } else {
        assert.deepEqual(value, before.pose[key], `${key} unexpectedly changed`);
      }
    }
    report.samePixels = report.screenshotSha256 === before.screenshotSha256;
    assert(report.samePixels, "Before/after screenshots differ; inspect before accepting");
  }
  await writeFile(path.join(output, `${phase}.json`), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  client.close();
}
