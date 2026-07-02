export type GameMode = 'win' | 'lose'

// 源项目从 URL ?mode= 读取;作为 bundle 由宿主通过入口组件参数传入,默认 win
export function normalizeMode(mode: string | null | undefined): GameMode {
  return mode === 'lose' ? 'lose' : 'win'
}
