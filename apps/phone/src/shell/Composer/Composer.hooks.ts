import { useRef, useState, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import type { PreparedImage } from '../../lib/images'
import { imagesFit, MAX_IMAGES, prepareImage } from '../../lib/images'
import { useDraftsStore } from '../../state/drafts.store'
import { useToastStore } from '../../state/toast.store'
import type { ComposerProps } from './Composer.types'

/**
 * Поле сообщения: черновик живёт в сторе (ушёл с экрана - не пропал), фото - здесь, ужатые до
 * отправки. Поле растёт с текстом до своего потолка.
 */
export const useComposer = ({ draftKey, onSend }: Pick<ComposerProps, 'draftKey' | 'onSend'>) => {
  const { t } = useTranslation()
  const text = useDraftsStore((state) => state.drafts[draftKey] ?? '')
  const setDraft = useDraftsStore((state) => state.setDraft)
  const show = useToastStore((state) => state.show)
  const [images, setImages] = useState<PreparedImage[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const field = fieldRef.current

    if (!field) return

    // Высота по содержимому: сброс и высота прокрутки, потолок держит max-height в стилях.
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [text])

  const setText = (value: string) => setDraft(draftKey, value)

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, MAX_IMAGES - images.length)

    event.target.value = ''

    const prepared = (await Promise.all(files.map(prepareImage))).filter(
      (image): image is PreparedImage => image !== null,
    )
    const next = [...images, ...prepared]

    if (prepared.length < files.length) show(t('composer.photoUnreadable'))
    if (!imagesFit(next)) return show(t('composer.photosTooBig'))

    setImages(next)
  }

  const removeImage = (id: string) => {
    const image = images.find((one) => one.id === id)

    if (image) URL.revokeObjectURL(image.preview)

    setImages(images.filter((one) => one.id !== id))
  }

  const send = async () => {
    if (isBusy || (!text.trim() && images.length === 0)) return

    setIsBusy(true)

    const sent = await onSend(text.trim(), images)

    setIsBusy(false)

    if (!sent) return

    for (const image of images) URL.revokeObjectURL(image.preview)

    setDraft(draftKey, '')
    setImages([])
  }

  return { text, setText, images, removeImage, handleFiles, send, isBusy, fieldRef, fileRef }
}
