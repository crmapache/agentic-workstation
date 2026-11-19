import { Component } from 'react'
import type { ErrorInfo } from 'react'

import type { PanelCrashProps, PanelCrashState } from './PanelCrash.types'
import { CrashScreen } from './parts/CrashScreen'

/**
 * Последняя преграда между ошибкой отрисовки и пустой панелью (как в ACC): React при
 * необработанной ошибке снимает всё дерево, и панель просто гасла бы без слов. Здесь -
 * «The panel hit an error» и «Reload the panel»: разговоры живут в процессах CLI за
 * панелью и перезагрузку переживают. Граница ошибок - только классом.
 */
export class PanelCrash extends Component<PanelCrashProps, PanelCrashState> {
  override state: PanelCrashState = { message: '' }

  static getDerivedStateFromError(error: unknown): PanelCrashState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Причина - в журнал окна: иначе её никто никогда не узнал бы.
    console.error('[agent-panel] панель упала:', error, info.componentStack)
  }

  override render() {
    if (!this.state.message) return this.props.children

    return <CrashScreen message={this.state.message} onReload={this.props.onReload} />
  }
}
