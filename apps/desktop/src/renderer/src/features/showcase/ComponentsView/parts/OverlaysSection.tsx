import { useState } from 'react'
import { Eye, Globe, FileCode, FilePlus, FolderOpen, SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import type { DialogBackdrop } from '@agentic-workstation/ui/Dialog.types'
import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Lightbox } from '@agentic-workstation/ui/Lightbox'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSubmenu } from '@agentic-workstation/ui/MenuSubmenu'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { TextField } from '@agentic-workstation/ui/TextField'

import lightboxSample from '../../assets/lightbox-sample.png'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { ModalSpecimen } from './ModalSpecimen'
import { ToastSpecimen } from './ToastSpecimen'

/**
 * Раздел «Оверлеи»: уведомления (крестик, отсчёт, прогресс), живая всплывающая панель с меню и
 * меню сбоку (доступные пункты и погашенный), модальный диалог - с затемнением окна и без, окно с
 * содержимым двух ширин и просмотр картинки (со строкой под ней и крестиком под палец - как на
 * телефоне). Всё настоящее - открывается, закрывается по Esc и клику мимо.
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

  return (
    <ShowcaseSection title={t('sections.overlays')}>
      <ToastSpecimen />

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
              <MenuSubmenu
                icon={SquareArrowOutUpRight}
                label={t('samples.openWith')}
                menuLabel={t('samples.openWithMenu')}>
                <MenuItem
                  icon={FileCode}
                  label={t('samples.openWithEditor')}
                  onSelect={() => undefined}
                />
                <MenuItem
                  icon={Globe}
                  label={t('samples.openWithBrowser')}
                  onSelect={() => undefined}
                />
                <MenuItem
                  icon={Eye}
                  label={t('samples.openWithUnavailable')}
                  description={t('samples.notInstalled')}
                  disabled
                  onSelect={() => undefined}
                />
              </MenuSubmenu>
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
