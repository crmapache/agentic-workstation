import { useState } from 'react'
import { FolderOpen, ShieldCheck, SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CHROME_EXTENSIONS_URL } from '@shared/connectors'

import { Button } from '@agentic-workstation/ui/Button'
import { CodeSnippet } from '@agentic-workstation/ui/CodeSnippet'
import { Section } from '@agentic-workstation/ui/Section'

import { BROWSER_STEPS } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { BrowserSetupProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Браузер для ИИ в окне коннектора (ADR 0040): профили Chrome, которые сейчас на связи
 * (вживую, событием главного процесса), и установка расширения - открыть страницу расширений
 * Chrome, показать папку для «Load unpacked». Chrome не открылся - адрес копируется.
 */
export const BrowserSetup = ({ browser }: BrowserSetupProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const [notice, setNotice] = useState<'addressCopied' | 'folderMissing' | null>(null)

  const handleOpenExtensions = async () => {
    if (await actions.openBrowserExtensions()) {
      setNotice(null)

      return
    }

    await navigator.clipboard.writeText(CHROME_EXTENSIONS_URL).catch(() => undefined)
    setNotice('addressCopied')
  }

  const handleShowFolder = async () => {
    setNotice((await actions.revealBrowserExtension()) ? null : 'folderMissing')
  }

  return (
    <>
      <Section size="sm" title={t('connectors.browser.profiles.title')}>
        <div className={styles.stack}>
          {browser.profiles.length === 0 && (
            <p className={styles.hint}>{t('connectors.browser.profiles.empty')}</p>
          )}
          {browser.namesDenied && (
            <>
              <p className={styles.hint}>{t('connectors.browser.profiles.denied')}</p>
              <div className={styles.buttons}>
                <Button size="sm" icon={ShieldCheck} onClick={() => void actions.openDiskAccess()}>
                  {t('connectors.browser.profiles.openDiskAccess')}
                </Button>
              </div>
            </>
          )}
          {browser.profiles.length > 0 && (
            <div className={styles.toolList}>
              {browser.profiles.map((profile) => (
                <div key={profile.key} className={styles.profileRow}>
                  <span className={styles.factValue}>{profile.name}</span>
                  <span className={styles.factLabel}>
                    {/* Своё имя копии - и профиль Chrome под ним: по нему человек её узнаёт. */}
                    {profile.chromeProfile && profile.chromeProfile !== profile.name
                      ? t('connectors.browser.profiles.detailProfile', {
                          profile: profile.chromeProfile,
                          browser: profile.browser,
                          version: profile.version,
                        })
                      : t('connectors.browser.profiles.detail', {
                          browser: profile.browser,
                          version: profile.version,
                        })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
      <Section
        size="sm"
        title={t('connectors.browser.setup.title')}
        help={<ConnectorsHelp topic="browser" />}>
        <div className={styles.stack}>
          {browser.failure && (
            <p className={styles.failure}>{t(`connectors.browser.failure.${browser.failure}`)}</p>
          )}
          <ol className={styles.steps}>
            {BROWSER_STEPS.map((step) => (
              <li key={step}>{t(`connectors.browser.setup.steps.${step}`)}</li>
            ))}
          </ol>
          <div className={styles.buttons}>
            <Button
              size="sm"
              icon={SquareArrowOutUpRight}
              onClick={() => void handleOpenExtensions()}>
              {t('connectors.browser.setup.openExtensions')}
            </Button>
            <Button size="sm" icon={FolderOpen} onClick={() => void handleShowFolder()}>
              {t('connectors.browser.setup.showFolder')}
            </Button>
          </div>
          {notice && (
            <p className={notice === 'folderMissing' ? styles.failure : styles.hint}>
              {t(`connectors.browser.setup.${notice}`)}
            </p>
          )}
          {browser.extensionDir && (
            <div className={styles.fact}>
              <span className={styles.factLabel}>{t('connectors.browser.setup.folder')}</span>
              <CodeSnippet
                code={browser.extensionDir}
                copyLabel={t('connectors.copy')}
                copiedLabel={t('connectors.copied')}
              />
            </div>
          )}
        </div>
      </Section>
    </>
  )
}
