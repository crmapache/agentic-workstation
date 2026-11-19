import type { DragEvent, ClipboardEvent } from 'react'

import { invoke, pathForFile } from '../../lib/ipc'
import { readProjectPaths } from '../../lib/project-drag'
import { collapsesPaste } from './chips.utils'
import { clipboardHtml, clipboardTextOf, clipboardTokens } from './draft-clipboard.utils'
import { tokensText, countImages } from './draft.utils'
import { headText, splitTokens, wrappedLineCount } from './field-caret'
import { notePastedPath } from './field-chips'
import { base64Of, chipOfPath, carriesFiles, chipOfProjectPath } from './field-clipboard.utils'
import { placeCaretAtEnd, placeCaretBefore } from './field-dom'
import type { Field, ChipSpot, FieldInsert } from './field.types'
import { MAX_IMAGES } from './images.constants'
import { prepareImage } from './images.utils'
import { captureWrittenCommand } from './slash-capture.utils'
import type { CommandEntry } from './slash.types'

type ClipboardOptions = {
  field: Field
  insert: FieldInsert
  projectId: string
  /** Settings → Pasted text: с какого числа строк вставка сворачивается; 0 - никогда. */
  pasteCollapse: number
  imageBase: number
  commands: readonly CommandEntry[]
}

/**
 * Буфер и перетаскивание в поле (как в ACC): свои куски возвращаются живыми чипами,
 * файлы из Finder - чипами со своим путём, скриншот - картинкой с номером (и файлом в
 * каталоге IDE для копии), документ без пути - записывается и становится чипом, длинный
 * текст - свёрнутой вставкой. Копия из поля несёт пути, а не подписи.
 */
export const useFieldClipboard = (options: ClipboardOptions) => {
  const { field, insert } = options

  /** Текст из буфера; целиком вставленная команда в конце поля - сразу чип. */
  const pasteText = (text: string) => {
    insert.insertText(text)

    const root = field.fieldRef.current

    if (!root) return

    const next = field.readTokens()
    const written =
      headText(root, field.registry.chipOf) === tokensText(next)
        ? captureWrittenCommand(next, options.commands)
        : null

    if (!written) {
      field.captureTyped(next)

      return
    }

    field.applyTokens(written)
    placeCaretAtEnd(root)
  }

  /** Скриншот байтами: картинка в своём месте сразу, путь на диске - мгновением позже. */
  const pasteImage = async (file: File, spot: ChipSpot) => {
    const inField = countImages(field.readTokens())
    // Больше картинок в одном сообщении API не примет - лишняя ушла бы отказом целиком.
    const image = inField < MAX_IMAGES ? await prepareImage(file) : null
    const root = field.fieldRef.current

    if (!image || !root) return

    const value = `Image #${options.imageBase + inField + 1}`

    insert.insertChip({ kind: 'img', value, data: image.preview }, spot)

    const path = await invoke('claude:savePasted', { name: file.name, data: image.data }).catch(
      () => null,
    )

    if (path && notePastedPath(root, image.preview, path, field.registry)) field.refresh()
  }

  /** Документ без пути (байты из буфера) - файлом в каталоге IDE, потом чипом. */
  const pasteDocument = async (file: File, spot: ChipSpot) => {
    const path = await invoke('claude:savePasted', {
      name: file.name,
      data: await base64Of(file),
    }).catch(() => null)

    if (!path) return

    const [described] = await invoke('claude:describePaths', {
      projectId: options.projectId,
      paths: [path],
    })

    if (described) insert.insertChip(chipOfPath(described), spot)
  }

  /**
   * Файлы: со своим путём (Finder) - чипами пути, без пути - картинкой или записанным файлом.
   * Чип встаёт после ожидания (путь, сжатие картинки), поэтому место - словом, а не выделением:
   * щелчок в текст за это время не уводит брошенный файл в середину фразы.
   */
  const attachFiles = async (files: readonly File[], spot: ChipSpot) => {
    const paths = files.map((file) => pathForFile(file))
    const real = paths.filter(Boolean)

    if (real.length > 0) {
      const described = await invoke('claude:describePaths', {
        projectId: options.projectId,
        paths: real,
      })

      for (const item of described) insert.insertChip(chipOfPath(item), spot)
    }

    for (const [index, file] of files.entries()) {
      if (paths[index]) continue
      if (file.type.startsWith('image/')) await pasteImage(file, spot)
      else await pasteDocument(file, spot)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const data = event.clipboardData
    const restored = clipboardTokens(data.getData('text/html'))
    const files = Array.from(data.files)
    const text = data.getData('text/plain')

    event.preventDefault()

    if (restored) return insert.insertTokens(restored)
    if (files.length > 0) {
      void attachFiles(files, 'caret')

      // Рядом с картинкой из Office лежит и текст ячеек; у файла из Finder текст - его имя.
      if (files.some((file) => pathForFile(file))) return
    }

    if (!text) return

    const root = field.fieldRef.current
    const drawn = root ? wrappedLineCount(root, text, options.pasteCollapse) : 0

    if (collapsesPaste(text, options.pasteCollapse, drawn)) {
      insert.insertChip({ kind: 'paste', value: 'pasted', text })
    } else {
      pasteText(text)
    }
  }

  /** Копия и вырезание: в буфер - текст с путями и куски с байтами, из которых чипы оживут. */
  const copyOut = (event: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = field.fieldRef.current
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    if (!root || !range || range.collapsed || !root.contains(range.commonAncestorContainer)) return

    const { picked, rest, caret } = splitTokens(root, range, field.registry.chipOf)

    if (picked.length === 0) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', clipboardTextOf(picked))
    event.clipboardData.setData('text/html', clipboardHtml(picked))

    if (!cut) return

    field.applyTokens(rest)
    placeCaretBefore(root, caret)
  }

  /**
   * Брошенные файлы и картинки (Finder, браузер, дерево файлов и список изменений IDE) - в конец
   * набранного, а не в точку броска: мышь при броске стоит где придётся, и файл вставал посреди
   * фразы. Брошенный текст сюда не доходит (carriesFiles) - его браузер ставит в точку броска сам.
   */
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const root = field.fieldRef.current

    if (!root || !carriesFiles(event.dataTransfer)) return

    event.preventDefault()
    placeCaretAtEnd(root)

    for (const path of readProjectPaths(event.dataTransfer)) {
      insert.insertChip(chipOfProjectPath(path), 'end')
    }

    void attachFiles(Array.from(event.dataTransfer.files), 'end')
    root.focus()
  }

  /**
   * Протяжка выделения внутри поля браузер переносит клоном разметки - чип в клоне уже не
   * вложение, а текст подписи. Выделение с чипом не тащим: вырезать и вставить умеет буфер.
   */
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    const root = field.fieldRef.current
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    if (!root || !range || !root.contains(range.commonAncestorContainer)) return

    const { picked } = splitTokens(root, range, field.registry.chipOf)

    if (picked.some((token) => token.kind === 'chip')) event.preventDefault()
  }

  return {
    handleDragStart,
    handlePaste,
    handleCopy: (event: ClipboardEvent<HTMLDivElement>) => copyOut(event, false),
    handleCut: (event: ClipboardEvent<HTMLDivElement>) => copyOut(event, true),
    handleDrop,
  }
}
