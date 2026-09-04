# Testing

Run web checks with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Native validation tests run through CTest after a CMake build.

Rendering evidence must identify the scene, camera pose, focal length, output resolution, render scale, quality preset, GPU, average FPS, P95 frame time, and screenshot. Do not compare two captures made with different camera or quality state.

The current renderer-only preflight is recorded in [Windows Web renderer preflight](benchmarks/2026-09-03-windows-web-preflight.md). It does not replace the OBS integration gate below.

The categorized source-properties UI passed a real OBS exploratory smoke test recorded in [Windows OBS properties smoke test](benchmarks/2026-09-03-windows-obs-properties-smoke.md).

The automated [Windows OBS lifecycle test](benchmarks/2026-09-03-windows-obs-lifecycle.md) completed 100 empty-source create/remove cycles and 20 SOG load/remove cycles. The [Windows OBS static recording check](benchmarks/2026-09-03-windows-obs-performance.md) ran for 30 minutes with zero counted render/output drops; it did not measure individual renderer frame P95. Main-process working-set observations do not establish absence of browser/GPU memory leaks.

The automated [Windows OBS behavior regression](benchmarks/2026-09-03-windows-obs-behavior.md) passed representative live-lock fields, saved-preset hotkey exceptions, transparent compositing, failed-load rollback, successful staging, and latest-selection cancellation.

The automated [Windows OBS missing-file recovery](benchmarks/2026-09-03-windows-obs-missing-file.md) retained a missing path across collection save and restart, recovered from a relocated copy, and restored the original sample.

The [2026-09-04 continuation regression](benchmarks/2026-09-04-windows-regression.md) adds seven-format rendering/truncation/corruption checks, live HTTP boundaries, Dock edit-component tests, and angle round trips. A CEF preflight measured 16.7 ms frame-interval P95 and verified no draws/sorts while static. The combined long recording/frame test is a separate gate.

The real libobs API passed 100 duplicate cycles, private UI-state isolation, and the same cancellation calls used by OBS properties. [Native contract report](benchmarks/data/2026-09-04-native-contracts.json). [Long frame/recording evidence](benchmarks/2026-09-04-windows-renderer-performance.md) retains raw frame data.

The [manual checklist](manual-acceptance.md) separately retains actual frontend menus/buttons, full Dock synchronization, Missing Files dialog and physical hotkey binding. API tests do not claim those clicks were performed. The [single-file RAD fixture](benchmarks/data/2026-09-04-windows-rad.json) also passed rendering, truncation and corruption recovery; external multi-file chunks are not covered. Apple M1 must reach average ≥29 FPS and P95 ≤36 ms at Balanced 1080p30.

The RTX 4060 8 GB gate blocks Stable, not the first beta. M2+ 1080p60 is a target, not a beta blocker.
