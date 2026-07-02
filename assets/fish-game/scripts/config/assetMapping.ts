import type { HeroLevel } from './progression'
import { HERO_LEVEL_INFO, UPGRADE_LEVELS } from './progression'
import { ManifestLoader } from '../util/ManifestLoader'

export type CharacterSlot =
  | 'starter'
  | 'evolution_1'
  | 'evolution_2'
  | 'evolution_3'
  | 'final_actor'
  | 'boss_win'
  | 'enemy_lose'
export type PresentationVariant = 'portrait' | 'cta' | 'result'

const SLOT_TO_LEVEL: Record<CharacterSlot, HeroLevel> = {
  starter: 'lv0',
  evolution_1: 'lv30',
  evolution_2: 'lv60',
  evolution_3: 'lv90',
  final_actor: 'lv120',
  boss_win: 'lv120',
  enemy_lose: 'lv120',
}

export interface CharacterConfig {
  level: HeroLevel
  displayName: string
  cardName: string
  portraitLabel: string
  statsLabel: string
  powerLabel: string
  levelRequired: number
}

export function getCharacterConfig(slot: CharacterSlot): CharacterConfig {
  const level = SLOT_TO_LEVEL[slot]
  const info = HERO_LEVEL_INFO[level]
  return {
    level,
    displayName: info.label,
    cardName: info.title,
    portraitLabel: info.statLabel,
    statsLabel: '经验值',
    powerLabel: info.powerLabel,
    levelRequired: info.levelRequired,
  }
}

export function getPresentationFrame(slot: CharacterSlot, _variant: PresentationVariant): string {
  const level = SLOT_TO_LEVEL[slot]
  const frames = ManifestLoader.getHeroFrames(level)
  return frames[0] ?? ''
}

export function getPresentationScale(slot: CharacterSlot, variant: PresentationVariant): number {
  if (slot === 'final_actor' && variant === 'cta') return 0.7
  if (slot === 'final_actor') return 0.5
  return 0.45
}

export const CARD_SLOTS: CharacterSlot[] = ['evolution_1', 'evolution_2', 'evolution_3', 'final_actor']
export const CARD_LEVELS = UPGRADE_LEVELS
