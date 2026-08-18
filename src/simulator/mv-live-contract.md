# 谱面 MV Live portable 合同

## Authority 与能力范围

行为依据为已推送 Reverse `38802391fc6169e405c316e9a998f28c283961e3`：

- `artifacts/investigations/mv-live-runtime-contract-10-1-4/`
- `artifacts/investigations/mv-live-portable-media-profile-10-1-4/`

锁定样本为 `jp.co.craftegg.band` 10.1.4 / 230 / arm64-v8a。83个current ARM64 slices、7条privacy-normalized observation-only R1、98-model signed-delay inventory、original segmented USM技术profile、portable mapping及closure均由committed verifier复算。八项closure计数为0，`production_authorization=true`。

正向能力仅为**带谱面 gameplay MV Live**：

- `live + manual`
- `live + auto`

以下不在能力内：

- Rehearsal/Practice MV；
- Retry或MoveTime MV；
- 独立无谱面 `MVView`；
- `Star3DLiveView`、3D、MultiNormal；
- CRI Mana/USM codec、Android decoder、speaker onset或Unity/GPU framebuffer exact；
- Stage 9主程序接入。

## Public schema 9

根请求仍精确为 `{ chartData, presentation, config }`。`presentation`必须显式携带：

```ts
interface SimulatorPresentationMvPackage {
  readonly bytes: Uint8Array;
  readonly musicStartDelayMilliseconds: number;
}

interface SimulatorPresentationPackage {
  // song / difficulty / jacket / stage / voice 保持既有合同
  readonly mv: SimulatorPresentationMvPackage | null;
}
```

- `mv === null`：标准舞台背景；
- `mv !== null`：MV Live；不再接受重复config开关；
- `bytes`必须是非空、prototype精确的直接`Uint8Array`，recipe深复制；
- delay必须为signed Int32；不得clamp或改写；
- caller不得提供MIME、container、codec、duration、dimensions、SHA、logical ID、cue、player或quality；
- simulator只接受严格结构且browser可解码的MP4或WebM，并内部派生全部身份与metadata；
- stage backdrop仍是schema必填并严格校验；`sdCharacterAtlases`与`liveStartVoiceMp3`按Reverse `d408d758`固定为null。MV路线不decode/附着standard stage，也不在MV故障时fallback。

`presentation.mv !== null`与`sessionMode !== "live"`在browser decode、chart、shared-store、mount、scheduler和domain mutation前以`evidence-required / simulator.mv-live.unsupported-rehearsal-mode`拒绝。

## Signed delay 与状态

原作状态已恢复：

```text
GameState.MovieBeforeSound = 17
InGameMusicVideoState = None(0) / WaitingPlay(1) /
  PauseOfWaitingPlay(2) / Playing(3) / Pause(4)
```

共同startup先完成既有0→1→2→3方向、prepared-paused BGM与原作缺SoundResource语音路径；Public voice稳定为null。MV背景`GayaSoundRequired=false`，因此Live MV不创建`SE_RHYTHM_GAYA`。

### delay > 0

```text
state 17
→ movie Playing(3) / Play
→ Float32(delayMilliseconds / 1000) pre-sound wait
→ PlayingNone(4) / BGM resume
→ PlayingSound(5) / gameplay
```

### delay = 0

同一pre-sound Play路线，wait为0；不把0改为正值或负值。

### delay < 0

```text
state 17 / pre-sound returns without Play
→ PlayingNone(4) / BGM resume / movie WaitingPlay(1)
→ PlayingSound(5) / gameplay already enabled
→ Float32 timer += Float32(delta), state 2 freezes timer
→ timer >= Float32(abs(delayMilliseconds) / 1000)
→ movie Playing(3) / Play / first-frame publication
```

实体Initial路线观察值为`-2180ms`。Gameplay先于movie出现是明确合同，不得用“等待视频首帧”阻塞Note/input/Score/Life。

## Media 与 scene

- local `Blob` + `HTMLVideoElement` + Pixi `VideoSource/Texture/Sprite`；
- `muted=true`、`defaultMuted=true`、`playsInline=true`、`loop=false`、`autoplay=false`；
- BGM是唯一可听音乐owner；视频内audio track永不进入mix；
- scene geometry消费Reverse `9167dce7`恢复的InGameMovie prefab：authored UITexture `1334×750`、UIRoot FitWidth，并仅在high-aspect时乘`VerticalFitScreenRatio`后居中；1600×720约为`(159.68,0,1280.64,720)`，但production不存在该尺寸特判；
- child order为MV movie后方，gameplay particle/ordinary Note/HUD和startup foreground在其上方；
- MV路线startup scene只decode jacket，保留information/dark-cover/line foreground，不附着standard stage/SD；
- `play()` rejection、media error/abort、decode、seek或Pixi source/upload错误均为terminal fault；不显示首帧占位、黑屏成功或standard stage。

Project-authored probe只验证adapter：

- MP4/H.264：20,933 bytes，SHA `21B9A3F0…57EEF6B`；
- WebM/VP9：46,404 bytes，SHA `CB0A2838…979CE9`。

它们不是原作frame/timing oracle。Original `movie/mv/music_video_232_hq` 的61,399,237-byte UnityFS与118段USM只记录技术profile，不进入Garupa fixture或production。

## Pause、结束与cleanup

- Playing pause：physical pause，state `3→4`，game state 7；resume为physical resume、`4→3`、game state 5；
- Waiting pause：state `1→2`并冻结delay timer；resume为`2→1`，不会提前启动video；
- movie早于chart结束：ended隐藏movie并标记finished，BGM/gameplay继续；
- chart/BGM早于movie结束：自然完成等待movie finished后才进入terminal result；
- user close/natural completion先Stop movie，再释放media/Pixi；
- cleanup逐项尝试audio、movie、particle和renderer；首故障稳定，后续失败附加为secondary；
- dispose移除listener、pause/clear/load video、destroy sprite/texture/source、revoke Blob URL，最终resource/stage count为0。

## Capability 回执

成功会话回执分开记录Note skin与背景：

```ts
rendering: "ordinary-current-portable" | "habahiro-current-external-complete" | null;
background: "standard-current-portable" | "mv-live-host-supplied-portable" | null;
mvLivePortable: "closed-portable";
selectedBackgroundGate: "closed-portable" | "open-evidence-required";
standaloneMvView: "excluded";
star3DLiveView: "excluded";
```

`closed-portable`只声明上述browser语义、serialized movie-widget多比例映射、当前WebView2 actual Pixi raster和owner lifecycle，不升级original codec/device exact。任何post-initial surface revision按adaptive合同在media command前失败关闭。
