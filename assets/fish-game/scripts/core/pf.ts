/**
 * pf.ts —— Phaser-on-Cocos 兼容层
 *
 * 目的:源项目为 Phaser 3 纯代码驱动。本层把 Phaser 常用的
 * `scene.add.* / scene.tweens / scene.time` 以及 GameObject API 桥接到
 * Cocos 的 Node/Sprite/Graphics/Label 上,使上层游戏逻辑可近乎逐行移植,
 * 从而最大程度保持「业务逻辑不变」。
 *
 * 关键约定:
 * - 设计坐标沿用 Phaser:原点左上角、Y 轴向下、设计尺寸 720×1280。
 * - 通过 p2c() 转换为 Cocos 局部坐标(中心原点、Y 向上)。
 * - 透明度用 UIOpacity;矩形/圆/圆弧/线条用 Graphics 绘制并做 Y 翻转。
 * - 自实现的补间与定时器由 PfScene.update(dtMs) 逐帧驱动,便于重试时统一清理。
 */
import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, v3, Layers } from 'cc'

export const DESIGN_W = 720
export const DESIGN_H = 1280

/** Phaser(左上原点,Y 向下) → Cocos 局部坐标(中心原点,Y 向上) */
export function p2c(x: number, y: number): Vec3 {
  return v3(x - DESIGN_W / 2, DESIGN_H / 2 - y, 0)
}

/** 常用数学工具,替代 Phaser.Math */
export const Mathx = {
  Clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v
  },
  Linear(a: number, b: number, t: number): number {
    return a + (b - a) * t
  },
}

function hexToColor(hex: number, alpha = 1): Color {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return new Color(r, g, b, Math.round(Mathx.Clamp(alpha, 0, 1) * 255))
}

/** SpriteFrame 解析器:根据 manifest key 返回已预加载的 SpriteFrame */
export type FrameResolver = (key: string) => SpriteFrame | null

// ────────────────────────────── 基础包装对象 ──────────────────────────────

export class PfObj {
  readonly node: Node
  protected _scene: PfScene
  protected _x = 0
  protected _y = 0
  protected _scaleX = 1
  protected _scaleY = 1
  protected _flipX = false
  protected _angle = 0
  protected _originX = 0.5
  protected _originY = 0.5
  protected _opacity: UIOpacity

  constructor(scene: PfScene, node: Node) {
    this._scene = scene
    this.node = node
    this._opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity)
    scene.root.addChild(node)
  }

  /** 供上层做存活性判断(等价 Phaser 的 gameObject.scene / .active) */
  get scene(): PfScene | null { return this.node && this.node.isValid ? this._scene : null }
  get active(): boolean { return !!this.node && this.node.isValid }

  protected syncTransform(): void {
    // 设计坐标(左上原点、Y 向下)→ 相对父节点的局部坐标(Y 向上翻转)。
    // 父容器自身已按同规则定位,子节点保留局部坐标即可正确嵌套。
    this.node.setPosition(this._x, -this._y, 0)
    this.node.setScale(this._scaleX * (this._flipX ? -1 : 1), this._scaleY, 1)
    this.node.angle = -this._angle
  }

  protected applyAnchor(): void {
    const ut = this.node.getComponent(UITransform)
    if (ut) ut.setAnchorPoint(this._originX, 1 - this._originY)
  }

  get x(): number { return this._x }
  set x(v: number) { this._x = v; this.syncTransform() }
  get y(): number { return this._y }
  set y(v: number) { this._y = v; this.syncTransform() }
  get scaleX(): number { return this._scaleX }
  set scaleX(v: number) { this._scaleX = v; this.syncTransform() }
  get scaleY(): number { return this._scaleY }
  set scaleY(v: number) { this._scaleY = v; this.syncTransform() }
  get flipX(): boolean { return this._flipX }
  set flipX(v: boolean) { this._flipX = v; this.syncTransform() }
  get angle(): number { return this._angle }
  set angle(v: number) { this._angle = v; this.syncTransform() }
  get alpha(): number { return this._opacity.opacity / 255 }
  set alpha(v: number) { this._opacity.opacity = Math.round(Mathx.Clamp(v, 0, 1) * 255) }

  setPosition(x: number, y: number): this { this._x = x; this._y = y; this.syncTransform(); return this }
  setScale(s: number, sy?: number): this { this._scaleX = s; this._scaleY = sy ?? s; this.syncTransform(); return this }
  setAlpha(a: number): this { this.alpha = a; return this }
  setFlipX(b: boolean): this { this.flipX = b; return this }
  setVisible(b: boolean): this { this.node.active = b; return this }
  get visible(): boolean { return this.node.isValid && this.node.active }
  setOrigin(ox: number, oy?: number): this { this._originX = ox; this._originY = oy ?? ox; this.applyAnchor(); return this }
  get displayWidth(): number { return (this.node.getComponent(UITransform)?.width ?? 0) * Math.abs(this._scaleX) }
  get displayHeight(): number { return (this.node.getComponent(UITransform)?.height ?? 0) * Math.abs(this._scaleY) }

  // 交互(Phaser setInteractive/on('pointerdown'|'pointerover'|'pointerout'))
  private _pointerDown?: () => void
  private _handlersBound = false
  setInteractive(_opt?: unknown): this {
    if (!this._handlersBound) {
      this.node.on(Node.EventType.TOUCH_END, () => this._pointerDown?.(), this)
      this._handlersBound = true
    }
    return this
  }
  disableInteractive(): this {
    this.node.off(Node.EventType.TOUCH_END)
    this._handlersBound = false
    return this
  }
  on(evt: string, cb: () => void): this {
    // 仅需响应点击;pointerover/out 在触屏场景下忽略
    if (evt === 'pointerdown') this._pointerDown = cb
    return this
  }

  destroy(_recursive?: boolean): void {
    this._scene.tweens.killTweensOf(this)
    if (this.node && this.node.isValid) this.node.destroy()
  }
}

// ────────────────────────────── 容器 ──────────────────────────────

export class PfContainer extends PfObj {
  private _depth = 0
  add(child: PfObj | PfObj[]): this {
    const list = Array.isArray(child) ? child : [child]
    for (const c of list) this.node.addChild(c.node)
    return this
  }
  setDepth(d: number): this { this._depth = d; return this }
  get depth(): number { return this._depth }
}

// ────────────────────────────── 图片 ──────────────────────────────

export class PfImage extends PfObj {
  private sprite: Sprite
  private resolver: FrameResolver

  constructor(scene: PfScene, key: string, resolver: FrameResolver) {
    const node = new Node('PfImage')
    node.layer = Layers.Enum.UI_2D
    node.addComponent(UITransform)
    super(scene, node)
    this.sprite = node.addComponent(Sprite)
    this.sprite.sizeMode = Sprite.SizeMode.CUSTOM
    this.sprite.trim = false
    this.resolver = resolver
    this.setTexture(key)
    this.applyAnchor()
  }

  private applyFrameSize(sf: SpriteFrame): void {
    const ut = this.node.getComponent(UITransform)!
    const os = sf.originalSize
    ut.setContentSize(os.width, os.height)
  }

  setTexture(key: string): this {
    const sf = this.resolver(key)
    this.sprite.spriteFrame = sf
    if (sf) this.applyFrameSize(sf)
    this.applyAnchor()
    return this
  }
  get texture(): SpriteFrame | null { return this.sprite.spriteFrame }

  setTint(hex: number): this { this.sprite.color = hexToColor(hex, 1); return this }
  clearTint(): this { this.sprite.color = Color.WHITE.clone(); return this }
  /** 源项目用于装饰面板裁剪;此处按整图渲染(装饰性近似),保留接口。 */
  setCrop(_x?: number, _y?: number, _w?: number, _h?: number): this { return this }
  get width(): number { return this.node.getComponent(UITransform)?.width ?? 0 }
  get height(): number { return this.node.getComponent(UITransform)?.height ?? 0 }
}

// ────────────────────────────── 矩形 ──────────────────────────────

export class PfRect extends PfObj {
  private g: Graphics
  private _w: number
  private _h: number
  private _fill: number
  private _fillAlpha: number
  private _hasStroke = false
  private _strokeW = 1
  private _strokeColor = 0xffffff
  private _strokeAlpha = 1

  constructor(scene: PfScene, w: number, h: number, fill: number, fillAlpha = 1) {
    const node = new Node('PfRect')
    node.layer = Layers.Enum.UI_2D
    node.addComponent(UITransform)
    super(scene, node)
    this.g = node.addComponent(Graphics)
    this._w = w; this._h = h; this._fill = fill; this._fillAlpha = fillAlpha
    this.redraw()
  }

  private redraw(): void {
    const ax = this._originX
    const ay = 1 - this._originY
    // 同步 UITransform 尺寸,使触摸命中区域与绘制矩形一致(按钮点击依赖此)
    const ut = this.node.getComponent(UITransform)
    if (ut) { ut.setContentSize(this._w, this._h); ut.setAnchorPoint(this._originX, ay) }
    const g = this.g
    g.clear()
    g.rect(-ax * this._w, -ay * this._h, this._w, this._h)
    g.fillColor = hexToColor(this._fill, this._fillAlpha)
    g.fill()
    if (this._hasStroke) {
      g.lineWidth = this._strokeW
      g.strokeColor = hexToColor(this._strokeColor, this._strokeAlpha)
      g.rect(-ax * this._w, -ay * this._h, this._w, this._h)
      g.stroke()
    }
  }

  get width(): number { return this._w }
  set width(v: number) { this._w = v; this.redraw() }
  setFillStyle(color: number, alpha = 1): this { this._fill = color; this._fillAlpha = alpha; this.redraw(); return this }
  setStrokeStyle(w: number, color: number, alpha = 1): this {
    this._hasStroke = true; this._strokeW = w; this._strokeColor = color; this._strokeAlpha = alpha; this.redraw(); return this
  }
  setOrigin(ox: number, oy?: number): this { super.setOrigin(ox, oy); this.redraw(); return this }
}

// ────────────────────────────── 圆 / 圆环 ──────────────────────────────

export class PfCircle extends PfObj {
  protected g: Graphics
  protected _r: number
  protected _fill: number
  protected _fillAlpha: number
  protected _hasStroke = false
  protected _strokeW = 1
  protected _strokeColor = 0xffffff
  protected _strokeAlpha = 1

  constructor(scene: PfScene, radius: number, fill: number, fillAlpha = 1) {
    const node = new Node('PfCircle')
    node.layer = Layers.Enum.UI_2D
    node.addComponent(UITransform)
    super(scene, node)
    this.g = node.addComponent(Graphics)
    this._r = radius; this._fill = fill; this._fillAlpha = fillAlpha
    this.redraw()
  }
  protected redraw(): void {
    const g = this.g
    g.clear()
    g.circle(0, 0, this._r)
    g.fillColor = hexToColor(this._fill, this._fillAlpha)
    g.fill()
    if (this._hasStroke) {
      g.lineWidth = this._strokeW
      g.strokeColor = hexToColor(this._strokeColor, this._strokeAlpha)
      g.circle(0, 0, this._r)
      g.stroke()
    }
  }
  setStrokeStyle(w: number, color: number, alpha = 1): this {
    this._hasStroke = true; this._strokeW = w; this._strokeColor = color; this._strokeAlpha = alpha; this.redraw(); return this
  }
  setFillStyle(color: number, alpha = 1): this { this._fill = color; this._fillAlpha = alpha; this.redraw(); return this }
}

/** Phaser add.arc(...,0,360,...) 仅用作整圆环,这里等价于带描边的圆 */
export class PfArc extends PfCircle {}

// ────────────────────────────── 通用 Graphics ──────────────────────────────

export class PfGraphics extends PfObj {
  private g: Graphics
  constructor(scene: PfScene) {
    const node = new Node('PfGraphics')
    node.layer = Layers.Enum.UI_2D
    node.addComponent(UITransform)
    super(scene, node)
    this.g = node.addComponent(Graphics)
  }
  clear(): this { this.g.clear(); return this }
  lineStyle(w: number, color: number, alpha = 1): this { this.g.lineWidth = w; this.g.strokeColor = hexToColor(color, alpha); return this }
  fillStyle(color: number, alpha = 1): this { this.g.fillColor = hexToColor(color, alpha); return this }
  /** Cocos Graphics 无原生渐变,取首色近似 */
  fillGradientStyle(c1: number, _c2: number, _c3: number, _c4: number, alpha = 1): this { this.g.fillColor = hexToColor(c1, alpha); return this }
  fillCircle(x: number, y: number, r: number): this { this.g.circle(x, -y, r); this.g.fill(); return this }
  fillRect(x: number, y: number, w: number, h: number): this { this.g.rect(x, -(y + h), w, h); this.g.fill(); return this }
  beginPath(): this { return this }
  moveTo(x: number, y: number): this { this.g.moveTo(x, -y); return this }
  lineTo(x: number, y: number): this { this.g.lineTo(x, -y); return this }
  strokePath(): this { this.g.stroke(); return this }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.g.moveTo(x1, -y1); this.g.lineTo(x2, -y2); this.g.stroke(); return this
  }
}

// ────────────────────────────── 文本 ──────────────────────────────

export interface TextStyle {
  fontSize?: string
  color?: string
  fontFamily?: string
  fontStyle?: string
  stroke?: string
  strokeThickness?: number
}

export class PfText extends PfObj {
  private label: Label
  constructor(scene: PfScene, str: string, style: TextStyle) {
    const node = new Node('PfText')
    node.layer = Layers.Enum.UI_2D
    node.addComponent(UITransform)
    super(scene, node)
    this.label = node.addComponent(Label)
    this.label.string = str
    this.label.fontSize = style.fontSize ? parseInt(style.fontSize, 10) : 18
    this.label.lineHeight = this.label.fontSize + 2
    this.label.isBold = style.fontStyle === 'bold'
    this.label.overflow = Label.Overflow.NONE
    if (style.color) this.label.color = Color.WHITE.clone().fromHEX(style.color)
    // 用 Label 内置描边(LabelOutline 组件在 3.8 已弃用)
    if (style.strokeThickness && style.stroke) {
      this.label.enableOutline = true
      this.label.outlineColor = Color.WHITE.clone().fromHEX(style.stroke)
      this.label.outlineWidth = style.strokeThickness
    }
    this.setOrigin(0.5, 0.5)
  }
  setText(str: string): this { this.label.string = str; return this }
  setColor(hex: string): this { this.label.color = Color.WHITE.clone().fromHEX(hex); return this }
}

// ────────────────────────────── 补间引擎 ──────────────────────────────

type Easing = (t: number) => number
const EASINGS: Record<string, Easing> = {
  'Linear': t => t,
  'Sine.easeIn': t => 1 - Math.cos((t * Math.PI) / 2),
  'Sine.easeOut': t => Math.sin((t * Math.PI) / 2),
  'Sine.easeInOut': t => -(Math.cos(Math.PI * t) - 1) / 2,
  'Back.easeOut': t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
}

const TWEEN_RESERVED = new Set(['targets', 'duration', 'ease', 'yoyo', 'repeat', 'delay', 'repeatDelay', 'onUpdate', 'onComplete', 'onStart'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tweenable = any
export interface TweenConfig {
  targets: Tweenable | Tweenable[]
  duration: number
  ease?: string
  yoyo?: boolean
  repeat?: number
  delay?: number
  onUpdate?: () => void
  onComplete?: () => void
  onStart?: () => void
  [prop: string]: unknown
}

class TweenInstance {
  targets: Tweenable[]
  props: string[]
  toValues: Record<string, number>
  fromValues: Map<Tweenable, Record<string, number>> = new Map()
  duration: number
  ease: Easing
  yoyo: boolean
  repeat: number
  delayRemain: number
  onUpdate?: () => void
  onComplete?: () => void
  onStart?: () => void
  elapsed = 0
  started = false
  reversed = false
  repeatsDone = 0
  dead = false

  constructor(cfg: TweenConfig) {
    this.targets = Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets]
    this.props = Object.keys(cfg).filter(k => !TWEEN_RESERVED.has(k))
    this.toValues = {}
    for (const p of this.props) this.toValues[p] = cfg[p] as number
    this.duration = cfg.duration
    this.ease = EASINGS[cfg.ease ?? 'Linear'] ?? EASINGS.Linear
    this.yoyo = !!cfg.yoyo
    this.repeat = cfg.repeat ?? 0
    this.delayRemain = cfg.delay ?? 0
    this.onUpdate = cfg.onUpdate
    this.onComplete = cfg.onComplete
    this.onStart = cfg.onStart
  }

  private capture(): void {
    for (const t of this.targets) {
      const rec: Record<string, number> = {}
      for (const p of this.props) rec[p] = (t[p] as number) ?? 0
      this.fromValues.set(t, rec)
    }
  }

  hasTarget(t: Tweenable): boolean { return this.targets.indexOf(t) !== -1 }

  /** 前进 dtMs 毫秒 */
  step(dtMs: number): void {
    if (this.dead) return
    if (this.delayRemain > 0) {
      this.delayRemain -= dtMs
      if (this.delayRemain > 0) return
    }
    if (!this.started) { this.started = true; this.capture(); this.onStart?.() }

    this.elapsed += dtMs
    let raw = this.duration > 0 ? Mathx.Clamp(this.elapsed / this.duration, 0, 1) : 1
    const dir = this.reversed ? 1 - raw : raw
    const e = this.ease(dir)
    for (const t of this.targets) {
      // 目标为 PfObj 且节点已销毁时跳过,避免写入无效对象
      if (t && t.node && t.node.isValid === false) continue
      const from = this.fromValues.get(t)!
      for (const p of this.props) {
        try { t[p] = Mathx.Linear(from[p], this.toValues[p], e) } catch { /* 忽略异常目标 */ }
      }
    }
    this.onUpdate?.()

    if (raw >= 1) {
      if (this.yoyo && !this.reversed) {
        this.reversed = true
        this.elapsed = 0
        return
      }
      if (this.repeat === -1 || this.repeatsDone < this.repeat) {
        this.repeatsDone++
        this.elapsed = 0
        this.reversed = false
        return
      }
      this.dead = true
      this.onComplete?.()
    }
  }

  stop(): void { this.dead = true }
}

export class PfTweens {
  private list: TweenInstance[] = []
  add(cfg: TweenConfig): TweenInstance {
    const t = new TweenInstance(cfg)
    this.list.push(t)
    return t
  }
  killTweensOf(target: Tweenable): void {
    for (const t of this.list) if (t.hasTarget(target)) t.dead = true
    this.list = this.list.filter(t => !t.dead)
  }
  update(dtMs: number): void {
    for (const t of this.list) t.step(dtMs)
    if (this.list.some(t => t.dead)) this.list = this.list.filter(t => !t.dead)
  }
  clear(): void { this.list = [] }
}

// ────────────────────────────── 定时器 ──────────────────────────────

export class PfTimerEvent {
  remaining: number
  readonly delay: number
  readonly loop: boolean
  readonly cb: () => void
  removed = false
  constructor(delay: number, loop: boolean, cb: () => void) {
    this.remaining = delay; this.delay = delay; this.loop = loop; this.cb = cb
  }
}

export class PfTime {
  private timers: PfTimerEvent[] = []
  delayedCall(ms: number, cb: () => void): PfTimerEvent {
    const t = new PfTimerEvent(ms, false, cb)
    this.timers.push(t)
    return t
  }
  addEvent(cfg: { delay: number; loop?: boolean; callback: () => void }): PfTimerEvent {
    const t = new PfTimerEvent(cfg.delay, !!cfg.loop, cfg.callback)
    this.timers.push(t)
    return t
  }
  removeEvent(t: PfTimerEvent | null | undefined): void {
    if (t) t.removed = true
  }
  update(dtMs: number): void {
    for (const t of this.timers) {
      if (t.removed) continue
      t.remaining -= dtMs
      while (!t.removed && t.remaining <= 0) {
        t.cb()
        if (t.loop) t.remaining += t.delay
        else { t.removed = true }
      }
    }
    if (this.timers.some(t => t.removed)) this.timers = this.timers.filter(t => !t.removed)
  }
  clear(): void { this.timers = [] }
}

// ────────────────────────────── 场景外观 ──────────────────────────────

export class PfScene {
  readonly root: Node
  readonly tweens = new PfTweens()
  readonly time = new PfTime()
  private resolver: FrameResolver

  constructor(root: Node, resolver: FrameResolver) {
    this.root = root
    this.resolver = resolver
  }

  readonly add = {
    container: (x = 0, y = 0): PfContainer => {
      const node = new Node('PfContainer')
      node.layer = Layers.Enum.UI_2D
      node.addComponent(UITransform)
      const c = new PfContainer(this, node)
      c.setPosition(x, y)
      return c
    },
    image: (x: number, y: number, key: string): PfImage => {
      const img = new PfImage(this, key, this.resolver)
      img.setPosition(x, y)
      return img
    },
    rectangle: (x: number, y: number, w: number, h: number, color = 0xffffff, alpha = 1): PfRect => {
      const r = new PfRect(this, w, h, color, alpha)
      r.setPosition(x, y)
      return r
    },
    circle: (x: number, y: number, radius: number, color = 0xffffff, alpha = 1): PfCircle => {
      const c = new PfCircle(this, radius, color, alpha)
      c.setPosition(x, y)
      return c
    },
    arc: (x: number, y: number, radius: number, _s: number, _e: number, _acw: boolean, color = 0xffffff, alpha = 1): PfArc => {
      const a = new PfArc(this, radius, color, alpha)
      a.setPosition(x, y)
      return a
    },
    graphics: (): PfGraphics => new PfGraphics(this),
    text: (x: number, y: number, str: string, style: TextStyle): PfText => {
      const t = new PfText(this, str, style)
      t.setPosition(x, y)
      return t
    },
  }

  /** 逐帧驱动补间与定时器(dt 单位秒) */
  update(dtSec: number): void {
    const dtMs = dtSec * 1000
    this.time.update(dtMs)
    this.tweens.update(dtMs)
  }

  /** 重试/销毁时统一清理 */
  reset(): void {
    this.tweens.clear()
    this.time.clear()
    this.root.removeAllChildren()
  }
}
