export type GameState =
  | 'boot'
  | 'loading'
  | 'playing'
  | 'finalBattle'
  | 'resultWin'
  | 'resultLose'
  | 'cta'
  | 'restarting'

type StateListener = () => void

// 合法状态跳转表,禁止绕过状态机直接修改
const TRANSITIONS: Record<GameState, GameState[]> = {
  boot: ['loading', 'playing'],
  loading: ['playing'],
  playing: ['finalBattle', 'resultWin', 'resultLose'],
  finalBattle: ['resultWin', 'resultLose'],
  resultWin: ['cta'],
  resultLose: ['cta', 'restarting'],
  cta: [],
  restarting: ['playing'],
}

export class StateManager {
  private _state: GameState = 'boot'
  private listeners = new Map<GameState, StateListener[]>()

  get state(): GameState {
    return this._state
  }

  /** 重试时把状态机拉回初始态(源项目靠 Scene.restart 重建单例语义,这里显式重置) */
  reset(): void {
    this._state = 'boot'
  }

  on(state: GameState, fn: StateListener): void {
    if (!this.listeners.has(state)) this.listeners.set(state, [])
    this.listeners.get(state)!.push(fn)
  }

  off(state: GameState, fn: StateListener): void {
    const list = this.listeners.get(state)
    if (list) {
      const idx = list.indexOf(fn)
      if (idx !== -1) list.splice(idx, 1)
    }
  }

  enter(next: GameState): boolean {
    if (!TRANSITIONS[this._state].includes(next)) {
      console.warn(`[State] 非法跳转: ${this._state} → ${next}`)
      return false
    }
    this._state = next
    this.listeners.get(next)?.forEach(fn => fn())
    return true
  }
}

// 全局单例:所有模块共享同一状态机实例
export const stateManager = new StateManager()
