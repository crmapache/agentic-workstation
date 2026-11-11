import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import type { CloseWorkingDialogProps } from '../ClaudeCodeView.types'
import { keyLine } from '../../panel-keys.utils'

/**
 * Вопрос перед закрытием работающей вкладки клавишей: ⌘W легко нажать, думая, что фокус
 * в редакторе, а закрытие гасит агента. Крестик не спрашивает - клик целится в конкретную
 * вкладку. Вопрос называет клавишу, которой вкладку вернуть.
 */
export const CloseWorkingDialog = ({
  conversation,
  onConfirm,
  onCancel,
}: CloseWorkingDialogProps) => {
  const { t } = useTranslation()

  return (
    <Dialog
      open={conversation !== null}
      title={t('claudeCode.tabs.closeWorking.title')}
      onSubmit={onConfirm}
      onClose={onCancel}
      actions={
        <>
          <Button type="button" onClick={onCancel}>
            {t('claudeCode.tabs.closeWorking.cancel')}
          </Button>
          {/* Главная кнопка в фокусе: быстрый Enter закрывает, Esc оставляет. */}
          <Button type="submit" variant="primary" autoFocus>
            {t('claudeCode.tabs.closeWorking.close')}
          </Button>
        </>
      }>
      {t('claudeCode.tabs.closeWorking.note', { key: keyLine('reopenTab') })}
    </Dialog>
  )
}
