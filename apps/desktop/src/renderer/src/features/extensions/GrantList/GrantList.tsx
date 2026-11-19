import { useTranslation } from 'react-i18next'

import { PERMISSION_RISK } from '@shared/extensions'

import { Badge } from '@agentic-workstation/ui/Badge'

import { RISK_TONES } from '../extensions.constants'
import styles from './GrantList.module.scss'
import type { GrantListProps } from './GrantList.types'

/** Права строками: что значит право, насколько опасно, на какие сайты и программы. */
export const GrantList = ({ grant }: GrantListProps) => {
  const { t } = useTranslation()

  return (
    <ul className={styles.grants}>
      {grant.permissions.map((permission) => (
        <li key={permission} className={styles.grant}>
          <span className={styles.grantHead}>
            <span className={styles.grantName}>
              {t(`extensions.permissions.${permission}.name`)}
            </span>
            <Badge tone={RISK_TONES[PERMISSION_RISK[permission]]}>
              {t(`extensions.risk.${PERMISSION_RISK[permission]}`)}
            </Badge>
          </span>
          <span className={styles.grantHint}>{t(`extensions.permissions.${permission}.hint`)}</span>
          {permission === 'network' && grant.hosts.length > 0 && (
            <span className={styles.code}>{grant.hosts.join(', ')}</span>
          )}
          {permission === 'shell' && grant.commands.length > 0 && (
            <span className={styles.code}>{grant.commands.join(', ')}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
