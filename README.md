# obs-3dgs

[简体中文](README.zh-CN.md)

`obs-3dgs` is an open-source OBS input source for using a local 3D Gaussian Splatting scene as a live background. It combines a small native OBS/Qt wrapper with the [Spark](https://github.com/sparkjsdev/spark) WebGL2 renderer, so the project does not reimplement Gaussian parsing, sorting, or LOD.

> Version: `0.1.0-beta.1` beta. Windows has automated checks and user acceptance. **macOS has not been tested in OBS on a physical Mac**; its current evidence covers CI builds and automated tests.

## Download and install

Published packages for both platforms are available on the same [GitHub Releases page](https://github.com/sunpanran/obs-3dgs/releases). Open a version and expand **Assets**, then select the ZIP for your system:

| System | Plugin package |
|---|---|
| Windows x64 | `obs-3dgs-0.1.0-beta.1-windows-x64.zip` |
| macOS, Apple Silicon or Intel | `obs-3dgs-0.1.0-beta.1-macos-universal.zip` |

Use the named plugin ZIP for installation. GitHub's **Source code** archives are for development. Each plugin ZIP has a matching `.sha256` checksum file and an SBOM. Installing a package requires OBS Studio; Node.js and the build tools below are only needed for development.

### Windows

The current real-machine test environment is Windows 11 x64 with OBS Studio 32.2.2.

1. Close OBS Studio and extract the Windows ZIP.
2. Paste `C:\ProgramData\obs-studio\plugins\` into File Explorer's address bar. Create the directory if it does not exist.
3. Copy the entire extracted **`obs-3dgs` folder** into that directory, keeping its `bin` and `data` folders together.
4. Check that the DLL is at `C:\ProgramData\obs-studio\plugins\obs-3dgs\bin\64bit\obs-3dgs.dll`.
5. Start OBS, click **Sources → + → 3DGS Scene**, and create a source.

### macOS

The Universal package contains both Apple Silicon and Intel code. **Installation, OBS loading, rendering and performance have not yet been verified on a physical Mac.**

1. Close OBS Studio and extract the macOS ZIP.
2. In Finder, press **Command + Shift + G** and enter `~/Library/Application Support/obs-studio/plugins/`. Create the directory if it does not exist.
3. Copy the extracted **`obs-3dgs.plugin` bundle** into that directory.
4. Start OBS, click **Sources → + → 3DGS Scene**, and create a source.

The beta uses ad-hoc signing and has no Apple Developer ID signature or notarization. macOS may block the first load; see the [installation notes](docs/install.md) and [troubleshooting](docs/troubleshooting.md).

### Load a test scene

1. Download [Knock Community Hall (`.sog`, about 30 MB)](https://media.githubusercontent.com/media/sunpanran/obs-3dgs/main/public/samples/knock-community-hall.sog). The scene is separate from the plugin package; keep the `.sog` file as downloaded.
2. Open the **3DGS Scene** source properties, select the local scene file and wait for it to load.
3. Click **Open live control dock** in the source properties, then click OK to close the properties window and adjust the camera in **3DGS Live Control**. To use it as a background, place the source below your camera source in OBS.

The dock has **Camera / Scene / Presets** tabs. To save a camera view, open **Presets → Save Current** and enter a name. Select a saved view and click Apply, or bind **3DGS: Camera Preset 1–4** for that source under **OBS Settings → Hotkeys**. The millimetre shortcuts on the Camera tab change focal length.

Automatic source selection follows 3DGS sources inside groups and nested groups. Selecting a group containing one 3DGS source also selects that source for control. If a group contains multiple 3DGS sources, expand it and select the intended source, or choose it explicitly in the dock's source dropdown.

The sample is **Knock Community Hall** by **scbenoit**, licensed under **CC BY 4.0**; see its [source and attribution](public/samples/README.md).

To update, close OBS and replace the plugin folder or bundle with the newly extracted version. To uninstall, close OBS and remove that folder or bundle. Your scene collections and camera presets are stored by OBS. If the source does not appear or a scene fails to load, follow the [troubleshooting guide](docs/troubleshooting.md) and include your OS, OBS version and GPU in a report.

## What it does

- Adds `3DGS Scene` to OBS Sources.
- Loads one local static PLY, compressed PLY, SPZ, SOG, SPLAT, KSPLAT, ZIP, or RAD asset.
- Keeps a valid scene visible while a replacement loads.
- Provides scene transform, full-frame focal length, orbit/pan/dolly interaction, display controls, LOD quality presets, camera presets, and OBS hotkeys.
- Provides a compact native `3DGS Live Control` dock without duplicating the render preview.
- Serves only the selected asset through a token-protected, loopback-only HTTP endpoint.

Stable formats are PLY, compressed PLY, SPZ, and SOG. SPLAT, KSPLAT, ZIP, and RAD are experimental in the first beta.

PLY currently requires binary little-endian encoding. Eight formats/variants have real load/error-recovery evidence; RAD coverage uses a minimal single-file fixture, not external multi-file chunks.

## Supported hosts

| Platform | Host |
|---|---|
| Windows | Windows 10/11 x64, OBS 32.0+ |
| macOS | Universal arm64+x86_64, deployment target macOS 12 |
| Linux | Not supported in 0.1 |

OBS 32.2.x itself no longer launches on macOS 12. Use OBS 32.1.2 on macOS 12, or OBS 32.2.2+ on a newer macOS release.

## Development

Requirements are Node.js 24+, npm, CMake 3.30+, Visual Studio 2022 Build Tools on Windows, or Xcode 16 on macOS.

```text
npm ci
npm run dev
npm run build
npm test
npm run lint
```

Native Windows build:

```powershell
cmake --preset windows-x64
cmake --build --preset windows-x64 --parallel
ctest --test-dir build_x64 -C RelWithDebInfo --output-on-failure
cmake --install build_x64 --config RelWithDebInfo --prefix dist/windows-x64
```

The CMake bootstrap verifies pinned dependencies: OBS 32.2.2 on Windows and the OBS 32.1.2 SDK on macOS to preserve the macOS 12 deployment target. cpp-httplib and nlohmann/json are also pinned. Downloaded dependencies stay in `.deps/` and are not committed.

The complete project lives in [sunpanran/obs-3dgs](https://github.com/sunpanran/obs-3dgs), with shared versions, CI, and releases for Windows and macOS.

See [architecture](docs/architecture.md), [Windows/macOS installation](docs/install.md), [testing](docs/testing.md), and [security](docs/security.md).

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting code or sensitive reports.

## License

The repository is licensed under `GPL-2.0-or-later`. Third-party components and sample assets retain their own licenses; see [third-party notices](data/licenses/THIRD_PARTY_NOTICES.md).
