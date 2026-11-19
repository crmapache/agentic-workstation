import type { ProviderId } from '@shared/providers'

export type ProviderPanelProps = {
  provider: ProviderId
  /** Своё провайдера при «Reload the panel»: зеркала его отдельных каналов. */
  onReload?: (() => void) | undefined
}
