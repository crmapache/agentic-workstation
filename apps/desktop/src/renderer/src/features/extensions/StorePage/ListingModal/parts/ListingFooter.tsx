import { useState } from 'react'
import { Flag, Download, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ListingModal.module.scss'
import type { ListingPartProps } from '../ListingModal.types'
import { listingAction } from '../ListingModal.utils'
import { useExtensionsStore } from '../../../extensions.store'
import { useStoreActions } from '../../../store.actions'
import { storeErrorText } from '../../../store.utils'

/**
 * Подвал карточки магазина: поставить (с правами - «поставить и разрешить»), обновить или что уже
 * стоит; справа - пожаловаться, а у своего - снять с магазина.
 */
export const ListingFooter = ({ view }: ListingPartProps) => {
  const { t } = useTranslation()
  const actions = useStoreActions()
  const open = useExtensionsStore((store) => store.open)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const action = listingAction(view)
  const { listing, installed } = view

  const handleInstall = async () => {
    setBusy(true)

    const result = await actions.install(listing.id, null)

    setBusy(false)

    if (result.ok) open({ kind: 'extension', id: listing.id })
    else setNote({ ok: false, text: storeErrorText(t, result) })
  }

  const handleReport = async () => {
    const result = await actions.report(listing.id, 'Reported from the IDE')

    setNote(
      result.ok
        ? { ok: true, text: t('extensions.store.listing.reportSent') }
        : { ok: false, text: storeErrorText(t, result) },
    )
  }

  const handleUnpublish = async () => {
    const result = await actions.unpublish(listing.id)

    if (!result.ok) setNote({ ok: false, text: storeErrorText(t, result) })
  }

  return (
    <div className={styles.footer}>
      {action.kind === 'install' && (
        <Button
          variant="primary"
          size="sm"
          icon={Download}
          disabled={busy}
          onClick={() => void handleInstall()}>
          {action.allow
            ? t('extensions.store.listing.installAllow')
            : t('extensions.store.listing.install')}
        </Button>
      )}
      {action.kind === 'update' && (
        <Button
          variant="primary"
          size="sm"
          icon={RefreshCw}
          disabled={busy}
          onClick={() => void handleInstall()}>
          {t('extensions.store.listing.updateTo', { version: action.version })}
        </Button>
      )}
      {action.kind === 'none' && installed && (
        <p className={styles.note}>
          {installed.local
            ? t('extensions.store.listing.localSameId')
            : t('extensions.store.listing.installedVersion', { version: installed.version })}
        </p>
      )}
      <div className={styles.footerEnd}>
        {note && <p className={note.ok ? styles.note : styles.failure}>{note.text}</p>}
        {view.mine ? (
          <Button variant="ghost" size="sm" onClick={() => void handleUnpublish()}>
            {t('extensions.store.listing.unpublish')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" icon={Flag} onClick={() => void handleReport()}>
            {t('extensions.store.listing.report')}
          </Button>
        )}
      </div>
    </div>
  )
}
