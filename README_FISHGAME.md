# 海底进化战斗 —— Cocos Creator Bundle

将原 Phaser 3 竖屏试玩项目 `fish`(海底进化战斗,720×1280)重构为 Cocos Creator 3.8.8 工程,
并以 **Asset Bundle** 形式对外提供,供其他 Cocos 项目 `loadBundle` + `instantiate` 后展示。

业务逻辑与原项目一致:5 波 NPC「吸食」+ 4 次进化(lv0→lv120),然后

- `win`:胜利结算弹窗(立即领取)→ CTA 页
- `lose`:体力条 / 吞噬时间 → Boss 吞噬主角 → 失败弹窗(重新挑战 / 退出挑战)

---

## 一、目录结构

```text
assets/fish-game/                 ← 已配置为 Asset Bundle(bundleName = "fish-game")
├── FishGame.prefab               对外入口 Prefab(挂 FishGameEntry 组件)
├── data/manifest.json            帧清单 + trim 包围盒 / 中心锚点 / 嘴部锚点
├── textures/                     全部帧图(hero / npc / boss / ui)
│   ├── hero/{lv0,lv30,lv60,lv90,lv120}   进化各阶段 atk 帧
│   ├── hero/end                  结算/CTA 展示用 idle 帧
│   ├── hero/move                 失败结算逃跑 move 帧
│   ├── npc/{01..05}              各波次普通鱼 idle 帧
│   ├── boss/                     Boss/最终敌人帧
│   └── ui/                       bg / as1 / as2 / boss / modal_win
└── scripts/
    ├── FishGameEntry.ts          ★ 对外入口组件(mode / autoPlay / onClickthrough)
    ├── core/pf.ts                Phaser→Cocos 兼容层(add/tweens/time + GameObject)
    ├── core/StateManager.ts      全局状态机
    ├── config/                   constants / progression / assetMapping / mode
    ├── util/ManifestLoader.ts    帧清单 & SpriteFrame 解析
    ├── game/                     FrameAnimPlayer / Actor / NpcWaveController / GameController
    ├── effects/SuctionEffectPlayer.ts
    └── ui/                       EvolutionCard / WinModal / LoseModal / CtaPage / StaminaBar / TimerDisplay

tools/gen-manifest.mjs            离线重新生成 manifest.json(美术增删时运行)
```

---

## 二、首次在编辑器中打开

1. 用 Cocos Creator **3.8.8** 打开本工程。编辑器会自动为脚本与图片导入生成 `.meta`。
2. 在资源管理器选中 `assets/fish-game` 文件夹,确认 Inspector 中 **“配置为 Bundle”** 已勾选,
   Bundle 名称为 `fish-game`(本工程已写入 `assets/fish-game.meta`,一般会自动识别;
   若未勾选请手动勾选并 Apply)。
3. 若图片首次导入后类型不是 `sprite-frame`,一般无需处理:脚本按
   `textures/<路径>/spriteFrame` 加载 SpriteFrame 子资源,Cocos 默认即会生成该子资源。

> 若增删了 `textures/` 下的美术资源,请在项目根目录执行 `node tools/gen-manifest.mjs`
> 重新生成 `assets/fish-game/data/manifest.json`。

---

## 三、创建 demo 场景自测(约 1 分钟)

编辑器场景文件(含 Camera / SceneGlobals 等)不适合手工生成,请按以下步骤创建:

1. 资源管理器右键 `assets` → 新建 → Scene,命名如 `Main`,双击打开。
   新场景会自动带 `Canvas`(内含 `Camera`)。
2. 把 `assets/fish-game/FishGame.prefab` 拖到层级管理器的 **Canvas 之下**。
3. 选中该节点,在 Inspector 的 `FishGameEntry` 组件上设置:
   - `Mode`:`win` 或 `lose`
   - `Auto Play`:勾选(加载完成后自动开始)
4. 运行预览即可看到完整流程。

> 也可不用 Prefab:在 Canvas 下新建空节点 → 添加 `FishGameEntry` 组件 → 设置 Mode 即可。

---

## 四、构建 Bundle

1. 菜单 **项目 → 构建发布**,选择目标平台(如 Web Mobile)。
2. 勾选构建后,`fish-game` 会作为独立 Bundle 输出到发布目录的 `assets/fish-game/` 下。
3. 供其他项目复用时,把该 Bundle 目录部署到可访问的 URL(**跨项目复用必须用 URL 加载**)。

---

## 五、宿主项目集成

在宿主 Cocos 项目中(需已有 Canvas 场景):

```typescript
import { assetManager, instantiate, Prefab, Node, find } from 'cc'

// 跨项目复用用远程 URL;同项目内可直接用 bundle 名 'fish-game'
assetManager.loadBundle('https://your-cdn.com/assets/fish-game', (err, bundle) => {
  if (err) { console.error(err); return }
  bundle.load('FishGame', Prefab, (e, prefab: Prefab) => {
    if (e) { console.error(e); return }
    const node = instantiate(prefab)
    const canvas = find('Canvas')          // 必须挂在 Canvas 之下
    canvas.addChild(node)

    const entry = node.getComponent('FishGameEntry') as any
    entry.mode = 'win'                      // 'win' | 'lose'
    entry.onClickthrough = () => {          // CTA 主按钮点击穿透(可选)
      console.log('用户点击了 CTA,可在此跳转下载/商店')
    }
    // autoPlay 默认为 true,加载完帧资源后自动开始;
    // 若关闭 autoPlay,可手动:entry.play('win')
  })
})
```

对外 API(`FishGameEntry`):

| 成员 | 说明 |
| --- | --- |
| `mode: 'win' \| 'lose'` | 运行模式,默认 `win`;未知值降级为 `win` |
| `autoPlay: boolean` | 加载完成后是否自动开始,默认 `true` |
| `bundleName: string` | 所属 bundle 名,默认 `fish-game` |
| `play(mode?)` | 开始游戏(可指定模式) |
| `setMode(mode)` | 切换模式(下次 play/restart 生效) |
| `restart()` | 完整重置并重播当前模式(等价失败弹窗“重新挑战”) |
| `onClickthrough` | CTA 点击穿透回调 |

---

## 六、实现要点与与原项目的差异

- **兼容层驱动**:`core/pf.ts` 把 Phaser 的 `add.* / tweens / time` 与 GameObject API
  桥接到 Cocos 的 `Node / Sprite / Graphics / Label`,使游戏逻辑(流程、进化、吸食、
  Boss、结算、重试清理)得以近乎逐行移植,业务逻辑不变。
- **坐标系**:内部沿用原设计坐标(左上原点、Y 向下、720×1280),由 `contentRoot`
  锚点左上统一转换到 Cocos(Y 向上),嵌套容器天然对齐。
- **资源加载**:原项目运行时按需动态加载 PNG;Cocos 版在进入时一次性预载全部帧
  SpriteFrame(带进度提示),更契合「bundle 一次性加载展示」的场景。
- **自适应**:游戏区按 `min(画布宽/720, 画布高/1280)` 等比缩放并做 `RECT` 裁剪(SHOW_ALL)。
- **视觉近似**(不影响流程与交互):
  - 进化面板背景原用 `as1` 图裁剪,兼容层不支持 setCrop,改为半透明面板近似;
  - CTA 竖向渐变背景改为近似纯色(Cocos Graphics 无原生渐变);
  - 原项目未被引用的遗留代码(`TimelineRunner`、`timeline.win/lose`、`EffectPlayer`)未移植。
- **未打包**:原始 `assets/images/_tmp`(176MB,未使用)未纳入;`ui/as2.png`(约 19MB)
  体积偏大,后续可按需压缩(本次保持原样,不改动业务)。

---

## 七、验证

- 已通过 TypeScript 类型检查(基于 cc 类型桩,`strict:false`,0 error)。
- `manifest.json` 生成校验:heroAtk=114 / heroEnd=30 / heroMove=20 / npc=300 / boss=16 / ui=5,trim=460。
- 建议在编辑器中按第三节自测:`win` 与 `lose` 全流程、`lose` 连续「重新挑战」多次应无重复角色 / 重复计时 / 特效残留。
