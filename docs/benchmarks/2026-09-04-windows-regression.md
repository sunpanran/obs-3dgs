# Windows continuation regression (2026-09-04)

Environment: isolated portable OBS 32.2.2 on Windows, RTX 4090, Spark 2.1.0, Three.js 0.180.0.

- Camera angles wrap to the UI range without changing direction: 803.45° → 83.45° produced identical 1280×720 PNG hashes. [Before](data/2026-09-04-angle-before.json), [after](data/2026-09-04-angle-after.json).
- Native Qt tests cover unfinished numeric edits across 100 polls, dragging, queued edits retaining their source, preset browsing, and external preset updates.
- PLY, Compressed PLY, SPZ, SOG, SPLAT, KSPLAT, and ZIP render in real OBS. Every format rejects truncated/corrupt replacements while restoring its prior path and exact rendered pixels: 21 checks. [Format report](data/2026-09-04-windows-formats.json).
- Native PLY validation now accounts for chunk, vertex, and SH payload sizes together; chunk bytes cannot conceal missing vertex bytes.
- Sixteen real HTTP/OBS checks cover HEAD, byte ranges, missing/incorrect tokens, directory access, traversal, malformed events, wrong field types, the 64 KiB limit, and host responsiveness. [Server report](data/2026-09-04-windows-server.json).

Native validation errors previously covered an otherwise intact live scene with a persistent error card. With an existing valid model, the output now stays intact and the native properties/Dock retain the error; an empty source still shows an error card.

Reproduce with `format-grid.ply` prefilled by the test script in a new 1280×720 source: target (0,0,0), yaw 35°, pitch -12°, roll 0°, distance 4.2, focal length 35 mm, default scene transform, and Balanced quality. Replace it with the first half of its bytes. Screenshots are 640×360 source captures.

| Before | After |
|---|---|
| ![Error covering the retained scene](assets/format-grid-rejected-before.png) | ![Retained scene stays intact](assets/format-grid-rejected-after.png) |

## CEF frame preflight

The new opt-in bounded recorder captures timestamps for actual render callbacks separately from CPU submission durations. CPU submission time is not GPU execution time. Previously recorded OBS average compositor times cannot establish a renderer frame P95.

| Workload | Average | Frame-interval P95 |
|---|---:|---:|
| 30 seconds of camera motion | 60.0024 FPS | 16.7 ms |
| 10-second recording preflight | 60.0020 FPS | 16.7 ms |

An additional ten-second static observation recorded no extra draws or sorts and no scheduled renderer/sort work. Motion uses native camera updates at 20 Hz, a ±10° sinusoidal yaw, and the exact baseline pose/asset/output settings stored in the reports. [Renderer report](data/2026-09-04-renderer-preflight.json), [recording preflight](data/2026-09-04-renderer-recording-preflight.json). These short runs do not replace the separate 30-minute gate.

Run the dedicated OBS instance with `--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1`; set `OBS_WEBSOCKET_PASSWORD` and `OBS_LOG_PATH` locally, then use `npm run test:obs:formats`, `npm run test:obs:server`, or `npm run test:obs:renderer -- --duration-seconds 1800 --record true`. Restart the dedicated instance without debugging afterward.

The [RAD supplement](data/2026-09-04-windows-rad.json) passed rendering, truncation and corruption recovery using an independently written single-file F32 grid, bringing coverage to eight formats/variants and 24 cases. Small fixtures do not cover all exporter variants. Component tests do not replace frontend Duplicate, property Cancel, hotkey-binding, or full Dock manual acceptance. Apple M1 still requires hardware testing.

References: [OBS CEF debugging](https://github.com/obsproject/obs-studio/wiki/Browser-source-development-and-debugging), [SparkRenderer](https://sparkjs.dev/docs/spark-renderer/).

The [wide and close-view 30-minute recording gates](2026-09-04-windows-renderer-performance.md) have both passed. The [native contract report](data/2026-09-04-native-contracts.json) additionally covers 100 real source duplicates, private navigation-state copying/isolation, and the clear + update cancellation path used by OBS properties. Load `tests/e2e/obs-native-contracts.lua` only in a dedicated profile after creating `output/obs-native-contracts/`.
