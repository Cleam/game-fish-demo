import { SpriteFrame } from 'cc'
import type { HeroLevel, NpcWaveId } from '../config/progression'

export interface TrimmedFrame {
  sourceWidth: number
  sourceHeight: number
  bounds: { x: number; y: number; width: number; height: number }
  renderOffset: { x: number; y: number }
  centerAnchor: { x: number; y: number }
  mouthAnchor: { x: number; y: number }
}

interface ManifestData {
  version: number
  heroesByLevel: Record<string, { atk: string[] }>
  heroEnd: string[]
  heroMove: string[]
  npcWaves: Record<string, { idle: string[] }>
  boss: { frames: string[] }
  trimData: Record<string, TrimmedFrame>
  ui: Record<string, string>
}

let _data: ManifestData | null = null
/** 以“帧文件名(basename,去扩展名)”为键的已预加载 SpriteFrame 映射 */
let _frames: Map<string, SpriteFrame> = new Map()

function basename(key: string): string {
  const seg = key.split('/').pop() ?? key
  return seg.replace(/\.png$/i, '')
}

/**
 * ManifestLoader:同步读取帧清单、trim/锚点数据,并把 manifest key 解析为
 * bundle 内已加载的 SpriteFrame。是 Actor / UI 等模块的资源事实来源。
 */
export const ManifestLoader = {
  init(data: ManifestData, frames: Map<string, SpriteFrame>): void {
    _data = data
    _frames = frames
  },

  isReady(): boolean {
    return _data !== null
  },

  /** manifest key(可能含目录前缀)→ 预加载的 SpriteFrame */
  getSpriteFrame(key: string): SpriteFrame | null {
    if (!key) return null
    return _frames.get(basename(key)) ?? null
  },

  getHeroFrames(level: HeroLevel): string[] {
    return _data?.heroesByLevel[level]?.atk ?? []
  },

  getNpcFrames(wave: NpcWaveId): string[] {
    return _data?.npcWaves[wave]?.idle ?? []
  },

  getHeroEndFrames(): string[] {
    return _data?.heroEnd ?? []
  },

  getHeroMoveFrames(): string[] {
    return _data?.heroMove ?? []
  },

  getBossFrames(): string[] {
    return _data?.boss.frames ?? []
  },

  getBossFrame(): string {
    return _data?.boss.frames?.[0] ?? ''
  },

  getTrimmedFrame(key: string): TrimmedFrame | null {
    return _data?.trimData[key] ?? null
  },

  getVisibleBoundsSize(key: string): { width: number; height: number } | null {
    const trim = _data?.trimData[key]
    if (!trim) return null
    return { width: trim.bounds.width, height: trim.bounds.height }
  },

  /** 逻辑名 → manifest key(如 'modal_win' → 'ui/modal_win') */
  getUiKey(name: string): string {
    return _data?.ui[name] ?? ''
  },
}
