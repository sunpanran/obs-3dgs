<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS missing-file recovery — 2026-09-03

[简体中文](2026-09-03-windows-obs-missing-file.zh-CN.md)

Status: passed startup persistence and relinking in an isolated OBS scene collection.

| Item | Evidence |
|---|---|
| Host | Windows 10.0.26200, OBS 32.2.2 portable, NVIDIA GeForce RTX 4090 |
| Plugin DLL | SHA-256 `E32C398B0A00E073C91C03C3E90BB1B8AF73712C5CE3D42E6FD23F16687DEFB2` |
| Saved collection | The active collection was saved by switching to a temporary collection and back; the source UUID remained unchanged |
| Missing at startup | The selected SOG was moved before restart; OBS retained its saved path and the source displayed the localized unreadable-file state |
| Relink | Selecting the moved SOG loaded the scene successfully, then the test restored the original repository sample |
| Visual equality | Relocated and restored-original screenshots have identical SHA-256 `880aac9042aaa4a8e8cad48de6cb5bfd44b3c20a212874eee93e4897ea292dae` |

The implementation now queries the persisted `asset_path` in its OBS missing-files callback even when no asset could become active during startup. This fixes the previous case where a missing-on-startup source had an empty runtime path and was omitted from OBS missing-file discovery.

Evidence:

- [Machine-readable recovery report](data/2026-09-03-windows-missing-file.json)
- [Missing-path source state](assets/knock-community-hall-missing-path.png)
- [Relinked source](assets/knock-community-hall-relinked.png)

Commands are split around the required OBS restart:

```powershell
npm run test:obs:missing-file -- --mode prepare --url ws://127.0.0.1:4456 --obs-log <active-obs-log> --output output/obs-missing-file
npm run test:obs:missing-file -- --mode recover --url ws://127.0.0.1:4456 --obs-log <new-obs-log> --output output/obs-missing-file
```

The automatic test exercises the same settings update used by the missing-file callback. Clicking through OBS's Missing Files dialog remains a manual frontend check.
