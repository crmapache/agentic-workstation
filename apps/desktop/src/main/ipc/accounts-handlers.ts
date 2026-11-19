import type { ClaudeService } from '../claude/claude-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

type AccountChannels = Extract<keyof InvokeHandlers, `accounts:${string}`>

/** Каналы аккаунтов Claude: проверить вход, позвать AccountService, вернуть состояние. */
export const createAccountsHandlers = (
  claude: ClaudeService,
): Pick<InvokeHandlers, AccountChannels> => {
  const { accounts } = claude
  const state = () => claude.getState()

  return {
    'accounts:refresh': async () => {
      await accounts.refresh()
      // Проба «умеет ли CLI два входа», переписывание и склейка - в фоне, не чаще раза в 10 минут.
      void claude.panel.upkeep.run()
      // Каталоги моделей вошедших: переезд на аккаунт поднимет процесс на модели, которую тот может.
      void claude.panel.accountModels.learnAll()

      return state()
    },
    'accounts:import': ({ sourceId }) => {
      assertString(sourceId, 'sourceId')
      accounts.import(sourceId)

      return state()
    },
  }
}
