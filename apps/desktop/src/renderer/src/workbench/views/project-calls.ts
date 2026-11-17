import { useTranslation } from 'react-i18next'

import { useScenarioQueues } from '../../state/scenarios.queries'
import { useClaudeCodeStore } from '../../features/claude-code/claude-code.store'
import { useClaudeState } from '../../features/claude-code/claude.queries'
import { tabName } from '../../features/claude-code/ConversationTabs/ConversationTabs.utils'
import type { ProjectCall } from '../../features/projects/ProjectTab/ProjectTab.types'
import type { CallTexts } from './project-calls.utils'
import { projectCalls } from './project-calls.utils'

/**
 * Зов по проектам - точки на вкладках проектов. Разговор - тот же источник, что у света вкладки
 * разговора (calls панели Claude Code): открыли разговор - гаснут оба. Звук из фонового проекта
 * так сразу показывает, откуда он и что там. Прогон сценария с вопросом зовёт, пока не ответили:
 * вид сценариев показывает только свой проект (ADR 0072), и его вопрос виден отсюда.
 */
export const useProjectCalls = (): ((rootPath: string) => readonly ProjectCall[]) => {
  const { t } = useTranslation()
  const calls = useClaudeCodeStore((store) => store.calls)
  const conversations = useClaudeState().data?.conversations ?? []
  const runs = useScenarioQueues().data?.live ?? []

  const text: CallTexts = {
    chat: (conversationId, call) => {
      const conversation = conversations.find((item) => item.id === conversationId)

      return t('projects.call', {
        chat: conversation ? tabName(conversation, t) : '',
        reason: t(`settings.sounds.events.${call.reason}.label`),
      })
    },
    run: (run) => t('projects.scenarioCall', { name: run.scenarioName }),
  }

  return (rootPath) => projectCalls(conversations, calls, runs, rootPath, text)
}
