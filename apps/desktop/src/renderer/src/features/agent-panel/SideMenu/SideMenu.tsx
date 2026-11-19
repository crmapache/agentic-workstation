import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Sheet } from '@agentic-workstation/ui/Sheet'

import { usePanelStore } from '../panel.store'
import type { MenuScreenProps } from '../panel.types'
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
  const menu = usePanelStore((store) => store.menu)
  const backMenu = usePanelStore((store) => store.backMenu)
  const closeMenu = usePanelStore((store) => store.closeMenu)
  const { data: info } = useAppInfo()
  const { screen } = menu
  const View = SCREEN_VIEWS[screen]
  const helpKey = SCREEN_HELP[screen]
  const title = t(`agentPanel.menu.titles.${screen}.title`)
  const isRoot = screen === 'menu'

  return (
    <Sheet
      open={menu.open}
      title={title}
      help={
        helpKey && (
          <HelpButton
            label={t('agentPanel.menu.help')}
            title={title}
            text={t(helpKey)}
            closeLabel={t('agentPanel.menu.helpClose')}
          />
        )
      }
      backLabel={t('agentPanel.menu.back')}
      closeLabel={t('agentPanel.menu.close')}
      screenKey={screen}
      restoreScroll={menu.back}
      footer={
        isRoot && (
          <>
            <span>{t('agentPanel.menu.footer')}</span>
            {info && (
              <span className={styles.version}>
                {t('agentPanel.menu.version', { version: info.version })}
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
