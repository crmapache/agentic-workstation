import { Fragment } from 'react'

import type { CodeRunsProps } from '../CodeBlock.types'
import { PathLink } from '../../PathLink/PathLink'

/**
 * Куски кода: путь - ссылка цвета кода (её выдаёт пунктир), остальное - как есть.
 * Внутри ссылки куски сохраняют цвета подсветки.
 */
export const CodeRuns = ({ runs }: CodeRunsProps) =>
  runs.map((run, index) => {
    const content = run.segments.map((segment, position) =>
      segment.className ? (
        <span key={position} className={segment.className}>
          {segment.text}
        </span>
      ) : (
        <Fragment key={position}>{segment.text}</Fragment>
      ),
    )

    return run.path ? (
      <PathLink key={index} request={run.path.request} folder={run.path.folder} tone="inherit">
        {content}
      </PathLink>
    ) : (
      <Fragment key={index}>{content}</Fragment>
    )
  })
