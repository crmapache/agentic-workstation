import type { AccountUsage } from '@shared/account-usage'

export type UsageWindowsProps = {
  usage: AccountUsage
  /** Лимит отказал аккаунту до этого момента (мс): срок строки «снова доступен». */
  refusedUntil?: number | undefined
}
