<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS properties smoke test — 2026-09-03

[简体中文](2026-09-03-windows-obs-properties-smoke.zh-CN.md)

Status: passed exploratory manual testing. This is not the 30-minute performance or 100-cycle lifecycle release gate.

| Item | Evidence |
|---|---|
| Host | Windows 10.0.26200, OBS 32.2.2 portable, NVIDIA GeForce RTX 4090 |
| Plugin DLL | SHA-256 `A56FE0950637D37A069476510FDF3D82F57D69A5F336F4CBD3BF7DB253C5C4E0` |
| Scene | Knock Community Hall SOG, CC BY 4.0 |
| Runtime | Loopback server started; Spark reported 2,487,137 LOD splats through ANGLE/D3D11 |
| User result | No issue found while manually testing the categorized source properties |
| Error result | No `obs-3dgs` runtime error in the corresponding OBS log |
| UI-state isolation | Last page `display` and advanced-camera state were saved only in source `private_settings`; neither key appeared in regular renderer settings |

The smoke test covered the real OBS source properties after introducing the six-page selector, per-source page memory, advanced-camera reveal, conditional field visibility, and granular live-lock UI. Remaining release work is listed in the main testing document.
