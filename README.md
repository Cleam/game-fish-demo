# 海底进化战斗 (fish-game)

竖屏(720×1280)海底进化战斗试玩,基于 **Cocos Creator 3.8.8**,以 **Asset Bundle** 形式对外提供,
供其他 Cocos 项目加载后展示。支持两种流程:

- `win`:进化 → 鱼王 Boss 战 → 胜利结算弹窗 → CTA 页
- `lose`:进化 → 最终对抗(体力条 / 吞噬时间)→ 失败弹窗(重新挑战 / 退出挑战)

游戏内容全部由代码驱动;帧动画、UI、特效在运行时构建,无需在编辑器摆放场景。

## 环境要求

- Cocos Creator **3.8.8**(第三方引入方需为 3.8.x)
- Node.js ≥ 16(仅运行 `tools/` 下的资源脚本时需要)

## 目录结构

```text
assets/fish-game/                 # Asset Bundle(bundleName = "fish-game")
├── FishGame.prefab               # 对外入口 Prefab(挂 FishGameEntry 组件)
├── data/manifest.json            # 帧清单 + trim 包围盒 / 中心锚点 / 嘴部锚点
├── textures/                     # 帧图与 UI 图
│   ├── hero/{lv0,lv30,lv60,lv90,lv120}   # 进化各阶段攻击帧
│   ├── hero/end                  # 结算 / CTA 展示帧
│   ├── hero/move                 # 失败结算逃跑帧
│   ├── npc/{01..05}              # 各波次普通鱼帧
│   ├── boss/                     # Boss / 最终敌人帧
│   └── ui/                       # bg / as2 / modal_win
└── scripts/
    ├── FishGameEntry.ts          # 对外入口组件
    ├── core/                     # pf(兼容层)/ StateManager
    ├── config/                   # constants / progression / assetMapping / mode
    ├── util/ManifestLoader.ts    # 帧清单与 SpriteFrame 解析
    ├── game/                     # FrameAnimPlayer / Actor / NpcWaveController / GameController
    ├── effects/                  # SuctionEffectPlayer
    └── ui/                       # EvolutionCard / WinModal / LoseModal / CtaPage / StaminaBar / TimerDisplay

tools/                            # 资源处理脚本(见「资源工具」)
```

## 快速开始

1. 用 Cocos Creator 3.8.8 打开本工程,等待资源导入完成。
2. 确认 `assets/fish-game` 已被识别为 Bundle:选中该文件夹,Inspector 中「配置为 Bundle」已勾选、名称为 `fish-game`。
3. 新建场景自测:
   - `assets` 右键 → 新建 → Scene,双击打开(自带 Canvas + Camera);
   - 层级面板右键 `Canvas` → 创建空节点,重命名 `FishGame`;
   - 选中它 → Add Component → `FishGameEntry`,设置 `Mode` 为 `win` 或 `lose`;
   - 点顶部 ▶ 预览。

## 构建并发布为远程 Bundle

跨项目复用必须按 URL 加载,故以「远程包」发布:

1. 选中 `assets/fish-game` → Inspector 勾选「Is Remote Bundle(配置为远程包)」。
2. 菜单「项目 → 构建发布」,新建构建任务:
   - 填写「资源服务器地址」为托管根 URL,例如 `https://your-cdn.com/`;
   - 点击构建。
3. 将产物中的 `remote/fish-game/` 目录上传到该服务器,得到加载 URL:`https://your-cdn.com/remote/fish-game`。

> 加载 Bundle 会同时载入其中的脚本,`FishGameEntry` 等组件会自动注册,引入方无需拷贝源码。

## 第三方项目引入

前提:引入方为 Cocos Creator 3.8.x,且场景内已有 2D Canvas + Camera。

```typescript
import { _decorator, Component, assetManager, instantiate, Prefab, find } from 'cc'
const { ccclass } = _decorator

@ccclass('FishGameLauncher')
export class FishGameLauncher extends Component {
  start() {
    assetManager.loadBundle('https://your-cdn.com/remote/fish-game', (err, bundle) => {
      if (err) { console.error(err); return }
      bundle.load('FishGame', Prefab, (e, prefab: Prefab) => {
        if (e) { console.error(e); return }
        const node = instantiate(prefab)
        find('Canvas')!.addChild(node)              // 必须挂在 Canvas 之下

        const entry = node.getComponent('FishGameEntry') as any
        entry.mode = 'win'                          // 'win' | 'lose'
        entry.onClickthrough = () => { /* CTA 点击穿透:跳转下载 / 商店 */ }
      })
    })
  }
}
```

`FishGameEntry` API:

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `'win' \| 'lose'` | 运行模式,默认 `win`;未知值降级为 `win` |
| `autoPlay` | `boolean` | 加载完成后是否自动开始,默认 `true` |
| `bundleName` | `string` | 所属 Bundle 名,默认 `fish-game` |
| `play(mode?)` | 方法 | 开始游戏(可指定模式) |
| `setMode(mode)` | 方法 | 切换模式(下次 `play`/`restart` 生效) |
| `restart()` | 方法 | 完整重置并重播当前模式 |
| `onClickthrough` | `() => void` | CTA 主按钮点击穿透回调 |

说明:`mode` 在 `addChild` 之后设置即可生效;关闭 `autoPlay` 时用 `entry.play('lose')` 手动开始。

## 资源工具

`tools/` 提供资源处理脚本。美术资源(`textures/`)有增删或替换后,运行一键流水线:

```bash
bash tools/build-assets.sh
```

| 脚本 | 作用 |
| --- | --- |
| `build-assets.sh` | 一键流水线:裁剪 → 压缩 → 重算清单(依次调用下列脚本) |
| `optimize-assets.sh` | 裁掉帧透明留白、压缩 / 下采样 UI 大图(需 ImageMagick) |
| `compress-png.mjs` | PNG 量化压缩,保留 8-bit alpha(pngquant 优先,upng-js 回退,仅在更小时替换) |
| `gen-manifest.mjs` | 扫描 `textures/` 生成 `data/manifest.json` |

依赖安装:

- ImageMagick:`brew install imagemagick`(mac)
- pngquant:`brew install pngquant`(mac);或 `cd tools && npm i pngquant-bin`
- 纯 JS 回退:`cd tools && npm i`(安装 upng-js)

`compress-png.mjs` 支持 `PNG_QUALITY` 环境变量调质量区间(默认 `65-95`,越低越小):

```bash
PNG_QUALITY=60-90 node tools/compress-png.mjs
```

> 处理资源后请回编辑器让其重新导入被覆盖的图片。

## 进一步优化(可选)

- **图集合批**:给帧目录(如 `textures/hero/lv120`)右键新建 **Auto Atlas**,勾选 Trim、设置 Max Size 2048。
  帧仍按原路径加载,引擎会自动重定向到图集,代码无需改动,可减少 draw call 与加载请求。
- **纹理压缩**:在构建面板为目标平台配置纹理压缩格式,进一步减小构建产物体积。

## 实现说明

- **兼容层**:`core/pf.ts` 将 Phaser 风格的 `add / tweens / time` 与显示对象 API 桥接到
  Cocos 的 `Node / Sprite / Graphics / Label`,内部沿用 720×1280、左上原点、Y 向下的设计坐标。
- **资源加载**:进入时预载全部帧为 SpriteFrame(带进度提示);帧清单与 trim/锚点数据来自 `data/manifest.json`。
- **自适应**:游戏区按 `min(画布宽/720, 画布高/1280)` 等比缩放并裁剪超出部分。
- **视觉近似**:进化面板背景与 CTA 渐变背景以纯色 / 半透明面板近似(不影响流程与交互)。
