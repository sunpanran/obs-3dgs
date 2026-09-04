<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows Web 渲染预检 — 2026-09-03

[English](2026-09-03-windows-web-preflight.md)

这份证据只验证 Spark/WebGL 渲染层，不是 OBS 录制基准，也不能代替 Windows 发布门槛。

| 项目 | 数值 |
|---|---|
| 场景 | Knock Community Hall，作者 scbenoit，CC BY 4.0 |
| 样例 SHA-256 | `5931c2b44710aa1d42a48f89b6b4546108430b16700b8eb5a656f8a55f25227a` |
| 原始高斯数 | 1,935,275 |
| LOD 可见高斯数 | 755,889 |
| GPU | NVIDIA GeForce RTX 4090 |
| 逻辑输出 | 1920×1080 |
| 内部渲染尺寸 | 1440×810（75%） |
| 画质 | 平衡、LOD 1M、SH2、目标 60 FPS |
| 相机 | 35mm、水平 35°、俯仰 −12°、距离 69.557 |
| 取景中心 | 10.318、−2.270、−8.136 |
| 实测帧率 | 59.9 FPS |
| P95 帧间隔 | 16.8ms |
| 静止调度 | Spark 脏状态处理完成后 `renderScheduled=false` |

![Knock Community Hall 构图与渲染证据](assets/knock-community-hall-framed.png)

同一次运行还检查了光学变焦、环绕/平移/推拉、协议 revision 单调性、直播锁定、仅镜头预设可绕过锁定、LOD 重载保持相机，以及静止后按需休眠。后续仍必须完成 OBS 内 1080p60 连续录制 30 分钟，并记录 OBS 渲染延迟丢帧。
