# obs-3dgs

[简体中文](README.zh-CN.md)

`obs-3dgs` is an open-source OBS input source for using a local 3D Gaussian Splatting scene as a live background. It combines a small native OBS/Qt wrapper with the [Spark](https://github.com/sparkjsdev/spark) WebGL2 renderer, so the project does not reimplement Gaussian parsing, sorting, or LOD.

> Status: `0.1.0-beta.1` candidate. Windows x64 and macOS Universal pass CI builds, automated tests and packaging; Windows also has real OBS regression evidence. The release remains a draft pending Apple M1 hardware and remaining frontend acceptance.

## What it does

- Adds `3DGS Scene` to OBS Sources.
- Loads one local static PLY, compressed PLY, SPZ, SOG, SPLAT, KSPLAT, ZIP, or RAD asset.
- Keeps a valid scene visible while a replacement loads.
- Provides scene transform, full-frame focal length, orbit/pan/dolly interaction, display controls, LOD quality presets, camera presets, and OBS hotkeys.
- Provides a compact native `3DGS Live Control` dock without duplicating the render preview.
- Supports English and Simplified Chinese.
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
