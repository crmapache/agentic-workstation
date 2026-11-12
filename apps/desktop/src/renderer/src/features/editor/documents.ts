import type { editor } from 'monaco-editor/editor/editor.api.js'

import type { ProjectDiskChange } from '@shared/fs'

import { connectDocuments } from '../../state/editor-documents'
import type { EditorTabs } from '../../state/editor-tabs.types'
import { tabTarget } from '../../state/editor-tabs.utils'
import { useSelectionStore } from '../../state/selection.store'
import { isTouched, documentKey } from './documents.utils'
import { EditorDocument } from './editor-document'
import type { DocumentHost } from './editor-document'
import { SAVE_COMMAND } from './editor.constants'
import { useEditorStore } from './editor.store'
import { monaco } from './monaco-setup'
import { watchOutsideFiles } from './outside-watch'

/** Файл нужен середине: открыт вкладкой или вкладкой разницы - там он правая сторона. */
const isOpenTab = (tabs: Readonly<Record<string, EditorTabs>>, document: EditorDocument) =>
  tabs[document.projectId]?.keys.some((key) => tabTarget(key).path === document.path) ?? false

/**
 * Открытые файлы всех проектов - по документу на файл, модели живут, пока файл открыт
 * вкладкой или его разница (ADR 0005: модель на файл; ADR 0020). Документ появляется, когда
 * вкладку впервые показали: тридцать восстановленных вкладок не читают тридцать файлов на
 * старте.
 * Закрытая вкладка - документ дописывает несохранённое и уходит; не дописалось
 * (конфликт в ту же секунду) - вкладка возвращается с вопросом, правка не теряется.
 */
class Documents {
  private readonly open = new Map<string, EditorDocument>()
  /** Сколько раз держат документ без вкладки (история папки показывает файл справа). */
  private readonly holds = new Map<string, number>()

  private readonly host: DocumentHost = {
    onStatus: (document) => {
      if (!this.open.has(document.key)) return

      useEditorStore.getState().setStatus(document.key, document.status)
      this.publishHeld(document.projectId)
    },
    // Файл удалили, а своих правок нет - вкладка закрывается сама, как в WebStorm.
    onGone: (document) =>
      useSelectionStore.getState().closeTabs(document.projectId, [document.path]),
  }

  /** Документ файла: открытый или новый, который сразу начинает читаться. */
  get(projectId: string, path: string): EditorDocument {
    const existing = this.find(projectId, path)

    if (existing) return existing

    const document = new EditorDocument(projectId, path, this.host)

    this.open.set(document.key, document)
    useEditorStore.getState().setStatus(document.key, document.status)
    void document.load()
    watchOutsideFiles([...this.open.values()])

    return document
  }

  /**
   * Держать документ файла, пока он нужен не вкладке, а виду: история папки показывает справа
   * файл выбранной версии. Ответ - отпустить; отпущенный и без вкладки дописывается и уходит.
   */
  hold(projectId: string, path: string): () => void {
    const { key } = this.get(projectId, path)

    this.holds.set(key, (this.holds.get(key) ?? 0) + 1)

    return () => {
      const left = (this.holds.get(key) ?? 1) - 1

      if (left > 0) this.holds.set(key, left)
      else this.holds.delete(key)

      this.syncTabs(useSelectionStore.getState().tabsByProject)
    }
  }

  /** Документ файла, если он уже есть; не создаёт новый. */
  find(projectId: string, path: string): EditorDocument | undefined {
    return this.open.get(documentKey(projectId, path))
  }

  /** Документ, чья модель стоит в редакторе: ⌘S пишет файл того редактора, где фокус. */
  findByModel(model: editor.ITextModel | null): EditorDocument | undefined {
    return model ? [...this.open.values()].find((document) => document.model === model) : undefined
  }

  /**
   * Вкладки поменялись: документы закрытых дописываются и уходят, открытых снова (или тех, что
   * держит вид) - остаются.
   */
  syncTabs(tabsByProject: Readonly<Record<string, EditorTabs>>): void {
    for (const document of this.open.values()) {
      if (isOpenTab(tabsByProject, document) || this.holds.has(document.key)) {
        document.closing = false
      } else if (!document.closing) void this.close(document)
    }
  }

  /** Человек согласился потерять несохранённое в этих файлах: закрытие их не вернёт. */
  discard(projectId: string, paths: readonly string[]): void {
    for (const path of paths) {
      const document = this.find(projectId, path)

      if (document) document.discarded = true
    }
  }

  /**
   * На диске проекта что-то поменялось: открытые файлы, которых это касается, сверяются -
   * по пути вкладки и по настоящему пути, если файл открыт по ссылке. Файл вне проекта
   * приходит своим абсолютным путём (watchOutsideFiles).
   */
  diskChanged({ projectId, files }: ProjectDiskChange): void {
    for (const document of this.open.values()) {
      const touched =
        isTouched(document.path, files) ||
        (document.realPath !== null && isTouched(document.realPath, files))

      if (document.projectId === projectId && touched) void document.checkDisk()
    }
  }

  /**
   * Сверить все открытые файлы - вернувшись в окно: файл по ссылке за проект слежение не
   * видит, а пропущенное событие догоняется. Совпала версия - текст не пересылается.
   */
  checkAll(): void {
    for (const document of this.open.values()) void document.checkDisk()
  }

  saveAll(): Promise<void> {
    return Promise.all([...this.open.values()].map((document) => document.save())).then(
      () => undefined,
    )
  }

  private async close(document: EditorDocument): Promise<void> {
    const projectOpen = useSelectionStore.getState().tabsByProject[document.projectId] !== undefined

    // Проект закрыли целиком - вкладку вернуть некуда, его вопрос задан до закрытия.
    if (!projectOpen) document.discarded = true

    if (await document.close()) {
      this.open.delete(document.key)
      useEditorStore.getState().setStatus(document.key, null)
      this.publishHeld(document.projectId)
      watchOutsideFiles([...this.open.values()])
    } else if (!isOpenTab(useSelectionStore.getState().tabsByProject, document)) {
      useSelectionStore.getState().selectFile(document.projectId, document.path)
    }
  }

  /** Вкладки проекта с несохранённым вопросом: переполнение полосы их не закрывает. */
  private publishHeld(projectId: string): void {
    const held = [...this.open.values()]
      .filter((document) => document.projectId === projectId && document.notice)
      .map((document) => document.path)
    const { heldByProject, setHeld } = useSelectionStore.getState()
    const previous = heldByProject[projectId] ?? []

    if (held.length !== previous.length || held.some((path) => !previous.includes(path))) {
      setHeld(projectId, held)
    }
  }
}

export const documents = new Documents()

useSelectionStore.subscribe((state, previous) => {
  if (state.tabsByProject !== previous.tabsByProject) documents.syncTabs(state.tabsByProject)
})

connectDocuments({
  diskChanged: (change) => documents.diskChanged(change),
  checkAll: () => documents.checkAll(),
  discard: (projectId, paths) => documents.discard(projectId, paths),
  saveAll: () => documents.saveAll(),
})

// ⌘S - явная просьба: пишет файл того редактора, где фокус (код файла или правая сторона
// разницы), - и файл за проектом, и после отказа записи. Одна команда на окно: реестр
// команд и сочетаний Monaco общий для всех редакторов.
monaco.editor.registerCommand(SAVE_COMMAND, () => {
  const focused = monaco.editor.getEditors().find((instance) => instance.hasTextFocus())

  void documents.findByModel(focused?.getModel() ?? null)?.saveAsked()
})
monaco.editor.addKeybindingRule({
  keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
  command: SAVE_COMMAND,
})
