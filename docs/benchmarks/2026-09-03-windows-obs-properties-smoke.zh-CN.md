<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS 属性页冒烟测试 — 2026-09-03

[English](2026-09-03-windows-obs-properties-smoke.md)

状态：用户手动探索测试通过。本记录不能代替 30 分钟性能门槛或 100 次生命周期测试。

| 项目 | 证据 |
|---|---|
| 主机 | Windows 10.0.26200、OBS 32.2.2 便携版、NVIDIA GeForce RTX 4090 |
| 插件 DLL | SHA-256 `A56FE0950637D37A069476510FDF3D82F57D69A5F336F4CBD3BF7DB253C5C4E0` |
| 场景 | Knock Community Hall SOG，CC BY 4.0 |
| 运行时 | 本机回环服务器启动；Spark 通过 ANGLE/D3D11 报告 2,487,137 个 LOD 高斯节点 |
| 用户结果 | 手动测试分类化来源属性页，未发现问题 |
| 错误结果 | 对应 OBS 日志中没有 `obs-3dgs` 运行时错误 |
| UI 状态隔离 | 最后分类 `display` 与高级相机展开状态只写入来源 `private_settings`，普通渲染设置中不存在这两个键 |

本次真实 OBS 冒烟测试覆盖六类下拉、按来源记忆、高级相机展开、条件显隐和细粒度直播锁界面。其余发布门槛见主测试文档。
