import type { ProviderInfo } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'

/**
 * Провайдеры ИИ для окна: кто есть и на месте ли. Сейчас один - Claude Code; его CLI ищется
 * заново на каждый вопрос: его могли поставить, пока IDE открыта.
 */
export const listProviders = async (claude: ClaudeService): Promise<ProviderInfo[]> => {
  const cli = await claude.cli.locate()

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      available: cli !== null,
      unavailable: cli ? null : 'noCli',
    },
  ]
}
