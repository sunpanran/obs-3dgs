# Manual release acceptance

See [testing](testing.md) for automated evidence. Unchecked items below require the actual OBS frontend or specified hardware and are not recorded as passed.

Record results separately for Windows and macOS. After all seven Windows frontend checks below pass, `0.1.0-beta.1` may be published with an explicit statement in the README and release notes that macOS has not been tested in OBS on a physical Mac. Apple Silicon checks remain pending and may follow this beta; RTX 4060 is a later Stable gate. The [Chinese walkthrough](manual-acceptance.zh-CN.md) includes setup instructions and a feedback template.

On 2026-09-04, the user confirmed the fix1 hotkey and missing-file checks, then completed validation of fix2 grouped-source handling and the Dock layout. Windows manual acceptance is recorded as passed. The final removal of the language selector is covered by build and regression checks. Checked rows apply to Windows only; macOS hardware validation remains pending.

- [x] Use frontend Copy → Paste (Duplicate), verify private page/advanced-camera state, then change the copy without changing its original. The underlying API has 100-cycle coverage.
- [x] Edit camera, exposure and scene position in properties, then Cancel. Rendering must revert and the last browsed page must persist. The libobs cancellation path has automated coverage; verify the actual dialog buttons and close confirmation here.
- [x] Synchronize 85/35 mm changes across properties, Dock and interactive view, including unfinished numeric edits and source switching.
- [x] With live safety lock enabled, protected controls remain disabled while saved presets and page navigation work.
- [x] Bind and physically trigger a preset hotkey through OBS Settings, including while locked.
- [x] Move the sample while OBS is closed, then relink it through the frontend Missing Files dialog.
- [x] Composite behind a camera and exercise transparency with common filters.

## Apple Silicon

- [ ] Install the Universal bundle on a real Mac and verify plugin loading in OBS.
- [ ] On M1: 1920×1080 at 30 FPS, render scale 75%, 1M LOD budget and SH2. Changing Balanced's 60 FPS to 30 labels the preset Custom; retain the other Balanced values.
- [ ] With the fixed public fixture/camera, measure average ≥29 FPS, frame-interval P95 ≤36 ms and OBS render skips <0.5%. Retain raw timestamps, screenshot, settings and device information.
- [ ] Verify idle rendering/sorting and repeat load/unload stability.

CI compilation alone is not hardware acceptance. RTX 4060 performance gates Stable; M2+ 1080p60 is a non-blocking target. RAD has single-file smoke coverage; large scenes and external multi-file chunks are outside that fixture.

After configuring the dedicated Simple Output profile at 30 FPS and selecting an available macOS recording encoder, run:

```text
npm run test:obs:renderer -- --duration-seconds 60 --record true --gate apple-m1 --pose docs/benchmarks/data/knock-community-hall-close-camera.json
```

The gate checks the actual GPU, numeric quality profile, raw-frame coverage and recording. M1 Pro/Max and software renderers do not qualify as base M1 evidence. Set the local WebSocket password through the environment.
