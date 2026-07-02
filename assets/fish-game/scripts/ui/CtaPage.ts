import { PfContainer, PfScene } from '../core/pf'
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants'
import { type CharacterSlot, getCharacterConfig, getPresentationScale } from '../config/assetMapping'
import { FrameAnimPlayer } from '../game/FrameAnimPlayer'
import { ManifestLoader } from '../util/ManifestLoader'

const FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif'

export class CtaPage {
  private scene: PfScene
  private root: PfContainer
  private endPlayer?: FrameAnimPlayer

  constructor(scene: PfScene, layer: PfContainer, heroSlot: CharacterSlot) {
    this.scene = scene
    this.root = scene.add.container(GAME_WIDTH / 2, 0)
    this.root.setVisible(false)

    const cfg = getCharacterConfig(heroSlot)
    // 源项目使用竖向渐变背景;Cocos Graphics 无原生渐变,用近似纯色填充。
    const bg = scene.add.graphics()
    bg.fillGradientStyle(0x30005f, 0x30005f, 0xe500b9, 0x8a00d7, 1)
    bg.fillRect(-GAME_WIDTH / 2, 0, GAME_WIDTH, GAME_HEIGHT)

    const title = scene.add.text(0, 126, '你能吞噬多少鱼了', {
      fontSize: '48px', color: '#ffe42f', fontFamily: FONT, fontStyle: 'bold', stroke: '#a14d00', strokeThickness: 8,
    }).setOrigin(0.5)

    const subTitle = scene.add.text(0, 212, cfg.displayName, {
      fontSize: '30px', color: '#ffffff', fontFamily: FONT, fontStyle: 'bold', stroke: '#7f4dea', strokeThickness: 5,
    }).setOrigin(0.5)

    const heroGlow = scene.add.circle(0, 576, 252, 0x5300ac, 0.22)
    heroGlow.setStrokeStyle(10, 0xdc8dff, 0.34)
    this.endPlayer = new FrameAnimPlayer(scene)
    const hero = this.endPlayer.gameObject
    hero.setPosition(0, 584)
    hero.setScale(getPresentationScale(heroSlot, 'cta') * 1.55)
    hero.setOrigin(0.5, 0.5)

    this.scene.tweens.add({
      targets: hero,
      y: 562,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.root.add([bg, title, subTitle, heroGlow, hero])
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
    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      duration: 420,
      ease: 'Sine.easeOut',
    })
  }

  destroy(): void {
    this.endPlayer?.destroy()
    this.root.destroy(true)
  }
}
