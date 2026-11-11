import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import { useDiscardGuard } from '../../../state/discard-guard.store'

/**
 * Вопрос перед тем, как потерять правки, которые не дошли до диска (файл поменяли рядом,
 * удалили, не дали записать, файл за проектом): закрыть вкладку, проект, окно, выйти,
 * поставить обновление. Согласие - правки пропадут, отмена - всё остаётся как было, с
 * вопросом над кодом. Стоит в раскладке окна: спросить могут, и пока редактор не открыт.
 */
export const DiscardDialog = () => {
  const { t } = useTranslation()
  const request = useDiscardGuard((state) => state.request)
  const settle = useDiscardGuard((state) => state.settle)
  const kind = request?.kind ?? 'tabs'

  const handleCancel = () => settle(false)

  const handleConfirm = () => settle(true)

  return (
    <Dialog
      open={request !== null}
      title={t(`editor.discard.${kind}.title`)}
      actions={
        <>
          <Button variant="ghost" onClick={handleCancel}>
            {t('editor.discard.cancel')}
          </Button>
          <Button variant="primary" type="submit">
            {t(`editor.discard.${kind}.confirm`)}
          </Button>
        </>
      }
      onSubmit={handleConfirm}
      onClose={handleCancel}>
      {t('editor.discard.text', { count: request?.count ?? 0, name: request?.name ?? '' })}
    </Dialog>
  )
}
