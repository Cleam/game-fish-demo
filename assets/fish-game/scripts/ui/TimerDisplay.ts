/**
 * TimerDisplay.ts —— 失败模式“吞噬时间”倒计时(HUD 层)。
 * show() 显示初始值;setValue 更新数值与颜色警示。
 */
import { PfContainer, PfScene, PfText } from '../core/pf'

const FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif'

export class TimerDisplay {
  private scene: PfScene
  private root: PfContainer
  private valueTxt: PfText

  constructor(scene: PfScene, x: number, y: number, layer: PfContainer) {
    this.scene = scene
    this.root = scene.add.container(x, y)
    this.root.setVisible(false)

    const bg = scene.add.rectangle(0, 0, 260, 38, 0x000000, 0.60)
    bg.setStrokeStyle(1, 0x446688)

    const labelTxt = scene.add.text(-108, 0, '吞噬时间', {
      fontSize: '14px', color: '#7799bb', fontFamily: FONT,
    }).setOrigin(0, 0.5)

    this.valueTxt = scene.add.text(20, 0, '10.0s', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    this.root.add([bg, labelTxt, this.valueTxt])
    layer.add(this.root)
  }

  show(initialValue?: number): void {
    if (initialValue !== undefined) this.setValue(initialValue)
    this.root.setVisible(true)
    this.root.setAlpha(0)
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 300, ease: 'Sine.easeOut' })
  }

  /** 更新显示秒数;剩余较少时文字变红警示 */
  setValue(value: number): void {
    const v = Math.max(0, value)
    this.valueTxt.setText(`${v.toFixed(1)}s`)
    const color = v > 5 ? '#ffffff' : v > 3 ? '#ffcc44' : '#ff4444'
    this.valueTxt.setColor(color)
  }

  hide(): void {
    this.scene.tweens.add({
      targets: this.root, alpha: 0, duration: 200, ease: 'Sine.easeIn',
      onComplete: () => this.root.setVisible(false),
    })
  }

  destroy(): void {
    this.root.destroy(true)
  }
}
