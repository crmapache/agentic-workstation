import type { ClosableTabCall } from '../ClosableTab/ClosableTab.types'

export type CallBeaconProps = {
  /** Повод зова: успех, внимание, ошибка - тот же словарь, что у света вкладки. */
  tone: ClosableTabCall
  /**
   * Когда позвали (мс): от него фаза ореола и волны. Маячки, позвавшие разом, иначе дышали
   * бы в такт - мигали одним сигналом, а не переливались.
   */
  since?: number | undefined
}
