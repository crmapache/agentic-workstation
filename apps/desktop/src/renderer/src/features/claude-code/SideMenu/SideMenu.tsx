import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Sheet } from '@agentic-workstation/ui/Sheet'

import { useClaudeCodeStore } from '../claude-code.store'
import type { MenuScreenProps } from '../claude.types'
import { useAppInfo } from '../../../state/app-info.queries'
import { SCREEN_HELP, SCREEN_VIEWS } from './SideMenu.constants'
import styles from './SideMenu.module.scss'
import { MenuRoot } from './parts/MenuRoot'

/**
 * Боковое меню панели (кнопка настроек в шапке), как в ACC: лист справа поверх
 * разговора, свой экран за каждым пунктом - история, плагины, аккаунты, настройки.
 * Пояснение экрана - «?» в шапке листа (SCREEN_HELP). Шаг назад - к родителю экрана,
 * Esc - тот же шаг, на корне закрывает меню.
 */
export const SideMenu = ({ project, conversation }: MenuScreenProps) => {
  const { t } = useTranslation()
  const menu = useClaudeCodeStore((store) => store.menu)
  const backMenu = useClaudeCodeStore((store) => store.backMenu)
  const closeMenu = useClaudeCodeStore((store) => store.closeMenu)
  const { data: info } = useAppInfo()
  const { screen } = menu
  const View = SCREEN_VIEWS[screen]
  const helpKey = SCREEN_HELP[screen]
  const title = t(`claudeCode.menu.titles.${screen}.title`)
  const isRoot = screen === 'menu'

  return (
    <Sheet
      open={menu.open}
      title={title}
      help={
        helpKey && (
          <HelpButton
            label={t('claudeCode.menu.help')}
            title={title}
            text={t(helpKey)}
            closeLabel={t('claudeCode.menu.helpClose')}
          />
        )
      }
      backLabel={t('claudeCode.menu.back')}
      closeLabel={t('claudeCode.menu.close')}
      screenKey={screen}
      restoreScroll={menu.back}
      footer={
        isRoot && (
          <>
            <span>{t('claudeCode.menu.footer')}</span>
            {info && (
              <span className={styles.version}>
                {t('claudeCode.menu.version', { version: info.version })}
              </span>
            )}
          </>
        )
      }
      onBack={isRoot ? undefined : backMenu}
      onClose={closeMenu}>
      {isRoot ? (
        <MenuRoot project={project} conversation={conversation} />
      ) : (
        View && <View project={project} conversation={conversation} />
      )}
    </Sheet>
  )
}
