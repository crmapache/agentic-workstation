import type { LucideIcon } from 'lucide-react'
import { SquareSlash, CornerDownRight, createLucideIcon } from 'lucide-react'

import type { FitStep } from '../composer-fit.utils'

/** Значок строки подсказки «/» по её виду. Файлы и папки «@» - иконкой типа (FileIcon). */
export const SUGGEST_ICONS: Record<'command' | 'value', LucideIcon> = {
  command: SquareSlash,
  value: CornerDownRight,
}

/**
 * Значок кнопки «/» - косая черта набранного символа, как в ACC: крутая, высотой с лупу.
 * У lucide `Slash` диагональ во весь квадрат, и рядом со скрепкой она читается
 * разделителем. Одна линия светлее соседей, поэтому штрих толще общего: глаз сравнивает
 * чернила, а не рамки.
 */
export const SLASH_GLYPH: LucideIcon = createLucideIcon({
  name: 'slash-glyph',
  node: [['path', { d: 'M16 2.5 8 21.5', strokeWidth: 2.5, key: 'stroke' }]],
})

/**
 * Значок кнопки вложений - скрепка lucide `Paperclip` с наклоном слэша рядом: две
 * косые в одном ряду стоят под одним углом. Контур - из lucide (данные иконки пакет
 * наружу не отдаёт). Поворот - разница наклонов: 45.6° у скрепки, 67.2° у слэша;
 * сдвиг возвращает её в середину квадрата. Поменялся наклон слэша - пересчитать.
 */
export const PAPERCLIP_GLYPH: LucideIcon = createLucideIcon({
  name: 'paperclip-glyph',
  node: [
    [
      'path',
      {
        d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551',
        transform: 'translate(-0.8 0) rotate(-21.6 12.3 12)',
        key: 'clip',
      },
    ],
  ],
})

/** Пустая история отправленного - один и тот же объект: селектор не будит перерисовку. */
export const NO_SENT: readonly never[] = []

/** Квадратные кнопки ряда, которые поле может отдать на узкой панели. */
export const ROW_SQUARES: ReadonlySet<FitStep> = new Set(['slash', 'search'])
