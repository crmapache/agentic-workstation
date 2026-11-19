import { Fragment } from 'react'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { StatusDivider } from '../StatusDivider/StatusDivider'
import { extensionIcon } from '../../../lib/extension-icons'
import { invoke } from '../../../lib/ipc'
import { useExtensions } from '../../../state/extensions.queries'
import styles from './ExtensionItems.module.scss'

/**
 * Пункты строки состояния от расширений (ADR 0091): подпись, иконка и подсказка, нажатие -
 * команда расширения. Нет пунктов - нет и сегмента с чертой.
 */
export const ExtensionItems = () => {
  const { data } = useExtensions()
  const items = data?.extensions.flatMap((extension) => extension.contributions.statusItems) ?? []

  if (items.length === 0) return null

  return (
    <>
      <div className={styles.items}>
        {items.map((item) => {
          const button = (
            <Button
              variant="ghost"
              size="sm"
              icon={item.icon ? extensionIcon(item.icon) : undefined}
              disabled={!item.command}
              onClick={() => void invoke('extensions:statusClick', { key: item.key })}>
              {item.text}
            </Button>
          )

          return (
            <Fragment key={item.key}>
              {item.tooltip ? (
                <Tooltip label={item.tooltip} placement="top">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </Fragment>
          )
        })}
      </div>
      <StatusDivider />
    </>
  )
}
