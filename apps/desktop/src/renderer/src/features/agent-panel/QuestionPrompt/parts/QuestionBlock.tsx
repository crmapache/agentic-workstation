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
 * ответа; вставленный файл ложится туда путём, в место каретки. Вопрос без вариантов - сразу
 * поле; где свой ответ не принимают, «Other» нет; секретный ответ поле прячет.
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
  const ownOnly = question.options.length === 0
  const own = draft.custom[index] ?? (ownOnly ? '' : undefined)

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
            <span className={styles.pickAny}>{t('agentPanel.question.pickAny')}</span>
          )}
        </div>
      )}
      <div className={styles.questionText}>{question.question}</div>
      {!ownOnly && (
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
          {question.other !== false && (
            <MenuItem
              icon={PenLine}
              selection={selection}
              checked={own !== undefined}
              label={t('agentPanel.question.other')}
              hint={isKeyed ? digitOf(question.options.length) : undefined}
              onSelect={onOther}
            />
          )}
        </Menu>
      )}
      {own !== undefined && (
        <TextField
          label={t('agentPanel.question.other')}
          hideLabel
          autoFocus={grabsFocus || ownOnly}
          type={question.secret ? 'password' : 'text'}
          value={own}
          placeholder={t('agentPanel.question.otherPlaceholder')}
          onChange={onOwnAnswer}
          onPaste={onOwnPaste}
          onFocus={onFocus}
        />
      )}
    </div>
  )
}
