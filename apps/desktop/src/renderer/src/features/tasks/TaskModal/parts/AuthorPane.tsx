import { useTranslation } from 'react-i18next'

import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../TaskModal.module.scss'
import type { AuthorPaneProps } from '../TaskModal.types'
import { AuthorWait } from './AuthorWait'

/**
 * Вкладка «With AI»: человек говорит своими словами, что делать и когда, - ИИ пишет по ним имя,
 * текст для прогона и ритм и открывает форму. Пока пишет, поле не принимает нажатий, под ним
 * идут полоса и часы; отказ - под полем красным, словами окна.
 */
export const AuthorPane = ({ description, writing, failure, onDescribe }: AuthorPaneProps) => {
  const { t } = useTranslation()
  const error = failure
    ? t(`tasks.form.author.errors.${failure.error}`, {
        detail: failure.detail || t('tasks.form.author.noDetail'),
      })
    : undefined

  return (
    <div className={styles.author}>
      {/* Enter здесь - перевод строки: задание описывают абзацами, отправляет кнопка. */}
      <TextArea
        data-autofocus
        resizable
        label={t('tasks.form.author.what')}
        placeholder={t('tasks.form.author.placeholder')}
        value={description}
        disabled={writing !== null}
        error={error}
        onChange={onDescribe}
      />
      {writing && <AuthorWait since={writing.since} />}
    </div>
  )
}
