import { useEffect } from 'react'

import type { Conversation } from '@shared/claude'
import type { Project } from '@shared/workspace'

import { useChatHandoffStore } from '../../state/chat-handoff.store'
import { useClaudeCodeStore } from './claude-code.store'

/**
 * Куски, переданные в чат из другой части окна («Send to Chat» в редакторе), - чипами в конец
 * поля активной вкладки по порядку, каждый своим шагом отмены, с фокусом в поле. Чужой проект ждёт своего: кусок
 * взяли в одном проекте, а на экране уже другой - в чужой разговор он не попадёт. Вкладки ещё
 * нет (панель только заводит её или стоит экран «Let's start») - кусок ждёт её, а не ложится в
 * черновик, который новая вкладка не возьмёт.
 */
export const useChatHandoff = (project: Project | null, active: Conversation | null) => {
  const pending = useChatHandoffStore((store) => store.pending)
  const appendChip = useClaudeCodeStore((store) => store.appendChip)
  const draftKey = active?.id

  useEffect(() => {
    if (pending.length === 0 || !project || !draftKey) return

    for (const handoff of useChatHandoffStore.getState().take(project.id)) {
      appendChip(draftKey, handoff.chip)
    }
  }, [pending, project, draftKey, appendChip])
}
