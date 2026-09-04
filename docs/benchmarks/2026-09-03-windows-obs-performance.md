<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS 1080p60 recording gate — 2026-09-03

[简体中文](2026-09-03-windows-obs-performance.zh-CN.md)

Status (reviewed 2026-09-04): passed a 30-minute static-background recording check. The complete RTX 4090 performance gate remains unverified.

| Item | Evidence |
|---|---|
| Host | Windows 10.0.26200, OBS 32.2.2 portable, NVIDIA GeForce RTX 4090 |
| Plugin DLL | SHA-256 `7409C89529C70C31C80BE5B3D405E8E1AC74FF06097A277FC3EE51A4F684CEFF` |
| Scene | Knock Community Hall SOG, 2,487,137 splats, CC BY 4.0 |
| Output | 1920×1080 at 60 FPS, SDR Rec.709, NVENC H.264 MKV |
| Plugin quality | Balanced: 75% internal scale (1440×810), 1,000,000 LOD budget, SH2 |
| Camera | 35 mm; yaw 83.45° (stored 803.45°), pitch 16°, roll 0°, distance 36.5913; target (79.7397, 10.7020, -47.7562) |
| Duration and sampling | Requested 1,800 s; measured 1,802.83 s; 360 samples at five-second intervals |
| FPS | Mean 60.0000, minimum 60.0000 |
| Samples of OBS average render time | Mean 0.2334 ms, P95 of averages 0.2722 ms, maximum average 0.3157 ms; not individual frame times |
| Render lag | 0 / 108,247 frames, 0% |
| Recording lag | 0 / 108,197 frames, 0% |
| Recording artifact | 190,101,104 bytes; SHA-256 `610A0A8077FA883F333011C7F7E9B53CD3D24FB4DDBF88F04FAA2A3B781A6C94` |

The original gate requires mean ≥58 FPS, individual-frame P95 ≤20 ms, and OBS render-lag drops <0.5%. This run proves sustained static OBS composition and recording with no counted drops. `GetStats.averageFrameRenderTime` is an average, so its sampled P95 cannot prove the individual-frame P95 requirement. No renderer frame/sort counter was collected in this run, and it cannot independently prove that rendering stopped when idle or measure interactive camera performance. The raw JSON is preserved; its historical `meetsRtx4090Gate` flag overstates the coverage and is superseded by this qualification. The collection script now reports static-recording results separately.

Evidence:

- [Full 360-sample report](data/2026-09-03-windows-performance-30m.json)
- [Scene screenshot captured immediately before recording](assets/knock-community-hall-obs-performance.png)

The 181.29 MiB MKV is intentionally excluded from the repository; its size and checksum are recorded above.

Command:

```powershell
npm run test:obs:performance -- --url ws://127.0.0.1:4456 --duration-seconds 1800 --sample-interval-ms 5000 --output output/obs-performance-30m
```
