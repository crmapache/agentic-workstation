import { opensAsImage } from '@shared/preview-images'

import { tabTarget } from '../../../state/editor-tabs.utils'

/** Файл вкладки идёт в редактор кода: всё, что не картинка. */
export const opensAsCode = (path: string): boolean => !opensAsImage(path)

/**
 * Какой вид середины показывает вкладка: файл - редактором кода или картинкой (по
 * расширению), разница и история - своими.
 */
export const shownView = (key: string): 'file' | 'image' | 'diff' | 'history' => {
  const target = tabTarget(key)

  return target.kind === 'file' && opensAsImage(target.path) ? 'image' : target.kind
}
