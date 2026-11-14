import { useTranslation } from 'react-i18next'

import { CodeSnippet } from '@agentic-workstation/ui/CodeSnippet'
import { Section } from '@agentic-workstation/ui/Section'

import { CODE_FACTS } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ConnectorConnectionProps } from '../ConnectorsView.types'
import { connectorFacts, isGoogleAppFailure } from '../ConnectorsView.utils'
import { GoogleAppCard } from './GoogleAppCard'
import { TokenReplace } from './TokenReplace'

/**
 * Откуда коннектор и как он вошёл: сбой словами (и что ответил сам сервис, и ссылка туда, где
 * это чинится), аккаунт или сервис, адрес и команда - строкой кода с копией, замена ключа.
 * Кнопки входа и выхода - в подвале окна (ConnectorSignIn). Сбой клиента Google - его карточка
 * прямо здесь: чинится там, а не входом.
 */
export const ConnectorConnection = ({ connector, google }: ConnectorConnectionProps) => {
  const { t } = useTranslation()
  const isSigningIn = connector.status === 'signing-in'
  const facts = connectorFacts(connector)

  // Входа ещё не было, сказать нечего: кнопка входа - в подвале, состояние - в шапке окна.
  if (!connector.failure && !isSigningIn && !facts.length && !connector.takesToken) return null

  return (
    <Section size="sm" title={t('connectors.connection.title')}>
      <div className={styles.stack}>
        {connector.failure && (
          <p className={styles.failure}>{t(`connectors.failure.${connector.failure}`)}</p>
        )}
        {connector.failureDetail && (
          <p className={styles.hint}>
            {t('connectors.failureDetail', { detail: connector.failureDetail })}
          </p>
        )}
        {connector.failure === 'slack-mcp-off' && connector.failureUrl && (
          <a className={styles.link} href={connector.failureUrl} target="_blank" rel="noreferrer">
            {t('connectors.openSlackApp')}
          </a>
        )}
        {isSigningIn && <p className={styles.hint}>{t('connectors.signingIn')}</p>}
        {isGoogleAppFailure(connector.failure) && <GoogleAppCard google={google} />}
        {facts.map(({ key, value }) => (
          <div key={key} className={styles.fact}>
            <span className={styles.factLabel}>{t(`connectors.facts.${key}`)}</span>
            {CODE_FACTS.has(key) ? (
              <CodeSnippet
                code={value}
                copyLabel={t('connectors.copy')}
                copiedLabel={t('connectors.copied')}
              />
            ) : (
              <span className={styles.factValue}>{value}</span>
            )}
          </div>
        ))}
        {connector.takesToken && <TokenReplace id={connector.id} />}
      </div>
    </Section>
  )
}
