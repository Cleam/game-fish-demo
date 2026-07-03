import { _decorator, Component, Node, assetManager, instantiate, Prefab, Canvas, find } from 'cc'
const { ccclass, property } = _decorator

/**
 * DemoLauncher —— 本工程自测用启动器(位于主包,非 fish-game bundle 内)。
 *
 * 为什么需要它:FishGameEntry 属于 fish-game bundle;若把它直接挂在场景节点上,
 * 构建后主包加载场景时 bundle 脚本尚未注册,会报 5302/3817(找不到组件)。
 * 正确方式是运行时先 loadBundle 再实例化 prefab —— 与第三方接入方式一致。
 *
 * 用法:demo 场景里新建空节点(或直接用 Canvas),挂本组件,设置 mode 即可。
 */
@ccclass('DemoLauncher')
export class DemoLauncher extends Component {
  @property({ tooltip: '游戏模式:win 或 lose' })
  mode = 'win'

  @property({ tooltip: 'Bundle 名(同工程自测用名即可)' })
  bundleName = 'fish-game'

  start(): void {
    assetManager.loadBundle(this.bundleName, (err, bundle) => {
      if (err || !bundle) { console.error('[Demo] 加载 bundle 失败:', err); return }
      bundle.load('FishGame', Prefab, (e, prefab: Prefab) => {
        if (e || !prefab) { console.error('[Demo] 加载 FishGame 预制体失败:', e); return }
        const node = instantiate(prefab)
        // 向上查找 Canvas 作为挂载点;找不到则退回场景 Canvas 或当前节点
        let canvasNode: Node | null = null
        for (let p: Node | null = this.node; p; p = p.parent) {
          if (p.getComponent(Canvas)) { canvasNode = p; break }
        }
        canvasNode = canvasNode ?? find('Canvas') ?? this.node
        canvasNode.addChild(node)
        const entry = node.getComponent('FishGameEntry') as unknown as { mode: string } | null
        if (entry) entry.mode = this.mode
      })
    })
  }
}
