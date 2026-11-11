import { memo, useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import styles from './ThinkingRow.module.scss'
import type { ThinkingRowProps } from './ThinkingRow.types'

/**
 * Размышления пачки работы одной карточкой, как THINK в ACC: свёрнута, в шапке чип
 * (дышит, пока мысль пишется), последняя мысль одной строкой и счётчик, если их больше
 * одной. Раскрытая - «N thoughts» и все мысли абзацами. Новая мысль дописывается сюда же.
 */
export const ThinkingRow = memo(({ items }: ThinkingRowProps) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const last = items.at(-1)
  const isWriting = items.some((item) => item.streaming)

  const handleToggle = () => setIsOpen((value) => !value)

  if (!last) return null

  return (
    <div className={styles.thinkingRow}>
      <Disclosure expanded={isOpen} onClick={handleToggle}>
        <span className={clsx(styles.chip, isWriting && styles.writing)}>
          <Badge variant="soft">{t('claudeCode.feed.think.chip')}</Badge>
        </span>
        <span className={styles.lastThought}>{last.text.trim().split('\n')[0]}</span>
        {items.length > 1 && !isOpen && <span className={styles.count}>{items.length}</span>}
      </Disclosure>
      {isOpen && (
        <div className={styles.body}>
          <div className={styles.label}>
            {t('claudeCode.feed.think.thoughts', { count: items.length })}
          </div>
          {items.map((item) => (
            <p key={item.id} className={styles.thought}>
              {item.text.trim()}
            </p>
          ))}
        </div>
      )}
    </div>
  )
})

ThinkingRow.displayName = 'ThinkingRow'
