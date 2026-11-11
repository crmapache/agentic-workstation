import type { ClaudeState } from '@shared/claude'
import type { ProviderInfo } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'
import { claudeProvider, claudeProviderOf } from './claude/claude-provider'

/**
 * Провайдеры ИИ для окна: кто есть, на месте ли и на каких моделях работает. Сейчас один -
 * Claude Code; его CLI ищется заново на каждый вопрос: его могли поставить, пока IDE открыта.
 * Модели - каталог аккаунта, который главный процесс уже держит (ClaudeState.models), и свои
 * модели человека из настроек панели.
 */
export const listProviders = async (claude: ClaudeService): Promise<ProviderInfo[]> => {
  const cli = await claude.cli.locate()

  return [
    claudeProvider({
      found: cli !== null,
      catalog: claude.cli.models,
      customModels: claude.settings.prefs.customModels,
    }),
  ]
}

/**
 * Провайдеры окну свежими: каталог моделей пришёл, человек добавил свою модель, CLI нашёлся или
 * пропал - событие providers:changed. Считается по каждому состоянию панели Claude, а уходит,
 * только когда список правда стал другим, - не на каждую букву ответа модели.
 */
export class ProviderWatch {
  private sent = ''

  constructor(private readonly send: (providers: ProviderInfo[]) => void) {}

  claudeChanged(state: Pick<ClaudeState, 'cli' | 'models' | 'prefs'>): void {
    const claude = claudeProviderOf(state)

    if (!claude) return

    const providers = [claude]
    const print = JSON.stringify(providers)

    if (print === this.sent) return

    this.sent = print
    this.send(providers)
  }
}
