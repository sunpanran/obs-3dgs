// SPDX-License-Identifier: GPL-2.0-or-later

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  process.stderr.write("Run this script through `npm run sbom`.\n");
  process.exit(1);
}
const generated = spawnSync(process.execPath, [npmCli, "sbom", "--sbom-format", "cyclonedx"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024
});

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || "npm sbom failed\n");
  process.exit(generated.status ?? 1);
}

const sbom = JSON.parse(generated.stdout);
const spec = JSON.parse(readFileSync(new URL("../buildspec.json", import.meta.url), "utf8"));
const obsDependency = spec.dependencies["obs-studio"];
const obsVersion = process.platform === "darwin" ? obsDependency.versions.macos : obsDependency.version;
sbom.components ??= [];
sbom.components.push(
  {
    type: "library",
    name: "cpp-httplib",
    version: "0.51.0",
    licenses: [{ license: { id: "MIT" } }],
    purl: "pkg:github/yhirose/cpp-httplib@v0.51.0"
  },
  {
    type: "library",
    name: "JSON for Modern C++",
    version: "3.12.0",
    licenses: [{ license: { id: "MIT" } }],
    purl: "pkg:github/nlohmann/json@v3.12.0"
  },
  {
    type: "framework",
    name: "OBS Studio API",
    version: obsVersion,
    licenses: [{ license: { id: "GPL-2.0-or-later" } }],
    purl: `pkg:github/obsproject/obs-studio@${obsVersion}`
  }
);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/sbom.cdx.json", `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
process.stdout.write("Wrote dist/sbom.cdx.json\n");
