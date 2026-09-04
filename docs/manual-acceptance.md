# Manual release acceptance

See [testing](testing.md) for automated evidence. Unchecked items below require the actual OBS frontend or specified hardware and are not recorded as passed.

- [ ] Use frontend Copy → Paste (Duplicate), verify private page/advanced-camera state, then change the copy without changing its original. The underlying API has 100-cycle coverage.
- [ ] Edit camera, exposure and scene position in properties, then Cancel. Rendering must revert and the last browsed page must persist. The libobs cancellation path has automated coverage; verify the actual dialog buttons and close confirmation here.
- [ ] Synchronize 85/35 mm changes across properties, Dock and interactive view, including unfinished numeric edits and source switching.
- [ ] With live safety lock enabled, protected controls remain disabled while saved presets and page navigation work.
- [ ] Bind and physically trigger a preset hotkey through OBS Settings, including while locked.
- [ ] Move the sample while OBS is closed, then relink it through the frontend Missing Files dialog.
- [ ] Composite behind a camera and exercise transparency with common filters.

## Apple Silicon

- [ ] Install the Universal bundle on a real Mac and verify plugin loading in OBS.
- [ ] On M1: 1920×1080 at 30 FPS, render scale 75%, 1M LOD budget and SH2. Changing Balanced's 60 FPS to 30 labels the preset Custom; retain the other Balanced values.
- [ ] With the fixed public fixture/camera, measure average ≥29 FPS, frame-interval P95 ≤36 ms and OBS render skips <0.5%. Retain raw timestamps, screenshot, settings and device information.
- [ ] Verify idle rendering/sorting and repeat load/unload stability.

CI compilation alone is not hardware acceptance. RTX 4060 performance gates Stable; M2+ 1080p60 is a non-blocking target. Valid RAD rendering remains unverified.

After configuring the dedicated Simple Output profile at 30 FPS and selecting an available macOS recording encoder, run:

```text
npm run test:obs:renderer -- --duration-seconds 60 --record true --gate apple-m1 --pose docs/benchmarks/data/knock-community-hall-close-camera.json
```

The gate checks the actual GPU, numeric quality profile, raw-frame coverage and recording. M1 Pro/Max and software renderers do not qualify as base M1 evidence. Set the local WebSocket password through the environment.
