# Garupa JSON 谱面格式

不同于 **Bestdori** ，**GarupaEditor** 与对应的 **NotGarupa** Sonolus 引擎使用独立的 `Garupa JSON` 结构，用以在传递谱面时承载更多的功能与扩展性。

示例：

```json
[
  { "type": "BPM", "beat": 0, "value": 120 },
  { "type": "SV", "beat": 16, "value": 0.5, "timingGroup": "#1" },
  { "type": "Single", "beat": 1, "lane": 3, "width": 1 },
  { "type": "Flick", "beat": 2, "lane": 4, "width": 1 },
  { "type": "Skill", "beat": 3, "lane": 2, "width": 1 },
  {
    "type": "Directional",
    "beat": 4,
    "lane": 5,
    "width": 1,
    "direction": "Right"
  },
  {
    "type": "Slide",
    "connections": [
      { "type": "Single", "beat": 8, "lane": 2, "width": 1 },
      { "type": "Hidden", "beat": 9, "lane": 3, "width": 1 },
      { "type": "Flick", "beat": 10, "lane": 4, "width": 1 }
    ]
  }
]
```

## 顶层项目类型

- `BPM`
  - `{ type: "BPM", beat: number, value: number }`
  - 至少必须有一个 BPM。
  - 导出时会自动把当前基础 BPM 写成 `{ beat: 0, value: metadata.bpm }`。
  - 导入时会选最早的 BPM 作为基础 BPM，并把整张谱的 beat 平移到从 `0` 开始。

- `SV`
  - `{ type: "SV", beat: number, value: number, timingGroup?: string }`
  - `value` 是速度倍率。
  - `timingGroup` 缺省或 `#Global` 表示全局组。

- 普通顶层音符
  - `Single`
  - `Flick`
  - `Skill`
  - `Directional`
  - 顶层不允许 `Hidden`。

- `Slide`
  - `{ type: "Slide", connections: [...], timingGroup?: string, long?: true }`
  - `long` 见下文「Long」。
  - `connections.length >= 2`，按全部节点计数（包括 `Hidden`），不是可见节点数量。
  - 单节点 Slide 是非法结构。编辑器修正退化结构时，可见节点回退为对应类型的独立音符，单个 `Hidden` 删除；通用解析器与 Simulator 不将其作为合法 Slide 接受。
  - `Hidden` 只允许出现在 `Slide.connections` 里。

## 音符字段

普通节奏音符：

```json
{ "type": "Single", "beat": 1, "lane": 3, "width": 1, "timingGroup": "#1" }
```

适用于：
- `Single`
- `Flick`
- `Skill`
- `Hidden`，但仅 Slide 内

字段：
- `beat`: 数字，节拍位置
- `lane`: 数字，轨道位置
- `width`: 正整数；导出一定带，导入普通音符缺省时按 `1`
- `timingGroup`: 可选，非全局时才通常导出

方向 Flick：

```json
{
  "type": "Directional",
  "beat": 4,
  "lane": 5,
  "width": 1,
  "direction": "Left"
}
```

`direction` 只能是：
- `"Left"`
- `"Right"`

## `timingGroup` 规则

- 缺省、空字符串、`#Global` 都表示全局 timing group。
- 非全局组使用类似 `#1`、`#Group A` 的字符串。
- 导出时，全局组在音符和 Slide 上通常省略；SV 会写出归一化后的 `timingGroup`。

## 谱面头与系统命令

- `Header`
  - `{ type: "Header", data: "#HABAHIRO" }`
  - 不带 `beat`，一张谱面至多一个，对应原作的 `#HABAHIRO` 头。
  - 除 `Directional` 外，宽度大于 1 的音符都要求谱面带有这个头。
- `System`
  - `{ type: "System", beat: number, data: "#LANE_CHANGE" }`
  - 换轨命令。可以有多个；与原作转换器一致，以最晚的一个决定换轨位置。要求谱面带有 `#HABAHIRO` 头。
- 导出为 Bestdori V2 时，这两类项目都会被丢弃。

## 语义规则

### 轨道位置 `lane`

- `Directional` 的 `lane` 是它的根，也就是箭头的起点；它从根开始，朝 `direction` 方向占 `width` 条轨道。
- 其他音符的 `lane` 是它所占 `width` 条轨道的中心：奇数宽取正中那条轨道，偶数宽取中间两条轨道之间的位置。例如占第 2–3 轨的宽 2 音符，`lane` 为 `2.5`。
- 可见音符总是占满整条轨道，所以 `lane − (width − 1) / 2` 一定是场上的整数轨道；`Hidden` 节点可以位于任意位置（原作的虚拟轨道）。
- 原作宽 Long 的根取左侧中间轨道，即整轨跨度下的 ⌊`lane`⌋。
- 2026-11 之前（GarupaEditor 0.4.0-alpha.8 及更早），非 `Directional` 音符的 `lane` 表示所占跨度的第一条轨道。这种旧 JSON 不会被自动转换。

### Long

- Garupa JSON 没有独立的 Long 项目：带 `"long": true` 的 `Slide` 就是原作的 Long。
- 这个标记只在 Long 形状上有效：恰好两个节点，`Single`/`Skill` 头加上之后的 `Single`/`Skill`/`Flick` 尾，且两者占相同的轨道跨度；或者尾为 `Directional`，其 `lane` 等于头的中心轨道 ⌊(first + last) / 2⌋（原作合并宽 Long 时保留的根）。
- `Directional` 尾从该轨道朝自身方向占 `width` 条轨道，即原作的 Long 多重方向尾：作为 Long 根的 Multiple 后续类型，由 `LongMultipleDirectionalFlickAdd` 成员组成，按根的轨道判定（单轨为判定类型 6，多轨为 7）。与原作一致，只有沿箭头方向最远的成员显示箭头。
- 不带这个标记的 Slide（包括只有两个节点的直线 Slide）一律是原作的 Slide。
- Bestdori V2 的 `Long` 导入为带标记的 Slide，导出时还原为 `Long`。
- 通用解析器拒绝 Long 形状不合法的 `Directional` 尾。

### 已批准的扩展（2026-11-04）

1. Long 或 Slide 的 `Directional` 尾宽于 3 轨：原作只在根的 1–2 轨范围内组合 Add 成员；超出部分的成员仍按成员偏移组合。前置 `Directional` 不受影响。
2. 宽 Long 根的 `Directional` 尾主体：原作这一段的范围主体没有贴图、保持为空；扩展改为在根上显示其中心轨道的单轨主体，使整组看起来完整。根的其他方面不变。

### Slide 的方向尾

宽度 w > 1 的 `Directional` 位于 Slide 末端时，即为原作的多重方向尾（终端加 Add 成员），宽节点之后同样如此。不表示原作的宽方向终端。

### Slide 手势节点（扩展）

原作只在 Slide 的最后一个节点放 Flick（`Flick`、`Directional`、多重方向尾）。Garupa JSON 额外允许 `Flick` 或 `Directional` 作为 Slide 的头或中间节点：

- **类型**：这样的节点沿用原作 Slide 尾的类型，而不是另建模型。中间节点带有原作 Slide 末端的游戏类型（Flick 尾、方向尾，宽度大于 1 时为多重方向 Add）；头节点则把同样的游戏类型记在 `slideHeadGestureGameType` 中。
- **手势判定**：沿用原作 Flick 尾一族的规则，包括接触宽限、起点、虚拟 Perfect 线、Flick 距离、接触跨度（宽度大于 1 的 `Directional` 检测整个跨度，与多重方向尾检测整组一致）和按下缓存（在节点上按下会缓存结果与时机，之后从按下位置移动超过 Flick 距离时，以缓存的结果判定该节点）。宽度大于 1 的 `Directional` 在整个跨度内任意位置按下都会绑定。成功时与对应的尾一样判定为类型 5/6/7。这套检测有自己的起点、宽限和缓存，原作尾的状态与缓存照常运行。
- **其余行为**与该位置上的普通节点完全相同：移动与跟随、超时与 Miss（类型 8，中间节点伤害 ÷5）、在最后一个节点前松手（Miss 类型 8，之后 Slide 继续）、轨道灯、贴图隐藏，以及尾手势对移动的阻挡。
- **显示**：判定前（包括按下之后）显示手势，即原作尾的贴图（中间的 `Flick` 在 Flick 图标下保留中间节点主体 `note_slide_among`）及其 Add 成员；被按下的头在判定线上显示并带闪光。判定后按普通节点绘制：中间节点为 `note_slide_among`，沿线行进直到通过；头节点为按住的主体。
- **出口偏移**：宽度 w > 1 的 `Directional` 带有 ±(w−1) 轨的出口偏移。节点停下后，Slide 线从箭头远端继续；判定前，箭头贴图（以及随之行进的头）停在线前端减去偏移的位置，判定后绘制在线前端。
- 这样的 Slide 属于扩展项：由扩展投影路径绘制和定位，判定仍遵循原作规则。

### Slide 的 Hidden 端点（扩展）

- **头为 `Hidden`**：第一个可见节点承担头的职责。判定前它像头一样登记手指（任何触摸只要在它上方即可，不检查该手指是否已拥有音符，因此一根手指可以同时登记多个这样的 Slide），并按中间节点判定。
- **尾为 `Hidden`**：最后一个可见节点按中间节点判定，之后按尾处理：释放手指，只有剩余的几何部分继续。
- 第一个可见节点之前、最后一个可见节点之后的 `Hidden` 节点不参与判定，也不影响超时窗口。
- 第一个可见节点判定前、最后一个可见节点之后，判定线上不显示任何东西：`Hidden` 头没有贴图和按住的主体，最后一个可见节点在按尾处理后离开判定线。线段照常绘制。

## 与 Bestdori V2 互转

- `timingGroup` 缺省或为全局组时，导出会省略该字段，不写出值为 `undefined` 的属性；BPM 零值规整时保留 Slide 所属的时间组。
- 谱面本身不含媒体：BGM、封面、MV 与自定义背景由编辑器另行保存，Garupa JSON 与 Bestdori V2 谱面都不嵌入 Data URL 或远程 URL。
