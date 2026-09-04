# Windows 续接回归（2026-09-04）

环境：Windows、OBS 32.2.2 便携隔离实例、RTX 4090、Spark 2.1.0、Three.js 0.180.0。
自动化仅操作仓库 `tmp/` 下的测试实例，临时来源删除后恢复原测试来源。

## 修复与验证

| 项目 | 结果与证据 |
|---|---|
| 相机角度 | 803.45° 归一化到 83.45°，其余参数不变，1280×720 前后 PNG SHA-256 完全一致；[前](data/2026-09-04-angle-before.json)、[后](data/2026-09-04-angle-after.json) |
| Dock 同步 | Qt 原生测试验证输入焦点下 100 次刷新不覆盖未提交文本、滑杆拖动不被刷新打断、延迟编辑绑定原来源、预设浏览保持和热键同步 |
| 有效格式 | PLY、Compressed PLY、SPZ、SOG、SPLAT、KSPLAT、ZIP 均在真实 OBS 中成像 |
| 截断与损坏 | 上述每种格式均验证非法替换后恢复路径和相同画面；共 21 个有效/截断/损坏检查通过；[JSON](data/2026-09-04-windows-formats.json) |
| 原生 PLY 预检 | 现在把 chunk、vertex、sh 元素的完整字节数一起校验，防止 chunk 数据掩盖尾部截断；包含原生回归 |
| HTTP 边界 | 16 项真实 HTTP/OBS 检查通过：HEAD、Range、缺失/错误令牌、目录访问、路径穿越、异常 JSON、字段类型、64 KiB 上限和主机存活；[JSON](data/2026-09-04-windows-server.json) |

原生拒绝新文件时，旧模型虽已保留，旧版仍将错误卡片覆盖在直播输出上。本次修复在已有有效模型时保留完整输出，让属性页与 Dock 报错；没有有效模型时仍显示错误卡片。

复现：使用仓库 `format-grid.ply`，通过测试脚本预填文件路径创建 1280×720 来源；相机取景中心 (0,0,0)、水平 35°、俯仰 -12°、Roll 0°、距离 4.2、焦段 35 mm，场景变换为默认值，平衡档（75% 内部比例）。随后选择该文件前半部分构造的截断副本。截图为来源输出 640×360：

| 修复前 | 修复后 |
|---|---|
| ![错误覆盖旧场景](assets/format-grid-rejected-before.png) | ![完整保留旧场景](assets/format-grid-rejected-after.png) |

## CEF 逐帧预检

此前静止录像的 `GetStats.averageFrameRenderTime` 是 OBS 合成平均耗时，不能当作渲染器逐帧 P95。
新脚本通过 OBS 官方支持的 CEF 本机调试接口，在调试模式下启用有界帧时间记录，分别保存每次实际渲染的 RAF 时间戳与 CPU 提交耗时；后者不是 GPU 执行耗时。

- 30 秒相机运动：平均 60.0024 FPS，帧间隔 P95 16.7 ms，最大 16.8 ms。
- 静止 10 秒：重绘计数不变、最后排序时间不变，且没有待执行渲染或排序。
- 10 秒录制预检：平均 60.0020 FPS，P95 16.7 ms，生成有效 MKV，停止后恢复测试实例原设置。
- 相机以 20 Hz 原生参数更新做 ±10° 正弦水平运动；JSON 保留精确基准姿态、场景 SHA-256、输出尺寸和画质参数。

[渲染预检 JSON](data/2026-09-04-renderer-preflight.json)、[录制预检 JSON](data/2026-09-04-renderer-recording-preflight.json)。[远景与近景长时报告](2026-09-04-windows-renderer-performance.zh-CN.md)已分别完成 30 分钟录制和逐帧验证；以上短测不作为长时结果替代。

此外，[原生契约测试](data/2026-09-04-native-contracts.json)通过 100 次真正的 `obs_source_duplicate`、私有页签/高级参数状态复制与隔离，以及 OBS 属性取消所用的 clear + update 调用路径。复现脚本为 `tests/e2e/obs-native-contracts.lua`，只加载到专用测试配置，并先建立 `output/obs-native-contracts/` 目录。

## 复现命令与边界

在专用 OBS 配置下启动，增加 `--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1`。
`OBS_WEBSOCKET_PASSWORD`、`OBS_LOG_PATH` 只在本机环境变量中设置，不写入仓库。结束后重启专用实例以关闭调试端口。

```text
node scripts/generate-format-fixtures.mjs
npm run test:obs:formats
npm run test:obs:server
npm run test:obs:renderer -- --duration-seconds 30 --output output/obs-renderer
npm run test:obs:renderer -- --duration-seconds 1800 --record true --output output/obs-renderer-30m
```

[RAD 补充回归](data/2026-09-04-windows-rad.json)使用独立编写的单文件 F32 网格，已通过成像、截断和损坏恢复；八种格式/变体合计 24 个有效/截断/损坏检查通过。格式测试是最小样例覆盖，不代表所有第三方变体。原生 Qt 组件测试不能替代 OBS 菜单、属性页取消、热键绑定和 Dock 的完整人工验收；Apple M1 性能也仍需真机。

接口依据：[OBS CEF 调试](https://github.com/obsproject/obs-studio/wiki/Browser-source-development-and-debugging)、[SparkRenderer](https://sparkjs.dev/docs/spark-renderer/)。
