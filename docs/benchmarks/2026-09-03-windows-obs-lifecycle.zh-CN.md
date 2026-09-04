<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS 生命周期测试 — 2026-09-03

[English](2026-09-03-windows-obs-lifecycle.md)

状态：空来源和真实场景生命周期自动化门槛均通过。

| 项目 | 证据 |
|---|---|
| 主机 | Windows 10.0.26200、OBS 32.2.2 portable、NVIDIA GeForce RTX 4090 |
| 插件 DLL | SHA-256 `7409C89529C70C31C80BE5B3D405E8E1AC74FF06097A277FC3EE51A4F684CEFF` |
| 场景 | Knock Community Hall SOG，29,768,772 字节，2,487,137 个 splat，CC BY 4.0 |
| 空来源循环 | 创建/删除 100 次，无残留来源，渲染跳帧为 0 |
| 空来源内存 | 基线 346.54 MB，等待 5 秒回收后 348.30 MB，增加 1.76 MB |
| 浏览器进程 | 100 次测试前后，独立实例均为 5 个 `obs-browser-page` 进程 |
| 真实加载循环 | 创建、选文件、等待就绪、删除共 20 次；平均 10.06 秒，P95 10.29 秒进入 `Scene ready` |
| 真实加载内存 | 基线 316.57 MB，最后回收后 216.44 MB，没有持续增长 |
| 真实加载渲染 | 渲染跳帧为 0；第一次和第二十次截图 SHA-256 完全一致 |

第一次高速空来源测试发现了真实生命周期问题：未启用的来源也会立即创建私有 Browser Source，删除后仍有 CEF 页面初始化排队。现在仅在来源实际显示、用户明确重载或已经存在浏览器时创建私有浏览器；同时声明 OBS 复合来源能力，并提供“仅视频、无音频混合”的回调。按相同条件重新执行 100 次后，CEF 进程数始终保持在 5 个基线值。

可复现的机器可读结果：

- [空来源生命周期数据](data/2026-09-03-windows-empty-lifecycle.json)
- [真实场景生命周期数据](data/2026-09-03-windows-loaded-lifecycle.json)
- [真实加载截图](assets/knock-community-hall-loaded-lifecycle.png)

命令：

```powershell
npm run test:obs:lifecycle -- --url ws://127.0.0.1:4456 --cycles 100 --output output/obs-integration
npm run test:obs:loaded-lifecycle -- --url ws://127.0.0.1:4456 --cycles 20 --obs-log <当前-obs-日志> --output output/obs-loaded-lifecycle
```

WebSocket 密码通过 `OBS_WEBSOCKET_PASSWORD` 传入，不会写入报告。
