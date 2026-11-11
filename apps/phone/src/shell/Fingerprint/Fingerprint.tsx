import { groupFingerprint } from '@agentic-workstation/remote-protocol/pairing-url'

import styles from './Fingerprint.module.scss'

/** Отпечаток ключа четырьмя группами моноширинным - так же, как его рисует окно IDE. */
export const Fingerprint = ({ value, label }: { value: string; label: string }) => (
  <code className={styles.fingerprint} aria-label={label}>
    {groupFingerprint(value.replaceAll(' ', ''))}
  </code>
)
