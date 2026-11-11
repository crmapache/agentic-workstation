import { PenLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { TextField } from '@agentic-workstation/ui/TextField'

import { MAX_DIGIT_KEYS } from '../QuestionPrompt.constants'
import styles from '../QuestionPrompt.module.scss'
import type { QuestionBlockProps } from '../QuestionPrompt.types'

/** Цифра варианта справа: десятый и дальше - без неё. */
const digitOf = (position: number) => (position < MAX_DIGIT_KEYS ? String(position + 1) : undefined)

/**
 * Один вопрос: метка, текст и варианты с отметкой - кружок для одного ответа, квадрат
 * для нескольких - и цифрой справа. «Other» - на следующей цифре, открывает поле своего
 * ответа; вставленный файл ложится туда путём, в место каретки.
 */
export const QuestionBlock = ({
  question,
  index,
  draft,
  isKeyed,
  grabsFocus,
  onPick,
  onOther,
  onOwnAnswer,
  onOwnPaste,
  onFocus,
}: QuestionBlockProps) => {
  const { t } = useTranslation()
  const selection = question.multiSelect ? 'multiple' : 'single'
  const picks = draft.picks[index] ?? []
  const own = draft.custom[index]

  return (
    <div className={styles.question} data-keyed={isKeyed || undefined}>
      {(question.header || question.multiSelect) && (
        <div className={styles.questionHead}>
          {question.header && (
            <Badge tone="info" variant="soft">
              {question.header}
            </Badge>
          )}
          {question.multiSelect && (
            <span className={styles.pickAny}>{t('claudeCode.question.pickAny')}</span>
          )}
        </div>
      )}
      <div className={styles.questionText}>{question.question}</div>
      <Menu label={question.question}>
        {question.options.map((option, position) => (
          <MenuItem
            key={option.label}
            selection={selection}
            checked={picks.includes(option.label)}
            label={option.label}
            description={option.description || undefined}
            hint={isKeyed ? digitOf(position) : undefined}
            onSelect={() => onPick(option.label)}
          />
        ))}
        <MenuItem
          icon={PenLine}
          selection={selection}
          checked={own !== undefined}
          label={t('claudeCode.question.other')}
          hint={isKeyed ? digitOf(question.options.length) : undefined}
          onSelect={onOther}
        />
      </Menu>
      {own !== undefined && (
        <TextField
          label={t('claudeCode.question.other')}
          hideLabel
          autoFocus={grabsFocus}
          value={own}
          placeholder={t('claudeCode.question.otherPlaceholder')}
          onChange={onOwnAnswer}
          onPaste={onOwnPaste}
          onFocus={onFocus}
        />
      )}
    </div>
  )
}
