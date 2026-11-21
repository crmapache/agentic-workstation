import { useState } from 'react'
import { Eye, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CloudKeyCode } from '@shared/tracker'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../CloudModal.module.scss'
import type { AccountKeyProps } from '../CloudModal.types'
import { hasAccount, keyFailureText } from '../CloudModal.utils'
import { useCloudActions } from '../../cloud.actions'

/**
 * Ключ аккаунта: показать его системным окном главного процесса (окно IDE ключа не видит), а
 * если ключ на этой машине пропал - начать новый аккаунт. Почему пропал, говорит строка
 * состояния над кнопкой.
 */
export const AccountKey = ({ cloud }: AccountKeyProps) => {
  const { t } = useTranslation()
  const { showKey, startOver } = useCloudActions()
  const [code, setCode] = useState<CloudKeyCode | null>(null)
  const failure = keyFailureText(t, code)

  const handleShow = () => void showKey()
  const handleStartOver = async () => setCode(await startOver())

  if (cloud.failure === 'keyLost')
    return (
      <div className={styles.key}>
        <Button variant="secondary" icon={RotateCcw} onClick={() => void handleStartOver()}>
          {t('tracker.cloud.startOver')}
        </Button>
        {failure && <p className={styles.failure}>{failure}</p>}
      </div>
    )

  if (!hasAccount(cloud)) return null

  return (
    <div className={styles.key}>
      <Button variant={cloud.keySaved ? 'secondary' : 'primary'} icon={Eye} onClick={handleShow}>
        {t('tracker.cloud.copyKey')}
      </Button>
      {!cloud.keySaved && <p className={styles.warning}>{t('tracker.cloud.saveKey')}</p>}
    </div>
  )
}
