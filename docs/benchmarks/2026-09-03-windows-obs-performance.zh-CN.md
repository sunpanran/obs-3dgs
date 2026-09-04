<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS 1080p60 录制门槛 — 2026-09-03

[English](2026-09-03-windows-obs-performance.md)

状态（2026-09-04 复核）：30 分钟静止背景录制检查通过；完整 RTX 4090 性能门槛仍待验证。

| 项目 | 证据 |
|---|---|
| 主机 | Windows 10.0.26200、OBS 32.2.2 portable、NVIDIA GeForce RTX 4090 |
| 插件 DLL | SHA-256 `7409C89529C70C31C80BE5B3D405E8E1AC74FF06097A277FC3EE51A4F684CEFF` |
| 场景 | Knock Community Hall SOG，2,487,137 个 splat，CC BY 4.0 |
| 输出 | 1920×1080、60 FPS、SDR Rec.709、NVENC H.264 MKV |
| 插件画质 | 平衡档：75% 内部比例（1440×810）、1,000,000 LOD 预算、SH2 |
| 相机 | 35 mm；水平角 83.45°（存储值 803.45°）、俯仰 16°、Roll 0°、距离 36.5913；取景中心 (79.7397, 10.7020, -47.7562) |
| 时长与采样 | 目标 1,800 秒，实测 1,802.83 秒；每 5 秒采样，共 360 次 |
| FPS | 平均 60.0000，最低 60.0000 |
| OBS 平均耗时的采样统计 | 均值 0.2334 ms，平均值的 P95 0.2722 ms，最大平均值 0.3157 ms；不是逐帧耗时 |
| 渲染延迟跳帧 | 0 / 108,247，0% |
| 录像输出跳帧 | 0 / 108,197，0% |
| 录像文件 | 190,101,104 字节；SHA-256 `610A0A8077FA883F333011C7F7E9B53CD3D24FB4DDBF88F04FAA2A3B781A6C94` |

原计划要求平均 ≥58 FPS、逐帧 P95 ≤20 ms、OBS 渲染延迟丢帧 <0.5%。此次实测证明静止背景可以持续合成与录制，OBS 丢帧计数为零。但 `GetStats.averageFrameRenderTime` 返回平均值，这些平均值的 P95 无法证明逐帧 P95 门槛；此次也没有采集渲染/排序次数，不能单独证明静止后停止重绘，或证明相机交互期间的性能。保留原始 JSON，其中历史字段 `meetsRtx4090Gate` 对覆盖范围的判断过宽，以本次复核为准。采集脚本已将静止录制结果单独标记。

证据：

- [完整 360 次采样报告](data/2026-09-03-windows-performance-30m.json)
- [开始录像前捕获的场景截图](assets/knock-community-hall-obs-performance.png)

181.29 MiB 的 MKV 不放入仓库，其大小与校验值已记录在上表。

命令：

```powershell
npm run test:obs:performance -- --url ws://127.0.0.1:4456 --duration-seconds 1800 --sample-interval-ms 5000 --output output/obs-performance-30m
```
