import { useTranslation } from 'react-i18next'

import { Kbd } from '@agentic-workstation/ui/Kbd'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ExtensionModal.module.scss'
import type { ExtensionPartProps } from '../ExtensionModal.types'
import { extensionKeyGlyphs } from '../../../../lib/extension-keys'
import { shortcutKeys } from '../../../../lib/keys'

/** Что расширение сейчас внесло в IDE: команды с клавишами, виды, строку состояния, ИИ, хуки. */
export const Contributions = ({ extension }: ExtensionPartProps) => {
  const { t } = useTranslation()
  const { commands, views, statusItems, tools, hooks } = extension.contributions
  const groups = [
    {
      label: t('extensions.modal.commandsList'),
      lines: commands.map((command) => ({
        key: command.key,
        text: command.title,
        keys: command.keys ? shortcutKeys(extensionKeyGlyphs(command.keys)) : null,
      })),
    },
    {
      label: t('extensions.modal.viewsList'),
      lines: views.map((view) => ({ key: view.key, text: view.title, keys: null })),
    },
    {
      label: t('extensions.modal.statusList'),
      lines: statusItems.map((item) => ({ key: item.key, text: item.text, keys: null })),
    },
    {
      label: t('extensions.modal.toolsList'),
      lines: tools.map((tool) => ({ key: tool.name, text: tool.name, keys: null })),
    },
    {
      label: t('extensions.modal.hooksList'),
      lines: hooks.map((hook) => ({
        key: hook,
        text: t(`extensions.modal.hooks.${hook}`),
        keys: null,
      })),
    },
  ].filter((group) => group.lines.length > 0)

  return (
    <Section
      size="sm"
      title={t('extensions.modal.adds')}
      description={groups.length ? undefined : t('extensions.modal.addsNothing')}>
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <span className={styles.groupLabel}>{group.label}</span>
          {group.lines.map((line) => (
            <span key={line.key} className={styles.line}>
              <span className={styles.lineText}>{line.text}</span>
              {line.keys && <Kbd keys={line.keys} />}
            </span>
          ))}
        </div>
      ))}
    </Section>
  )
}
