<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS behavior regression — 2026-09-03

[简体中文](2026-09-03-windows-obs-behavior.zh-CN.md)

Status: passed the automated live-lock, preset/hotkey exception, transparent-compositing, failed-staging recovery, and latest-selection cancellation checks.

| Check | Evidence |
|---|---|
| Host | Windows 10.0.26200, OBS 32.2.2 portable, NVIDIA GeForce RTX 4090 |
| Plugin DLL | SHA-256 `E32C398B0A00E073C91C03C3E90BB1B8AF73712C5CE3D42E6FD23F16687DEFB2` |
| Live safety lock | Blocked changes to exposure, focal length, scene scale, camera yaw, and background mode |
| Hotkeys while locked | All seven source hotkeys registered; reset camera remained blocked, while previous/next and direct preset hotkeys applied saved cameras |
| Transparent composition | The same OBS scene changed from opaque black to the underlying light-gray Color Source; the two captures have different hashes |
| Failed staging | A deliberately invalid SOG passed the native signature check, failed in Spark, and triggered automatic rollback |
| Recovery | The asset path returned to Knock Community Hall and the before/after source screenshots have identical SHA-256 `880aac9042aaa4a8e8cad48de6cb5bfd44b3c20a212874eee93e4897ea292dae` |
| Latest selection wins | Load A was superseded after 100 ms by load B; no stale runtime error was emitted, B became the saved path, and the restored frame matched exactly |
| Independent instances | A second loaded source changed its camera, focal length, exposure, and preset JSON without changing the original source or frame; cleanup left no copied input |
| Staging high-water | A repeated replacement/cancellation pass reduced total private memory from about 3.70 GiB to 3.56 GiB; memory moved between renderer and GPU processes without linear growth |

Evidence:

- [Machine-readable behavior report](data/2026-09-03-windows-behavior.json)
- [Machine-readable copy-isolation report](data/2026-09-03-windows-copy-isolation.json)
- [Opaque composite](assets/knock-community-hall-composite-opaque.png)
- [Transparent composite](assets/knock-community-hall-composite-transparent.png)
- [Independently modified copy](assets/knock-community-hall-copy-after.png)

Command:

```powershell
npm run test:obs:behavior -- --url ws://127.0.0.1:4456 --obs-log <active-obs-log> --output output/obs-behavior
```

This covers representative locked fields, preset-related hotkey exceptions, failed replacement, successful replacement, and cancellation of a superseded request. Editing hotkey bindings in OBS remains a separate manual UI check.

The copy-isolation test creates a second input from the original settings because obs-websocket does not expose OBS's **Paste (Duplicate)** frontend action. It proves independent native/runtime state; the menu action and private UI-page state copy remain manual frontend checks.
