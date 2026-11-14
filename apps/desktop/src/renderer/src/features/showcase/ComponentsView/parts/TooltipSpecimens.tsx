import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { Specimen } from '../../Specimen/Specimen'

/**
 * Подсказки: строка текста и справка - показание с главным числом у заголовка, строки
 * «подпись - значение» с уточнением и ступенью, заметка внизу (как у колец лимитов).
 */
export const TooltipSpecimens = () => {
  const { t } = useTranslation('showcase')

  return (
    <>
      <Specimen label={t('specimens.tooltip')}>
        <Tooltip label={t('samples.tooltipText')} placement="top">
          <Button variant="secondary">{t('samples.hoverMe')}</Button>
        </Tooltip>
      </Specimen>

      <Specimen label={t('specimens.tooltipDetails')}>
        <Tooltip
          label={t('samples.detailsTitle')}
          placement="top"
          details={{
            value: t('samples.detailsValue'),
            tone: 'warning',
            rows: [
              {
                key: 'reset',
                label: t('samples.detailsReset'),
                value: t('samples.detailsResetValue'),
                aside: t('samples.detailsResetAt'),
              },
              {
                key: 'pace',
                label: t('samples.detailsPace'),
                value: t('samples.detailsPaceValue'),
                aside: t('samples.detailsPaceAside'),
              },
              {
                key: 'over',
                label: t('samples.detailsOver'),
                value: t('samples.detailsOverValue'),
                tone: 'warning',
              },
            ],
            note: t('samples.detailsNote'),
          }}>
          <Button variant="secondary">{t('samples.detailsHover')}</Button>
        </Tooltip>
      </Specimen>
    </>
  )
}
