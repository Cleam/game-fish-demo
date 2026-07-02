export type HeroLevel = 'lv0' | 'lv30' | 'lv60' | 'lv90' | 'lv120'
export type NpcWaveId = '01' | '02' | '03' | '04' | '05'

export const HERO_LEVELS: HeroLevel[] = ['lv0', 'lv30', 'lv60', 'lv90', 'lv120']
export const UPGRADE_LEVELS: HeroLevel[] = ['lv30', 'lv60', 'lv90', 'lv120']
export const NPC_WAVES: NpcWaveId[] = ['01', '02', '03', '04', '05']

export const NPC_COUNTS: Record<NpcWaveId, number> = {
  '01': 6,
  '02': 6,
  '03': 6,
  '04': 6,
  '05': 1,
}

export interface HeroLevelInfo {
  label: string
  title: string
  statLabel: string
  powerLabel: string
  levelRequired: number
}

export const HERO_LEVEL_INFO: Record<HeroLevel, HeroLevelInfo> = {
  lv0: {
    label: '幽骨幼鱼',
    title: '初始鱼灵',
    statLabel: '骨刺/吞噬',
    powerLabel: '18.6万',
    levelRequired: 0,
  },
  lv30: {
    label: '食人鱼',
    title: '食人鱼',
    statLabel: '暴击/撕咬',
    powerLabel: '27.5万',
    levelRequired: 30,
  },
  lv60: {
    label: '史前蓝鲸',
    title: '史前蓝鲸',
    statLabel: '坦克/防御',
    powerLabel: '31.6万',
    levelRequired: 60,
  },
  lv90: {
    label: '巨型恐鳄',
    title: '巨型恐鳄',
    statLabel: '暴击/撞击',
    powerLabel: '52.8万',
    levelRequired: 90,
  },
  lv120: {
    label: '史前巨鳄',
    title: '史前巨鳄',
    statLabel: '输出/啃咬',
    powerLabel: '75.9万',
    levelRequired: 120,
  },
}

export function getNextHeroLevel(level: HeroLevel): HeroLevel | null {
  const idx = HERO_LEVELS.indexOf(level)
  if (idx < 0 || idx >= HERO_LEVELS.length - 1) return null
  return HERO_LEVELS[idx + 1]
}
