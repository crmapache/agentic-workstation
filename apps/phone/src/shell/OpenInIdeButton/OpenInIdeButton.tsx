import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useCommand } from '../../state/commands.hooks'

/**
 * Открыть недавний проект вкладкой в окне IDE - главная кнопка низа, когда проект закрыт:
 * его разговоры и история открываются только у открытого. Не разрушает ничего - без «точно?».
 * Что проект открылся, экран узнаёт из инвентаря IDE, а не из ответа команды.
 */
export const OpenInIdeButton = ({
  agentId,
  projectKey,
}: {
  agentId: string
  projectKey: string
}) => {
  const { t } = useTranslation()
  const open = useCommand(agentId, 'projects.open')

  return (
    <Button
      size="touch"
      variant="primary"
      disabled={open.isPending}
      onClick={() => open.mutate({ projectKey })}>
      {t('project.openInIde')}
    </Button>
  )
}
