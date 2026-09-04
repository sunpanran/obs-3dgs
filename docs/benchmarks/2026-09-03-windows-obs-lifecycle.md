<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS lifecycle test — 2026-09-03

[简体中文](2026-09-03-windows-obs-lifecycle.zh-CN.md)

Status: passed the automated empty-source and loaded-scene lifecycle gates.

| Item | Evidence |
|---|---|
| Host | Windows 10.0.26200, OBS 32.2.2 portable, NVIDIA GeForce RTX 4090 |
| Plugin DLL | SHA-256 `7409C89529C70C31C80BE5B3D405E8E1AC74FF06097A277FC3EE51A4F684CEFF` |
| Scene | Knock Community Hall SOG, 29,768,772 bytes, 2,487,137 splats, CC BY 4.0 |
| Empty-source cycles | 100 create/remove cycles, zero residual inputs, zero rendered-frame drops |
| Empty-source memory | 346.54 MB baseline, 348.30 MB after the five-second settle window; +1.76 MB |
| Browser processes | Five isolated `obs-browser-page` processes before and after the 100-cycle test |
| Loaded cycles | 20 create/select-file/ready/remove cycles; mean 10.06 s, P95 10.29 s to `Scene ready` |
| Loaded-cycle memory | 316.57 MB baseline, 216.44 MB after the final settle window; no sustained growth |
| Loaded-cycle rendering | Zero rendered-frame drops; first and last screenshots have the same SHA-256 |

The first high-speed empty-source run exposed a real lifecycle problem: every disabled source started a private Browser Source immediately, leaving CEF page initialization queued after removal. The source now creates its private browser only when it is shown, explicitly reloaded, or already owns a browser. It also declares OBS composite-source capability and supplies a video-only, no-audio mix callback. Repeating the same 100-cycle run kept the CEF process count at its five-process baseline.

Reproducible machine-readable results:

- [Empty-source lifecycle data](data/2026-09-03-windows-empty-lifecycle.json)
- [Loaded-scene lifecycle data](data/2026-09-03-windows-loaded-lifecycle.json)
- [Loaded-cycle screenshot](assets/knock-community-hall-loaded-lifecycle.png)

Commands:

```powershell
npm run test:obs:lifecycle -- --url ws://127.0.0.1:4456 --cycles 100 --output output/obs-integration
npm run test:obs:loaded-lifecycle -- --url ws://127.0.0.1:4456 --cycles 20 --obs-log <active-obs-log> --output output/obs-loaded-lifecycle
```

The WebSocket password is supplied through `OBS_WEBSOCKET_PASSWORD` and is never written to the reports.
