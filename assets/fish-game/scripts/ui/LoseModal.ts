import { PfContainer, PfScene } from '../core/pf'
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants'
import { type CharacterSlot, getPresentationScale } from '../config/assetMapping'
import { FrameAnimPlayer } from '../game/FrameAnimPlayer'
import { ManifestLoader } from '../util/ManifestLoader'

const CARD_Y = GAME_HEIGHT / 2 - 10
const FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif'

export class LoseModal {
  private scene: PfScene
  private root: PfContainer
  private endPlayer?: FrameAnimPlayer

  constructor(scene: PfScene, layer: PfContainer, _heroSlot: CharacterSlot, onRetry: () => void, onExit: () => void) {
    this.scene = scene
    this.root = scene.add.container(GAME_WIDTH / 2, 0)
    this.root.setVisible(false)

    const overlay = scene.add.rectangle(0, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x02060f, 0.82)
    const cracks = scene.add.graphics()
    cracks.lineStyle(4, 0xdde9ff, 0.64)
    cracks.beginPath()
    cracks.moveTo(-24, CARD_Y - 64)
    cracks.lineTo(18, CARD_Y - 12)
    cracks.lineTo(52, CARD_Y + 36)
    cracks.moveTo(96, CARD_Y - 88)
    cracks.lineTo(74, CARD_Y - 28)
    cracks.lineTo(26, CARD_Y + 10)
    cracks.moveTo(-118, CARD_Y + 28)
    cracks.lineTo(-62, CARD_Y - 14)
    cracks.lineTo(-12, CARD_Y - 86)
    cracks.strokePath()

    const heroPlate = scene.add.circle(0, CARD_Y - 116, 86, 0x0d1839, 0.78)
    heroPlate.setStrokeStyle(5, 0x9cb6e8, 0.72)
    this.endPlayer = new FrameAnimPlayer(scene)
    const hero = this.endPlayer.gameObject
    hero.setPosition(0, CARD_Y - 124)
    hero.setScale(getPresentationScale('final_actor', 'result') * 0.86)
    hero.setOrigin(0.5, 0.5)

    const title = scene.add.text(0, CARD_Y - 12, '挑战失败', {
      fontSize: '74px', color: '#f7faff', fontFamily: FONT, fontStyle: 'bold', stroke: '#5874ab', strokeThickness: 10,
    }).setOrigin(0.5)

    const subTitle = scene.add.text(0, CARD_Y + 58, '你的体力还需加强', {
      fontSize: '24px', color: '#ffe58d', fontFamily: FONT, fontStyle: 'bold',
    }).setOrigin(0.5)

    const retryTxt = scene.add.text(0, CARD_Y + 128, '重新挑战', {
      fontSize: '30px', color: '#26ec96', fontFamily: FONT, fontStyle: 'bold', stroke: '#0d4028', strokeThickness: 5,
    }).setOrigin(0.5)

    const exitTxt = scene.add.text(0, CARD_Y + 182, '退出挑战', {
      fontSize: '30px', color: '#ff5f57', fontFamily: FONT, fontStyle: 'bold', stroke: '#4c1717', strokeThickness: 5,
    }).setOrigin(0.5)

    const retryHit = scene.add.rectangle(0, CARD_Y + 128, 260, 54, 0x000000, 0.001)
    const exitHit = scene.add.rectangle(0, CARD_Y + 182, 260, 54, 0x000000, 0.001)
    retryHit.setInteractive({ useHandCursor: true })
    exitHit.setInteractive({ useHandCursor: true })

    retryHit.on('pointerdown', () => {
      retryHit.disableInteractive()
      exitHit.disableInteractive()
      this.scene.tweens.add({
        targets: retryTxt, scaleX: 0.94, scaleY: 0.94, duration: 90, yoyo: true, onComplete: onRetry,
      })
    })

    exitHit.on('pointerdown', () => {
      retryHit.disableInteractive()
      exitHit.disableInteractive()
      this.scene.tweens.add({
        targets: exitTxt, scaleX: 0.94, scaleY: 0.94, duration: 90, yoyo: true, onComplete: onExit,
      })
    })

    this.root.add([overlay, cracks, heroPlate, hero, title, subTitle, retryTxt, exitTxt, retryHit, exitHit])
    layer.add(this.root)
  }

  show(): void {
    const endFrames = ManifestLoader.getHeroEndFrames()
    if (endFrames.length > 0 && this.endPlayer) {
      const trim = ManifestLoader.getTrimmedFrame(endFrames[0])
      if (trim) {
        this.endPlayer.gameObject.setOrigin(trim.centerAnchor.x, trim.centerAnchor.y)
      }
      this.endPlayer.play(endFrames, { frameRate: 18, loop: true })
    }
    this.root.setVisible(true)
    this.root.setAlpha(0)
    this.root.setScale(0.92)
    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 320,
      ease: 'Back.easeOut',
    })
  }

  hide(): void {
    this.endPlayer?.stop()
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 220,
      ease: 'Sine.easeIn',
      onComplete: () => this.root.setVisible(false),
    })
  }

  destroy(): void {
    this.endPlayer?.destroy()
    this.root.destroy(true)
  }
}
