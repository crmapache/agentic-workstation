import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CloudKeyCode } from '@shared/tracker'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../CloudModal.module.scss'
import { keyFailureText } from '../CloudModal.utils'
import { useCloudActions } from '../../cloud.actions'

/**
 * Ключ другого компьютера: доска сольётся с его облаком после «да» в системном окне. «Нет» там
 * оставляет поле как было, без ошибки.
 */
export const UseKeyForm = () => {
  const { t } = useTranslation()
  const { connect } = useCloudActions()
  const [key, setKey] = useState('')
  const [code, setCode] = useState<CloudKeyCode | null>(null)

  const handleChange = (value: string) => {
    setKey(value)
    setCode(null)
  }
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!key.trim()) return

    const refused = await connect(key)

    setCode(refused)

    if (!refused) setKey('')
  }

  return (
    <form className={styles.useKey} onSubmit={(event) => void handleSubmit(event)}>
      <TextField
        label={t('tracker.cloud.useKey')}
        icon={KeyRound}
        placeholder={t('tracker.cloud.keyPlaceholder')}
        value={key}
        error={keyFailureText(t, code)}
        onChange={handleChange}
      />
      <Button variant="secondary" type="submit" disabled={!key.trim()}>
        {t('tracker.cloud.connect')}
      </Button>
    </form>
  )
}
