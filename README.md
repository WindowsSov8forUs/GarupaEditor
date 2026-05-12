# GarupaEditor

GarupaEditor 是一个基于 `Tauri + React + TypeScript` 的桌面谱面编辑器原型，采用 Beat 制与 7 轨标准编号，支持可视化编辑与 JSON 导入导出。

## 运行

```bash
npm install
npm run tauri dev
```

或使用更明确的桌面命令：

```bash
npm run desktop:dev
npm run desktop:build
```

## 一键测试启动

Windows 下可直接双击根目录 `test-start.bat`，或使用：

```bash
npm run test:start
```

该脚本会依次执行：

1. 前端构建检查（`npm run build`）
2. Rust 检查（`cargo check --manifest-path src-tauri/Cargo.toml`）
3. 启动开发环境（`npm run tauri dev`）

如果只想快速验证“能启动”而不一直挂起进程，可用：

```bash
npm run test:start:smoke
```

## 已实现

- 顶部命令区：`导入 JSON / 导出 JSON / 复制 JSON / 谱面编辑 / 应用设置`
- 左右分栏独立滚动，分栏间距可拖动滑杆调整
- 左侧固定“谱面信息”卡片 + 独立滚动编辑工具区
- 谱面信息二级编辑界面（封面上传、音频上传、曲目信息、Offset、BPM 预留接口）
- 可视化编辑区从底部向上（Beat 增加方向向上），轨道居中显示
- 轨道标准：
  - 7 轨：`0` 到 `6`
  - 9 轨：`-1` 到 `7`
  - 11 轨：`-2` 到 `8`
- 轨道数仅支持 `7 / 9 / 11`，拍号为 `分子/分母` 输入
- 小节数自动推算（音频时长 + BPM + 已放置音符，自动留后续空间）
- 音符工具图标化 + 快捷键：
  - `1-7` 切换音符类型
  - `Ctrl+Z` 撤销
  - `Ctrl+Shift+Delete` 清空
  - `Delete` 删除选中音符
- 桌面窗口默认尺寸 `1366 x 768`，分辨率预设移入“应用设置”

## JSON 结构

```json
{
  "version": "0.2.0",
  "style": "bandori-inspired-beat",
  "metadata": {
    "title": "Untitled Song",
    "artist": "Unknown Artist",
    "charter": "Your Name",
    "difficulty": "Expert",
    "difficultyLevel": "26",
    "bpm": 120,
    "offsetMs": 0,
    "coverDataUrl": null
  },
  "settings": {
    "laneCount": 7,
    "timeSignatureNumerator": 4,
    "timeSignatureDenominator": 4,
    "beatSnap": 4
  },
  "audio": {
    "fileName": "song.ogg",
    "durationSec": 132.4
  },
  "skin": {
    "name": "default",
    "assetPath": ""
  },
  "notes": [
    {
      "id": "uuid",
      "type": "single",
      "lane": 3,
      "beat": 16
    },
    {
      "id": "uuid",
      "type": "slide",
      "lane": 2,
      "beat": 20.5,
      "endBeat": 22,
      "endLane": 5
    }
  ]
}
```

## 参考说明

当前实现是“Bandori 风格启发”的编辑器原型，不是官方谱面格式逆向；可继续扩展自动存盘、音频波形、判定线回放等功能。
