# 测试说明

Web 检查使用 `npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`。完成 CMake 构建后，通过 CTest 运行原生校验测试。

渲染证据必须记录场景、相机姿态、焦段、输出分辨率、内部比例、质量档位、GPU、平均 FPS、P95 帧时间和截图。相机或质量状态不同的两张图不能直接做性能对比。

## 首个 Beta 的验收条件

`0.1.0-beta.1` 发布前等待[人工验收清单](manual-acceptance.zh-CN.md)中的 Windows 七项结果。通过后可以发布 Beta，README 和发布说明必须明确写出“macOS 尚未在真实 Mac 的 OBS 中验证”。Mac 真机测试可在本次 Beta 发布后补做；下方 M1 性能指标仍是未验证的验收目标，不再阻塞本次 Beta 发布。RTX 4060 性能仍为 Stable 门槛。

## 已有证据

[群组来源与 Dock 布局回归](benchmarks/2026-09-04-dock-groups-layout.zh-CN.md)覆盖群组及嵌套群组的自动来源选择，以及分栏位、页签和宽滑杆布局。用户已确认 fix1 的预设热键与缺失文件恢复通过；新版布局的视觉验收由用户手动完成。

[Windows 前端恢复回归](benchmarks/2026-09-04-windows-frontend-recovery.zh-CN.md)修复人工验收发现的 Dock 内容隐藏和缺失文件“应用”崩溃，并通过真实缺失文件回调验证普通/锁定恢复、机位保留及后续锁定保护；用户窗口操作复测仍待反馈。

当前仅渲染器预检记录在 [Windows Web 渲染预检](benchmarks/2026-09-03-windows-web-preflight.zh-CN.md)，它不能代替下方 OBS 集成门槛。

分类化来源属性页已通过真实 OBS 探索性冒烟测试，记录见 [Windows OBS 属性页冒烟测试](benchmarks/2026-09-03-windows-obs-properties-smoke.zh-CN.md)。

[Windows OBS 生命周期测试](benchmarks/2026-09-03-windows-obs-lifecycle.zh-CN.md)完成了 100 次空来源创建/删除和 20 次 SOG 加载/删除；[Windows OBS 静止录制检查](benchmarks/2026-09-03-windows-obs-performance.zh-CN.md)完成 30 分钟录制，渲染与输出丢帧计数均为 0，但没有测量渲染器逐帧 P95。OBS 主进程工作集的观测不能证明浏览器/GPU 完全没有内存泄漏。

[Windows OBS 行为回归](benchmarks/2026-09-03-windows-obs-behavior.zh-CN.md)已通过代表性的直播锁定字段、已保存预设的热键例外、透明合成、失败回滚、成功暂存和“最后选择生效”的取消路径。

[Windows OBS 缺失文件恢复](benchmarks/2026-09-03-windows-obs-missing-file.zh-CN.md)已验证场景集合保存和重启后仍保留缺失路径、可以从移动副本恢复，并最终恢复原始样例。

[2026-09-04 续接回归](benchmarks/2026-09-04-windows-regression.zh-CN.md)补齐七种格式的成像/截断/损坏检查、本地 HTTP 边界、Dock 编辑组件与角度往返测试；CEF 短测证实逐帧 P95 16.7 ms，并验证静止后无新增重绘和排序。长时录制与逐帧联合验证独立记录，不能用短测替代。

真实 libobs API 的 100 次复制、私有 UI 状态隔离，以及 OBS 属性取消所用的调用路径已通过 [原生契约回归](benchmarks/data/2026-09-04-native-contracts.json)。[长时逐帧与录制](benchmarks/2026-09-04-windows-renderer-performance.zh-CN.md)保留完整原始帧数据。

[人工验收清单](manual-acceptance.zh-CN.md)仍保留实际菜单/窗口按钮、Dock 全流程同步、缺失文件窗口和物理热键绑定；自动 API 检查与这些人工动作区分记录。[RAD 单文件样例](benchmarks/data/2026-09-04-windows-rad.json)也已通过成像、截断与损坏恢复；不涵盖外部多文件分块。Apple M1 平衡档 1080p30 必须达到平均 ≥29 FPS、P95 ≤36 ms。

RTX 4060 8 GB 门槛阻止 Stable，不阻止首个 Beta；M2+ 1080p60 是目标，不是 Beta 阻塞项。

[来源恢复与 WebGL 恢复](benchmarks/2026-09-04-recovery-contracts.zh-CN.md)补齐 100 次真实序列化恢复，以及首次上下文丢失自动恢复、再次丢失进入稳定错误状态的直接证据。
