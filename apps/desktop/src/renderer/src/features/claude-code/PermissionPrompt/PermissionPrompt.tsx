import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { Kbd } from '@agentic-workstation/ui/Kbd'

import { useClaudeActions } from '../claude-actions.hooks'
import { toolLabel } from '../tool-summary.utils'
import { useDigitHotkeys } from './PermissionPrompt.hooks'
import styles from './PermissionPrompt.module.scss'
import type { PermissionPromptProps } from './PermissionPrompt.types'
import { permissionTitle } from './PermissionPrompt.utils'
import { PermissionPreview } from './parts/PermissionPreview'

/**
 * Вопрос разрешения над полем ввода: что модель хочет сделать, само действие и кнопки
 * с цифрами 1-3. Вместо кнопки можно написать в поле - сообщение уйдёт модели, а вопрос
 * закроется отказом.
 */
export const PermissionPrompt = ({ conversation, request }: PermissionPromptProps) => {
  const { t } = useTranslation()
  const { respond } = useClaudeActions()
  const more = conversation.pendingCount - 1

  const decide = (decision: 'allow' | 'allowAlways' | 'deny') => () =>
    void respond(conversation.id, request.requestId, {
      kind: 'permission',
      decision: decision === 'deny' ? { behavior: 'deny', message: '' } : { behavior: decision },
    })

  const actions = request.alwaysKind
    ? [decide('allow'), decide('allowAlways'), decide('deny')]
    : [decide('allow'), decide('deny')]

  useDigitHotkeys(actions)

  return (
    <div className={styles.permissionPrompt}>
      <Card
        tone="accent"
        icon={ShieldAlert}
        title={t('claudeCode.permission.title')}
        actions={
          <span className={styles.meta}>
            {more > 0
              ? t('claudeCode.permission.more', { count: more })
              : toolLabel(request.toolName)}
            {' · '}
            {t('claudeCode.permission.underMode', {
              mode: t(`claudeCode.modes.labels.${request.mode}`),
            })}
          </span>
        }>
        <div className={styles.body}>
          <div className={styles.title}>{permissionTitle(request, t)}</div>
          <PermissionPreview request={request} />
          {request.reason && <div className={styles.reason}>{request.reason}</div>}
          <div className={styles.actions}>
            <Button variant="primary" size="sm" onClick={decide('allow')}>
              {t('claudeCode.permission.allow')}
              <Kbd keys={['1']} />
            </Button>
            {request.alwaysKind && (
              <Button size="sm" onClick={decide('allowAlways')}>
                {request.alwaysKind === 'mode'
                  ? t('claudeCode.permission.allowSession')
                  : t('claudeCode.permission.allowAlways')}
                <Kbd keys={['2']} />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={decide('deny')}>
              {t('claudeCode.permission.deny')}
              <Kbd keys={[request.alwaysKind ? '3' : '2']} />
            </Button>
          </div>
          <div className={styles.hint}>{t('claudeCode.permission.orType')}</div>
        </div>
      </Card>
    </div>
  )
}
