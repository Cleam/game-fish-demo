import { PfContainer, PfScene } from '../core/pf'

/**
 * 吸食特效:在指定嘴部坐标绘制收缩的水波光环 + 汇聚光纹。
 * 全部用 Graphics/圆环代码绘制,不依赖帧资源(源项目已弃用 eff_* 帧)。
 */
export class SuctionEffectPlayer {
  private scene: PfScene
  private layer: PfContainer

  constructor(scene: PfScene, layer: PfContainer) {
    this.scene = scene
    this.layer = layer
  }

  play(mouthX: number, mouthY: number, radius = 72, duration = 650): void {
    const g = this.scene.add.graphics()
    g.setPosition(mouthX, mouthY)
    this.layer.add(g)

    for (let i = 0; i < 4; i++) {
      const ring = this.scene.add.arc(mouthX, mouthY, radius - i * 12, 0, 360, false, 0x9ae7ff, 0.12)
      ring.setStrokeStyle(2, 0xe6fbff, 0.38)
      this.layer.add(ring)
      this.scene.tweens.add({
        targets: ring,
        scaleX: 0.35,
        scaleY: 0.35,
        alpha: 0,
        duration,
        delay: i * 70,
        ease: 'Sine.easeIn',
        onComplete: () => ring.destroy(),
      })
    }

    g.lineStyle(3, 0xffffff, 0.72)
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6
      const x1 = Math.cos(a) * radius
      const y1 = Math.sin(a) * (radius * 0.55)
      const x2 = Math.cos(a + 0.75) * 12
      const y2 = Math.sin(a + 0.75) * 10
      const midX = x1 * 0.45
      const midY = y1 * 0.45
      g.beginPath()
      g.moveTo(x1, y1)
      g.lineTo((x1 + midX) * 0.5, (y1 + midY) * 0.5)
      g.lineTo(midX, midY)
      g.lineTo((midX + x2) * 0.5, (midY + y2) * 0.5)
      g.lineTo(x2, y2)
      g.strokePath()
    }

    const core = this.scene.add.circle(mouthX, mouthY, 18, 0xd7f6ff, 0.46)
    this.layer.add(core)

    this.scene.tweens.add({
      targets: [g, core],
      angle: 180,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        g.destroy()
        core.destroy()
      },
    })
  }

  playBurst(x: number, y: number, duration = 520): void {
    const g = this.scene.add.graphics()
    g.setPosition(x, y)
    this.layer.add(g)
    g.fillStyle(0xfff6be, 0.55)
    g.fillCircle(0, 0, 42)
    g.lineStyle(5, 0xffffff, 0.8)
    for (const [x1, y1, x2, y2] of [[-72, 0, 72, 0], [0, -72, 0, 72], [-52, -52, 52, 52], [-52, 52, 52, -52]] as const) {
      g.lineBetween(x1, y1, x2, y2)
    }
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.8,
      scaleY: 1.8,
      duration,
      ease: 'Sine.easeOut',
      onComplete: () => g.destroy(),
    })
  }
}
