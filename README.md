<div align="center">
  <img src="assets/garupaeditor-logo.png" alt="GarupaEditor" width="720">
  <h1>GarupaEditor</h1>
  <p><em>扩展的、多平台的 Garupa 自制谱制作工具，不仅是 Garupa 。</em></p>
</div>

基于 Tauri 架构，GarupaEditor 提供多平台的 BanG Dream! Girls Band Party 自制谱制作、预览、播放、导入、导出与上传功能。

不仅提供基础的 Bestdori 可用谱面制作功能，GarupaEditor 同时还支持：
- 7/9/11 轨道与界外谱面编辑
- 多宽度音符
- 无头/无尾 Slide 与无判定 Slide
- 变速 SV 与 TimingGroup

## 安装

目前 GarupaEditor 提供 Windows、macOS、Linux 与 Android 平台的安装包。桌面端优先推荐使用对应平台的安装器或软件包，Android 端目前提供未签名 APK。

### Windows 平台

下载:
- `*_windows_x64-setup.exe`
- `*_windows_x64.msi`
- `*_windows_arm64-setup.exe`
- `*_windows_arm64.msi`

推荐普通用户用 `*-setup.exe`，双击安装。
`x64` 用于常见 Intel/AMD Windows，`arm64` 用于 Windows on ARM。

### macOS

下载：
- `*_darwin_x64.dmg`
- `*_darwin_aarch64.dmg`

`darwin_x64` 是 Intel Mac，`darwin_aarch64` 是 Apple Silicon/M 系列 Mac。
打开 `.dmg` 后将 `GarupaEditor.app` 拖到“应用程序”即可。当前没有签名/公证，首次打开可能需要右键选择“打开”。

### Linux

Debian / Ubuntu 下载：
- `*_linux_amd64.deb`
- `*_linux_arm64.deb`

安装：
```bash
sudo apt install ./*_linux_amd64.deb
```

Fedora / RHEL / openSUSE 下载：
- `*_linux_x86_64.rpm`
- `*_linux_aarch64.rpm`

安装：
```bash
sudo dnf install ./*_linux_x86_64.rpm
```

### Android

下载：
- `*_android_aarch64.apk`

当前 Android 包为 aarch64 APK，未签名。安装前可能需要在设备上允许从当前来源安装应用。

## Garupa JSON 谱面结构

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

### 顶层项目类型

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
  - `{ type: "Slide", connections: [...], timingGroup?: string }`
  - `connections` 不能为空。
  - `Hidden` 只允许出现在 `Slide.connections` 里。

### 音符字段

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

### `timingGroup` 规则

- 缺省、空字符串、`#Global` 都表示全局 timing group。
- 非全局组使用类似 `#1`、`#Group A` 的字符串。
- 导出时，全局组在音符和 Slide 上通常省略；SV 会写出归一化后的 `timingGroup`。
