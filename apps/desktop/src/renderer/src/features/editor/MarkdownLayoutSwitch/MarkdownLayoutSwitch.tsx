import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { MarkdownLayout } from '../editor.types'
import { useMarkdownLayout, useMarkdownLayoutStore } from '../markdown-layout.store'
import { LAYOUT_OPTIONS } from './MarkdownLayoutSwitch.constants'
import styles from './MarkdownLayoutSwitch.module.scss'
import type { MarkdownLayoutSwitchProps } from './MarkdownLayoutSwitch.types'

/**
 * Вид файла Markdown: только код, код и просмотр рядом, только просмотр, как в WebStorm.
 * Плавающая панель в правом верхнем углу файла: полупрозрачная, чтобы не закрывать текст
 * под собой, под курсором и с фокусом - в полную силу. Выбранный вид запоминается и для
 * следующих файлов.
 */
export const MarkdownLayoutSwitch = ({ projectId, path }: MarkdownLayoutSwitchProps) => {
  const { t } = useTranslation()
  const layout = useMarkdownLayout(projectId, path)
  const choose = useMarkdownLayoutStore((state) => state.choose)

  const handleChoose = (option: MarkdownLayout) => choose(projectId, path, option)

  return (
    <div role="group" aria-label={t('editor.markdown.layout')} className={styles.switch}>
      {LAYOUT_OPTIONS.map((option) => (
        <IconButton
          key={option.layout}
          icon={option.icon}
          size="sm"
          label={t(option.labelKey)}
          active={layout === option.layout}
          tooltipPlacement="bottom"
          onClick={() => handleChoose(option.layout)}
        />
      ))}
    </div>
  )
}
