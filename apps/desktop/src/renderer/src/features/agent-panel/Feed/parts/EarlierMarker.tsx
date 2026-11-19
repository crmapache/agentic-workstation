import { useTranslation } from 'react-i18next'

import type { EarlierMarkerProps } from '../Feed.types'
import { CheckpointRow } from '../../NoticeRow/parts/CheckpointRow'

/**
 * Метка над лентой, как в ACC: выше в транскрипте есть ещё - нажатие приносит страницу
 * ранних сообщений, читаемое при этом не сдвигается. Пока страница едет, метка остаётся той
 * же кнопкой: подмена на строку другой высоты дёргала ленту; повторное нажатие гасит
 * useLoadEarlier.
 */
export const EarlierMarker = ({ onLoad }: EarlierMarkerProps) => {
  const { t } = useTranslation()

  return (
    <CheckpointRow chip={t('agentPanel.notice.chips.earlier')} onClick={onLoad}>
      {t('agentPanel.feed.loadEarlier')}
    </CheckpointRow>
  )
}
