# Windows frontend recovery regression — 2026-09-04

[简体中文](2026-09-04-windows-frontend-recovery.zh-CN.md)

Manual testing on Windows 11 / OBS 32.2.2 exposed hidden live-control content and an OBS crash when applying a replacement in the Missing Files dialog. Automated regressions now pass; the user confirmed the menu/button retest passed in the [manual checklist](../manual-acceptance.md).

OBS already hides the outer dock when registering it. The plugin additionally hid the child QWidget, which stayed hidden when the outer dock was shown. Registration now leaves the contents available, and opening the panel restores both layers. The Qt regression checks visible preset controls and closing/reopening the dock.

The missing-file dispatcher passes `source->context.data` to the callback. The old code cast this plugin instance to `obs_source_t *`, matching the reported `OBSMissingFiles::saveFiles → obs_source_update → 0x3` crash. The callback now obtains the source handle from `Obs3dgsSource`. An explicit file-recovery confirmation is authorized once in both native and renderer state handling, preserves the saved camera and lock, and does not authorize subsequent ordinary edits.

Validation: strict Windows compilation, three CTest groups, 69 web tests, type checking, lint and production build passed. Thirteen web tests cover the recovery authorization boundary. The [Windows Lua regression](../../tests/e2e/obs-missing-file-callback.lua) calls the same `obs_missing_file_issue_callback` dispatcher as the real Missing Files dialog and passed all 33 checks in OBS with an RTX 4090. Relinking normally and while locked both reached real CEF/Spark scene-ready state; clearing the path also passed. The serialized path, source UUID, presets and private UI state were preserved.

Fixture: the repository's original GPL-2.0-or-later `format-grid.ply`, copied to a path with spaces and Chinese characters. Camera assertions retain 73 mm, distance 7.5, target X 1.2 and yaw 17 degrees, with exposure 1.25. Rendering used ANGLE / Direct3D 11 on RTX 4090. This is a loading/state regression, not a performance benchmark. [Result and tested hashes](data/2026-09-04-missing-file-callback.json).

To reproduce, use an isolated Windows OBS profile, create `tmp/obs-missing-callback-fixtures/` and `output/obs-missing-file-callback/`, and copy the fixture to `tmp/obs-missing-callback-fixtures/relocated 场景.ply`. Load the Lua test through OBS Tools → Scripts, wait for `output/obs-missing-file-callback/report.json` to report `passed: true`, then remove the script. It uses OBS's bundled LuaJIT FFI and cleans up its own sources. Earlier WebSocket-based file recovery bypassed the missing-file callback and did not cover this crash path.
