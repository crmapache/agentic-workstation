import { useTranslation } from 'react-i18next'

import type { AiMcpReviewProps } from '../AiJobModal.types'
import styles from '../../ConnectorsView/ConnectorsView.module.scss'
import { hostOf, isForeignHost } from '../../ConnectorsView/ConnectorsView.utils'
import { AddConnectorForm } from '../../ConnectorsView/parts/AddConnectorForm'

/**
 * Официальный MCP-сервер, который нашёл ИИ: хост крупно (туда уйдёт вход), предупреждение,
 * если он не на сайте документации, и обычная форма своего MCP с адресом и способом входа от
 * ИИ - человек может их поправить. Ключ, если он нужен, вводит только человек.
 */
export const AiMcpReview = ({ proposal, job, onAdded }: AiMcpReviewProps) => {
  const { t } = useTranslation()
  const { docsUrl, service } = job.request

  return (
    <div className={styles.form}>
      <p className={styles.host}>
        {t('connectors.ai.mcpHost')} <span className={styles.hostName}>{hostOf(proposal.url)}</span>
      </p>
      {isForeignHost(proposal.url, docsUrl) && (
        <p className={styles.warning}>
          {t('connectors.ai.foreignHost', { docs: hostOf(docsUrl) })}
        </p>
      )}
      <AddConnectorForm
        kind="mcp"
        googleReady
        initial={{ url: proposal.url, auth: proposal.auth, name: service }}
        autoFocus={false}
        onAdded={onAdded}
      />
    </div>
  )
}
