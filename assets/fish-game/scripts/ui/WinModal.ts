import { PfContainer, PfImage, PfScene } from '../core/pf'
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants'
import { type CharacterSlot } from '../config/assetMapping'
import { ManifestLoader } from '../util/ManifestLoader'

const MODAL_SCALE = 0.61
// BUTTON_Y 控制 win 结算页“立即领取”按钮的垂直位置。
const BUTTON_Y = 1100
const FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif'

export class WinModal {
  private scene: PfScene
  private root: PfContainer

  constructor(scene: PfScene, layer: PfContainer, _heroSlot: CharacterSlot, onClaim: () => void) {
    this.scene = scene
    this.root = scene.add.container(GAME_WIDTH / 2, 0)
    this.root.setVisible(false)

    const overlay = scene.add.rectangle(0, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)

    const modal: PfImage = scene.add.image(0, GAME_HEIGHT / 2, '__DEFAULT').setVisible(false)
    modal.setScale(MODAL_SCALE)
    const modalKey = ManifestLoader.getUiKey('modal_win')
    if (modalKey) { modal.setTexture(modalKey); modal.setVisible(true) }

    const btnShadow = scene.add.rectangle(0, BUTTON_Y + 6, 352, 78, 0x6d3d00, 0.35)
    const btnBg = scene.add.rectangle(0, BUTTON_Y, 344, 70, 0xf0cb53)
    btnBg.setStrokeStyle(3, 0xffefbc)
    const btnTxt = scene.add.text(0, BUTTON_Y, '立即领取', {
      fontSize: '28px', color: '#342100', fontFamily: FONT, fontStyle: 'bold',
    }).setOrigin(0.5)

    btnBg.setInteractive({ useHandCursor: true })
    btnBg.on('pointerdown', () => {
      btnBg.disableInteractive()
      this.scene.tweens.add({
        targets: [btnBg, btnTxt],
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 90,
        yoyo: true,
        onComplete: onClaim,
      })
    })

    this.root.add([overlay, modal, btnShadow, btnBg, btnTxt])
    layer.add(this.root)
  }

  show(): void {
    this.root.setVisible(true)
    this.root.setAlpha(0)
    this.root.setScale(0.94)
    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 280,
      ease: 'Back.easeOut',
    })
  }

  hide(): void {
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 200,
      ease: 'Sine.easeIn',
      onComplete: () => this.root.setVisible(false),
    })
  }

  destroy(): void {
    this.root.destroy(true)
  }
}
