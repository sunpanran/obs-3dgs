# Windows CEF 逐帧与录制验证（2026-09-04）

本次直接采集实际渲染回调的 RAF 时间戳，单独记录 CPU 提交耗时。帧间隔 P95 采用全部原始间隔的 nearest-rank 统计；CPU 提交耗时不是 GPU 执行耗时，也不再用 OBS 合成平均耗时的 P95 代替逐帧 P95。

环境：Windows 10.0.26200、OBS 32.2.2、RTX 4090、Spark 2.1.0、Three.js 0.180.0。样例为 CC BY 4.0 的 Knock Community Hall，文件 SHA-256 为 `5931c2b44710aa1d42a48f89b6b4546108430b16700b8eb5a656f8a55f25227a`。输出 1920×1080/60，内部 1440×810，1M LOD、SH2、35 mm。相机在基准水平角两侧 ±10° 做正弦运动，每秒更新原生设置 20 次。

## 远景长测

| 指标 | 实测 |
|---|---:|
| 渲染采集时长 | 1,800 秒 |
| 录制时间戳 | 1,801.383 秒 |
| 逐帧间隔数量 | 108,004 |
| 平均 FPS | 60.0024 |
| 帧间隔 P95 / 最大值 | 16.7 / 16.8 ms |
| CPU 提交 P95 / 最大值 | 0.4 / 3.5 ms |
| OBS 渲染跳帧 | 0 / 108,010 |
| MKV 大小 | 202,118,724 字节 |
| 静止 10 秒 | 重绘计数及最后排序时间均未变化 |

精确相机姿态与其他设置保留在 [JSON 报告](data/2026-09-04-renderer-30m.json) 中；[原始帧时间（gzip JSON）](data/2026-09-04-renderer-30m-frames.json.gz) 可独立复算。该机位距离为 358.157，画面主体较小，因此它代表远景工作负载，不代表近景或任意复杂场景。

![远景长测](assets/knock-community-hall-renderer-30m.png)

## 近景覆盖

为覆盖实际直播背景常用的取景，另使用 [近景相机](data/knock-community-hall-close-camera.json)：目标 (79.7397, 10.7020, -47.7562)、水平 83.45°、俯仰 16°、距离 36.5913、焦段 35 mm；场景统一缩放 4.99、Y 旋转 -3.7°。

近景长测通过：1,800 秒渲染采集、1,801.299 秒录像；108,004 个间隔，平均 **60.0024 FPS**、逐帧 **P95 16.7 ms**、最大 16.8 ms；OBS 渲染跳帧 **0 / 108,009**。CPU 提交 P95 0.4 ms、最大 5.8 ms。MKV 为 1,549,829,428 字节，未发生采集缓冲溢出，静止缓存检查通过。

[近景 JSON](data/2026-09-04-renderer-close-30m.json)、[近景原始帧数据](data/2026-09-04-renderer-close-30m-frames.json.gz)。该结果达到记录配置下的 RTX 4090 门槛，并通过硬件、真实内部光栅尺寸、数值画质、录制时长和原始帧覆盖的联合检查。

![近景长测](assets/knock-community-hall-renderer-close-30m.png)

```text
npm run test:obs:renderer -- --duration-seconds 1800 --record true --pose docs/benchmarks/data/knock-community-hall-close-camera.json --output output/obs-renderer-close-30m
```

测试只操作专用 OBS 实例，在录制期间静音其全局音频输入，并在结束后恢复相机、录制路径和静音状态。录像不包含在发布 ZIP 中。

这些结果只覆盖记录的设备、场景、相机和配置。Apple M1 与 RTX 4060 需要各自硬件证据；M1 命令见 [人工验收](../manual-acceptance.zh-CN.md)。
