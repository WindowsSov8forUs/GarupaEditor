# Auto Live 冻结证据包

本目录冻结 Auto Live 阶段 E01–E30 候选源、Reverse 首版晋升提交
`a3f28d77e71c5e7a62cab0de81f0cf668a5b745b` 的 R01–R08/反编译切片，以及补充证据链的 R09–R20：Multiple Directional、source-order group/side-used、visual helper、Stop、pause、terminal fault、actual observation与exact production replay。最终源提交锁定为
`c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab`；另含失败关闭矩阵及谱面构造/时钟调度上游 manifest。

运行时代码不得读取本目录。Python 生成器只作为 Reverse 离线审计源；GarupaEditor
测试只读取 `fixtures/*.json`，不执行 Python、不访问 Reverse 工作树、不联网。

验证：

```powershell
node tmp/simulator-reverse-evidence/auto-live/verify.mjs
node tmp/simulator-reverse-evidence/auto-live/verify.mjs --index
```
