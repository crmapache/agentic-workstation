import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PairingScreen.module.scss'
import { codeFromLink } from '../../../../lib/pairing-link'
import { usePairingStore } from '../../../../state/pairing.store'

/**
 * Пара вставленным адресом, а не открытым: приложение с экрана «Домой» не получает адрес из
 * камеры (lib/pairing-link.ts, codeFromLink). Код ложится туда же, куда и из открытого адреса.
 */
export const PairingLinkForm = () => {
  const { t } = useTranslation()
  const take = usePairingStore((state) => state.take)
  const [link, setLink] = useState('')

  const handleSubmit = () => {
    take(codeFromLink(link, window.location.origin))
    setLink('')
  }

  return (
    <form
      className={styles.linkForm}
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}>
      <TextField
        size="touch"
        type="url"
        autoComplete="off"
        label={t('pairing.link.label')}
        value={link}
        onChange={setLink}
      />
      <p className={styles.hint}>{t('pairing.link.hint')}</p>
      <Button size="touch" variant="secondary" type="submit" disabled={!link.trim()}>
        {t('pairing.link.submit')}
      </Button>
    </form>
  )
}
