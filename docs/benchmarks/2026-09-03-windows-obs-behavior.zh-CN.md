<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Windows OBS 行为回归 — 2026-09-03

[English](2026-09-03-windows-obs-behavior.md)

状态：直播锁定、预设/热键例外、透明合成、失败后回滚和“最后选择生效”的取消检查均通过。

| 检查 | 证据 |
|---|---|
| 主机 | Windows 10.0.26200、OBS 32.2.2 portable、NVIDIA GeForce RTX 4090 |
| 插件 DLL | SHA-256 `E32C398B0A00E073C91C03C3E90BB1B8AF73712C5CE3D42E6FD23F16687DEFB2` |
| 直播防误触 | 曝光、焦段、场景缩放、相机水平角和背景模式均无法修改 |
| 锁定状态下的热键 | 7 个来源热键全部注册；复位相机仍被阻止，上一个/下一个和指定预设热键可以应用已保存镜头 |
| 透明合成 | 同一个 OBS 场景从黑色不透明背景切换为底层浅灰色“颜色来源”，两张截图哈希不同 |
| 失败暂存 | 故意损坏的 SOG 通过原生签名检查，在 Spark 中加载失败，并触发自动回滚 |
| 恢复结果 | 文件路径恢复为 Knock Community Hall；失败前后来源截图 SHA-256 均为 `880aac9042aaa4a8e8cad48de6cb5bfd44b3c20a212874eee93e4897ea292dae` |
| 最后选择生效 | 加载 A 后 100 ms 改选 B；没有旧任务错误回写，B 成为最终保存路径，恢复原路径后的画面完全一致 |
| 独立实例 | 第二个已加载来源单独修改相机、焦段、曝光和预设 JSON，原来源设置与画面均未改变；清理后没有副本残留 |
| 暂存高水位 | 重复一轮替换/取消后，总私有内存约从 3.70 GiB 降到 3.56 GiB；内存在渲染与 GPU 进程间转移，没有线性增长 |

证据：

- [机器可读行为报告](data/2026-09-03-windows-behavior.json)
- [机器可读副本隔离报告](data/2026-09-03-windows-copy-isolation.json)
- [不透明合成](assets/knock-community-hall-composite-opaque.png)
- [透明合成](assets/knock-community-hall-composite-transparent.png)
- [独立修改后的副本](assets/knock-community-hall-copy-after.png)

命令：

```powershell
npm run test:obs:behavior -- --url ws://127.0.0.1:4456 --obs-log <当前-obs-日志> --output output/obs-behavior
```

这组测试覆盖代表性的锁定字段、预设热键例外、失败替换、成功替换和旧请求取消；在 OBS 中编辑热键绑定仍需单独人工检查。

由于 obs-websocket 不提供 OBS 前端的“粘贴（副本）”动作，副本隔离测试使用原来源设置创建第二个输入。它证明原生层和运行时状态彼此独立；菜单动作以及私有设置页状态的复制仍属于人工前端检查。
