import { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import type { PreparedFile } from '../../lib/attachments'
import {
  isPicture,
  MAX_FILES,
  prepareFile,
  attachmentsFit,
  MAX_FILE_BYTES,
} from '../../lib/attachments'
import type { PreparedImage } from '../../lib/images'
import { MAX_IMAGES, prepareImage } from '../../lib/images'
import { messageText } from '../../lib/quotes.utils'
import type { SlashRow } from '../../lib/slash.utils'
import { slashState } from '../../lib/slash.utils'
import { useDraftsStore } from '../../state/drafts.store'
import { useToastStore } from '../../state/toast.store'
import type { ComposerProps, ComposerSlash } from './Composer.types'

const NO_QUOTES: string[] = []

/** Что из выбранного системой вышло: фото, файлы и почему что-то не взято. */
type Picked = {
  images: PreparedImage[]
  files: PreparedFile[]
  skipped: 'tooMany' | 'tooBig' | null
}

/**
 * Выбранное системой - во вложения: картинка ужимается в фото, а картинка, которую не прочесть
 * (SVG, редкий формат), и всё прочее уходят файлом. Лишнее сверх потолков не берётся.
 */
const pick = async (chosen: File[], images: number, files: number): Promise<Picked> => {
  const picked: Picked = { images: [], files: [], skipped: null }

  for (const file of chosen) {
    const image =
      isPicture(file) && images + picked.images.length < MAX_IMAGES
        ? await prepareImage(file)
        : null

    if (image) {
      picked.images.push(image)
    } else if (file.size > MAX_FILE_BYTES) {
      picked.skipped = 'tooBig'
    } else if (files + picked.files.length >= MAX_FILES) {
      picked.skipped = 'tooMany'
    } else {
      picked.files.push(await prepareFile(file))
    }
  }

  return picked
}

/**
 * Поле сообщения: черновик и цитаты живут в сторе (ушёл с экрана - не пропали), фото и файлы -
 * здесь, готовые к отправке. Поле растёт с текстом до своего потолка.
 */
export const useComposer = ({ draftKey, onSend }: Pick<ComposerProps, 'draftKey' | 'onSend'>) => {
  const { t } = useTranslation()
  const text = useDraftsStore((state) => state.drafts[draftKey] ?? '')
  const quotes = useDraftsStore((state) => state.quotes[draftKey] ?? NO_QUOTES)
  const setDraft = useDraftsStore((state) => state.setDraft)
  const show = useToastStore((state) => state.show)
  const [images, setImages] = useState<PreparedImage[]>([])
  const [files, setFiles] = useState<PreparedFile[]>([])
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

  const handlePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])]

    // Сброс сразу: тот же файл, выбранный второй раз подряд, снова даст change.
    event.target.value = ''

    const picked = await pick(chosen, images.length, files.length)
    const nextImages = [...images, ...picked.images]
    const nextFiles = [...files, ...picked.files]

    if (picked.skipped) show(t(`composer.${picked.skipped}`))

    if (!attachmentsFit(nextImages, nextFiles)) {
      for (const image of picked.images) URL.revokeObjectURL(image.preview)

      return show(t('composer.tooBig'))
    }

    setImages(nextImages)
    setFiles(nextFiles)
  }

  const removeImage = (id: string) => {
    const image = images.find((one) => one.id === id)

    if (image) URL.revokeObjectURL(image.preview)

    setImages(images.filter((one) => one.id !== id))
  }

  const removeFile = (id: string) => setFiles(files.filter((one) => one.id !== id))

  const isEmpty = !text.trim() && images.length === 0 && files.length === 0 && quotes.length === 0

  const send = async () => {
    if (isBusy || isEmpty) return

    setIsBusy(true)

    const sending = { text, quotes, images, files }
    const sent = await onSend({ text: messageText(quotes, text.trim()), images, files })

    setIsBusy(false)

    if (!sent) return

    for (const image of images) URL.revokeObjectURL(image.preview)

    // Пока сообщение уходило, человек мог начать следующее: стирается только отправленное.
    const store = useDraftsStore.getState()

    if (store.drafts[draftKey] === sending.text) setDraft(draftKey, '')
    store.dropQuotes(draftKey, sending.quotes)
    setImages((current) => current.filter((image) => !sending.images.includes(image)))
    setFiles((current) => current.filter((file) => !sending.files.includes(file)))
  }

  return {
    text,
    setText,
    quotes,
    images,
    files,
    removeImage,
    removeFile,
    handlePick,
    send,
    isBusy,
    isEmpty,
    fieldRef,
    fileRef,
  }
}

/**
 * Подсказка «/» над полем: читает начало поля до каретки (команду можно поставить и перед уже
 * написанным), выбор ставит «/команда » или значение её аргумента на это место и оставляет
 * каретку за ним. Закрытый крестиком список не встаёт, пока набранное не поменялось.
 */
export const useSlashSuggest = (
  text: string,
  setText: (value: string) => void,
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  slash: ComposerSlash | undefined,
) => {
  const [caret, setCaret] = useState(text.length)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const placeCaret = useRef<number | null>(null)
  const head = text.slice(0, caret)
  const state = useMemo(
    () => (slash ? slashState(head, slash.commands, slash.argumentSets) : null),
    [head, slash],
  )

  // Каретка - за выбранным, клавиатура остаётся: дальше печатают аргумент или текст.
  useLayoutEffect(() => {
    const field = fieldRef.current
    const at = placeCaret.current

    if (!field || at === null) return

    placeCaret.current = null
    field.focus()
    field.setSelectionRange(at, at)
  }, [text, fieldRef])

  const track = (field: HTMLTextAreaElement) => setCaret(field.selectionStart)

  const pick = (row: SlashRow) => {
    if (!state) return

    const value = state.kind === 'commands' ? `/${row.id} ` : `/${state.command} ${row.id}`
    const rest = text.slice(head.length)

    placeCaret.current = value.length
    setCaret(value.length)
    setText(value + (value.endsWith(' ') && rest.startsWith(' ') ? rest.slice(1) : rest))
    // Значение выбрано - его список своё сказал; у команды - второй шаг или ничего.
    setDismissed(state.kind === 'values' ? `${state.command}\u0000${row.id}` : null)
  }

  return {
    shown: state && state.key !== dismissed ? state : null,
    track,
    pick,
    dismiss: () => setDismissed(state?.key ?? null),
  }
}
