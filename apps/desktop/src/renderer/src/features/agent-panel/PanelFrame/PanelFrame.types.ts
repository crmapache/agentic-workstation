export type PanelFrameProps = {
  /** Своё провайдера при «Reload the panel»: у Claude - зеркала его каналов (аккаунты, плагины). */
  onReload?: (() => void) | undefined
}
