// 游戏设计尺寸(竖屏 9:16)
export const GAME_WIDTH = 720
export const GAME_HEIGHT = 1280

// 各层级 depth 值(数值越大越靠前)
export const LAYER_DEPTH = {
  background: 0,
  battle: 10,
  effect: 20,
  hud: 30,
  evolution: 40,
  modal: 50,
  cta: 60,
} as const
