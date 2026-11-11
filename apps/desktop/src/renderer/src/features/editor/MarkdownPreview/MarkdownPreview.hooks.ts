import { useMemo, Fragment, useState, useEffect, createElement } from 'react'
import { useTranslation } from 'react-i18next'

import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'

import { documents } from '../documents'
import { formatSize } from '../editor.utils'
import { PREVIEW_RENDER_DELAY_MS } from '../markdown-preview.constants'
import type { PreviewRenderers } from '../markdown-preview.types'
import styles from './MarkdownPreview.module.scss'
import type { ImageProblem } from './MarkdownPreview.types'
import { PreviewCode } from './parts/PreviewCode'
import { PreviewImage } from './parts/PreviewImage'
import { PreviewLink } from './parts/PreviewLink'

/**
 * Текст файла для просмотра - из модели редактора, той же, что правит код: просмотр
 * видит набранное раньше, чем оно ушло на диск. Перерисовка - после короткой паузы в
 * наборе. Текст помнится вместе с моделью: сменилась модель (другой проект с тем же
 * путём, файл перечитан заново) - сразу её текст, а не прежний.
 */
export const useDocumentText = (projectId: string, path: string): string => {
  const model = documents.find(projectId, path)?.model ?? null
  const [shown, setShown] = useState(() => ({ model, text: model?.getValue() ?? '' }))

  useEffect(() => {
    if (!model) return

    let timer: number | undefined
    const subscription = model.onDidChangeContent(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        () => setShown({ model, text: model.getValue() }),
        PREVIEW_RENDER_DELAY_MS,
      )
    })

    return () => {
      window.clearTimeout(timer)
      subscription.dispose()
    }
  }, [model])

  return shown.model === model ? shown.text : (model?.getValue() ?? '')
}

/**
 * Чем просмотр файла рисует особые куски разметки (PreviewRenderers): у каждого файла
 * свои - пути в ссылках и картинках считаются от его папки.
 */
export const usePreviewRenderers = (projectId: string, filePath: string): PreviewRenderers =>
  useMemo(
    () => ({
      code: (code, language) => createElement(PreviewCode, { code, language }),
      image: (image) => createElement(PreviewImage, { projectId, filePath, image }),
      // Куски ссылки - в обёртке без ключей: это не список, а содержимое одной ссылки.
      link: (href, children) =>
        createElement(PreviewLink, {
          projectId,
          filePath,
          href,
          children: createElement(Fragment, null, ...children),
        }),
      task: (checked) =>
        createElement(
          'span',
          { className: styles.task },
          createElement(ChoiceMark, { shape: 'square', checked, tone: 'success' }),
        ),
      lineMark: (line) =>
        createElement('span', {
          className: styles.lineMark,
          'data-line': line,
          'aria-hidden': true,
        }),
    }),
    [projectId, filePath],
  )

/** Почему картинки нет - словами; у картинки с сайта, которую не разрешили, - null. */
export const useProblemText = (problem: ImageProblem): string | null => {
  const { t } = useTranslation()

  switch (problem.kind) {
    case 'hidden':
      return null
    case 'missing':
      return t('editor.markdown.image.missing')
    case 'notImage':
      return t('editor.markdown.image.notImage')
    case 'tooLarge':
      return t('editor.markdown.image.tooLarge', {
        size: formatSize(problem.size),
        limit: formatSize(problem.limit),
      })
    case 'failed':
      return 'reason' in problem && problem.reason !== 'unknown'
        ? t(`editor.markdown.image.${problem.reason}`)
        : t('editor.markdown.image.failed')
  }
}
