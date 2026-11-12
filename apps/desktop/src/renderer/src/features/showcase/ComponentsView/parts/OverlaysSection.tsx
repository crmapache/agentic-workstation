import { useState } from 'react'
import { FilePlus, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import type { DialogBackdrop } from '@agentic-workstation/ui/Dialog.types'
import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Lightbox } from '@agentic-workstation/ui/Lightbox'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { TextField } from '@agentic-workstation/ui/TextField'
import { Toast } from '@agentic-workstation/ui/Toast'

import styles from '../ComponentsView.module.scss'
import lightboxSample from '../../assets/lightbox-sample.png'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { ModalSpecimen } from './ModalSpecimen'

/**
 * Раздел «Оверлеи»: уведомления трёх видов, живая всплывающая панель с меню,
 * модальный диалог - с затемнением окна и без, окно с содержимым двух ширин и просмотр картинки
 * (со строкой под ней и крестиком под палец - как на телефоне). Всё настоящее - открывается,
 * закрывается по Esc и клику мимо.
 */
export const OverlaysSection = () => {
  const { t } = useTranslation('showcase')
  const popover = usePopover()
  const [dialogBackdrop, setDialogBackdrop] = useState<DialogBackdrop | null>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [isMissingOpen, setIsMissingOpen] = useState(false)
  const [isReducedOpen, setIsReducedOpen] = useState(false)
  const [branch, setBranch] = useState('')

  const closeDialog = () => setDialogBackdrop(null)

  const laterButton = (
    <Button variant="ghost" size="sm">
      {t('samples.later')}
    </Button>
  )

  return (
    <ShowcaseSection title={t('sections.overlays')}>
      <Specimen label={t('specimens.toast')} layout="column">
        <div className={styles.stack}>
          <Toast
            title={t('samples.toastTitle')}
            description={t('samples.toastText')}
            actions={
              <>
                <Button variant="primary" size="sm">
                  {t('samples.update')}
                </Button>
                {laterButton}
              </>
            }
          />
          <Toast
            tone="danger"
            title={t('samples.toastDangerTitle')}
            description={t('samples.toastDangerText')}
          />
          <Toast
            title={t('samples.toastProgressTitle')}
            description={t('samples.toastProgressText')}
            progress={0.64}
          />
        </div>
      </Specimen>

      <Specimen label={t('specimens.popover')}>
        <DropdownButton
          {...popover.triggerProps}
          label={t('samples.openPopover')}
          menuLabel={t('samples.menuLabel')}
        />
        <Popover {...popover.popoverProps}>
          {popover.isOpen && (
            <Menu label={t('samples.menuLabel')} autoFocus>
              <MenuItem icon={FilePlus} label={t('samples.newFile')} onSelect={() => undefined} />
              <MenuItem
                icon={FolderOpen}
                label={t('samples.openFile')}
                onSelect={() => undefined}
              />
            </Menu>
          )}
        </Popover>
      </Specimen>

      <Specimen label={t('specimens.dialog')}>
        <Button variant="secondary" onClick={() => setDialogBackdrop('dim')}>
          {t('samples.openDialog')}
        </Button>
        <Button variant="secondary" onClick={() => setDialogBackdrop('clear')}>
          {t('samples.openClearDialog')}
        </Button>
        <Dialog
          open={dialogBackdrop !== null}
          title={t('samples.dialogTitle')}
          backdrop={dialogBackdrop ?? 'dim'}
          actions={
            <>
              <Button variant="ghost" onClick={closeDialog}>
                {t('samples.cancel')}
              </Button>
              <Button variant="primary" type="submit">
                {t('samples.create')}
              </Button>
            </>
          }
          onSubmit={closeDialog}
          onClose={closeDialog}>
          <TextField
            label={t('samples.fieldLabel')}
            placeholder={t('samples.fieldPlaceholder')}
            value={branch}
            autoFocus
            onChange={setBranch}
          />
        </Dialog>
      </Specimen>

      <ModalSpecimen />

      <Specimen label={t('specimens.lightbox')}>
        <Button variant="secondary" onClick={() => setIsLightboxOpen(true)}>
          {t('samples.openImage')}
        </Button>
        <Lightbox
          open={isLightboxOpen}
          src={lightboxSample}
          alt={t('samples.imageAlt')}
          loadingLabel={t('samples.imageLoading')}
          closeLabel={t('samples.close')}
          onClose={() => setIsLightboxOpen(false)}
        />
        <Button variant="secondary" onClick={() => setIsMissingOpen(true)}>
          {t('samples.openMissingImage')}
        </Button>
        <Lightbox
          open={isMissingOpen}
          src={null}
          alt={t('samples.imageAlt')}
          loadingLabel={t('samples.imageLoading')}
          error={t('samples.imageMissing')}
          closeLabel={t('samples.close')}
          onClose={() => setIsMissingOpen(false)}
        />
        <Button variant="secondary" onClick={() => setIsReducedOpen(true)}>
          {t('samples.openReducedImage')}
        </Button>
        <Lightbox
          open={isReducedOpen}
          src={lightboxSample}
          alt={t('samples.imageAlt')}
          loadingLabel={t('samples.imageLoading')}
          caption={t('samples.imageReduced')}
          closeLabel={t('samples.close')}
          closeSize="touch"
          onClose={() => setIsReducedOpen(false)}
        />
      </Specimen>
    </ShowcaseSection>
  )
}
