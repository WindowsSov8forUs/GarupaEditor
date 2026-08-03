# HABAHIRO approximation evidence

该包冻结用户授权的HABAHIRO完整近似实现输入，不宣称原作parity。

- 行为主依据：Reverse `ab5cc366a4a03d24a215e379849824e5ddf5f72f` current 10.1.4 static/R7 evidence。
- 资源依据：同提交中的`habahiro_current_external_resource_profile.json`及2026-08-03重新下载校验的Bestdori固定资源。
- 远端校验：12项均匹配冻结byte length与SHA-256；原始bytes未入库。
- `bestdori-atlas-profile.json`：179行Sprite rect/pivot/PPU，Unity bottom-left rect已确定性转换为Pixi top-left。
- mesh width常量：从current `libil2cpp.so`只读地址`0x1536310`和`0x153645C`恢复Float32 bits。
- `difference-matrix.json`：HA-D01–HA-D12全部转为已实现近似，但继续禁止parity声明。

验证：

```powershell
node tmp/simulator-habahiro-approximation-evidence/verify.mjs
```
