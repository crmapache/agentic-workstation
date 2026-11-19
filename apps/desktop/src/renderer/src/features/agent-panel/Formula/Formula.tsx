import { memo, useRef, useLayoutEffect, useSyncExternalStore } from 'react'
import clsx from 'clsx'

import { formulaNode, loadFormulas, formulasVersion, subscribeFormulas } from '../formulas'
import styles from './Formula.module.scss'
import type { FormulaProps } from './Formula.types'

/**
 * Формула KaTeX - одна и та же для блока и для строки. Узел строит библиотека и
 * клонируется на место, React его не рисует: так из ответа на экран не попадает ни
 * строчки HTML. Пока KaTeX едет или формула не разобралась - на экране её исходник.
 */
export const Formula = memo(({ latex, display }: FormulaProps) => {
  // Приезд библиотеки слышат только формулы, а не вся лента.
  useSyncExternalStore(subscribeFormulas, formulasVersion)

  const host = useRef<HTMLSpanElement>(null)
  const node = formulaNode(latex, display)
  const source = display ? `$$${latex}$$` : `$${latex}$`
  const Tag = display ? 'div' : 'span'

  useLayoutEffect(() => {
    if (!node) {
      loadFormulas()
      return
    }

    host.current?.replaceChildren(node.cloneNode(true))
  }, [node])

  return (
    <Tag className={clsx(styles.formula, display && styles.block)}>
      {node ? (
        <>
          <span ref={host} className={styles.glyphs} />
          <span className={styles.copySource} aria-hidden>
            {source}
          </span>
        </>
      ) : (
        <span className={styles.source}>{source}</span>
      )}
    </Tag>
  )
})

Formula.displayName = 'Formula'
