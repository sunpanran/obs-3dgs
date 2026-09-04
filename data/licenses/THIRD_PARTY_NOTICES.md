# Third-party notices

The following components are used by `obs-3dgs`:

| Component | Pinned version | License | Use |
|---|---:|---|---|
| Spark | 2.1.0 | MIT | Gaussian loading, sorting, LOD, rendering |
| Three.js | 0.180.0 | MIT | WebGL scene and camera layer |
| fflate | 0.8.3 | MIT | Compression code bundled by Spark |
| cpp-httplib | 0.51.0 | MIT | Loopback-only local HTTP server |
| JSON for Modern C++ | 3.12.0 | MIT | Native control messages and presets |
| OBS Studio APIs | Windows 32.2.2 / macOS 32.1.2 | GPL-2.0-or-later | Host integration |
| Qt | OBS-provided Qt 6 | LGPL-3.0/GPL-3.0 commercial alternatives | Native UI, dynamically linked through OBS |

The complete MIT license texts for the five bundled libraries are adjacent to this file. OBS and Qt binaries are not redistributed by this repository's plugin ZIP; the plugin uses the copies supplied by the user's OBS installation.

The official OBS Plugin Template build modules were adapted under GPL-2.0.

Packaged documentation includes rendered benchmark images of Knock Community Hall by scbenoit (CC BY 4.0). Their source, license and modification credits are preserved in `docs/benchmarks/assets/ATTRIBUTION.md` inside each package. The model itself is not bundled.
