import type { editor } from 'monaco-editor/editor/editor.api.js'

import type { FileRead, TextHash, FileWrite, FileVersion } from '@shared/fs'

import { preloadLanguage } from '../../lib/highlighter'
import { invoke } from '../../lib/ipc'
import { languageOfPath } from '../../lib/syntax-languages.utils'
import type { FilePlace } from '../../state/selection.store'
import { putText, holdsText, createDocumentModel } from './document-model'
import { documentKey, fileRequest } from './documents.utils'
import { AUTOSAVE_DELAY_MS } from './editor.constants'
import type { DocumentNotice, DocumentStatus } from './editor.types'
import { noteEditorEdit } from './manual-edits'

const WRITE_FAILED: FileWrite = { kind: 'failed', reason: 'unknown' }

const UNREADABLE: FileRead = { kind: 'failed', reason: 'unknown' }

type TextRead = Extract<FileRead, { kind: 'text' }>

/**
 * Как писать: auto - автосохранение (только своё несохранённое, только без вопроса);
 * asked - человек попросил (⌘S, «ещё раз», «сохранить» у файла за проектом): поверх своей
 * версии и при вопросе; overwrite - «оставить моё», поверх диска, что бы там ни было.
 */
type WriteMode = 'auto' | 'asked' | 'overwrite'

/** Кому документ сообщает о себе: состояние поменялось, файл пропал с диска. */
export type DocumentHost = {
  onStatus: (document: EditorDocument) => void
  onGone: (document: EditorDocument) => void
}

/**
 * Открытый файл: модель Monaco с текстом и версия файла на диске, от которой правка.
 * Сохраняется сам, как в WebStorm: после паузы в наборе, при уходе из редактора и перед
 * закрытием. Пишет только поверх своей версии: файл, который за это время поменял кто-то
 * ещё (Claude Code, терминал), не затирается - документ останавливается с вопросом.
 */
export class EditorDocument {
  readonly key: string
  model: editor.ITextModel | null = null
  /** Курсор, прокрутка и свёрнутое - на время, пока в редакторе другой файл. */
  viewState: editor.ICodeEditorViewState | null = null
  /** Место из ссылки, которое уже показали: вернувшись в проект, туда не прыгают снова. */
  placed: FilePlace | undefined = undefined
  status: DocumentStatus = { kind: 'loading' }
  /** Настоящий путь от корня, если файл открыт по ссылке: слежение называет его. */
  realPath: string | null = null
  /** Вкладку закрыли, документ дописывается; открыли снова - закрытие отменяется. */
  closing = false
  /** Человек согласился потерять несохранённое: закрытие не возвращает вкладку. */
  discarded = false
  private version: FileVersion | null = null
  /** Отпечаток текста, от которого правка: файл только тронули - не чужая правка. */
  private base: TextHash | null = null
  private bom = false
  private outside = false
  /** Версия модели, совпадающая с диском: отменил правку до неё - сохранять нечего. */
  private savedVersionId = 0
  private timer: number | null = null
  private saving: Promise<void> | null = null
  /** Растёт на каждую запись: чтение, которое она обогнала, устарело ещё в полёте. */
  private writeSerial = 0
  /** Идёт чтение - первое или сверка: событие диска в это время ждёт его конца. */
  private checking = false
  private checkAgain = false
  private applyingDisk = false
  private disposed = false

  constructor(
    readonly projectId: string,
    readonly path: string,
    private readonly host: DocumentHost,
  ) {
    this.key = documentKey(projectId, path)
  }

  get notice(): DocumentNotice | null {
    return this.status.kind === 'text' ? this.status.notice : null
  }

  get isDirty(): boolean {
    return this.model !== null && this.model.getAlternativeVersionId() !== this.savedVersionId
  }

  /** Прочитать файл и подготовить подсветку его языка. Зовётся один раз, после создания. */
  async load(): Promise<void> {
    await this.reading(async () => {
      const read = await this.read(null)
      const language = languageOfPath(this.path)

      if (read.kind === 'text' && language) await preloadLanguage(language).catch(() => undefined)

      this.accept(read)
    })
  }

  /** Автосохранение: своё несохранённое и без вопроса. Ответ - когда записано набранное. */
  async save(): Promise<void> {
    await this.write('auto')
  }

  /** Человек попросил сохранить (⌘S, «ещё раз»): поверх своей версии, чужое не затирается. */
  async saveAsked(): Promise<void> {
    await this.write('asked')
  }

  /** «Оставить моё»: записать поверх того, что на диске. */
  async keepMine(): Promise<void> {
    await this.write('overwrite')
  }

  /** «Взять с диска»: правки здесь уступают файлу на диске (их вернёт отмена). */
  async takeDisk(): Promise<void> {
    const read = await this.read(null)

    if (read.kind === 'text' && this.model) this.adopt(read)
    else this.accept(read)
  }

  /**
   * На диске что-то случилось с файлом. Посреди записи или чтения - проверить ещё раз
   * после них: ответ на свою же запись не должен выглядеть чужой правкой. Запись, начатая,
   * пока шло чтение, делает прочитанное старым - его не применяют, а читают снова.
   */
  async checkDisk(): Promise<void> {
    if (this.saving || this.checking) {
      this.checkAgain = true

      return
    }

    await this.reading(async () => {
      const serial = this.writeSerial
      const read = await this.read(this.model ? this.version : null)

      if (serial !== this.writeSerial) this.checkAgain = true
      else this.reconcile(read)
    })
  }

  /**
   * Вкладку закрыли: дописать несохранённое и освободить модель. false - освобождать
   * нельзя: правка не дошла до диска (вопрос) или вкладку открыли снова.
   */
  async close(): Promise<boolean> {
    this.closing = true
    await this.save()

    if (!this.closing) return false

    this.closing = false

    if (!this.discarded && (this.notice || this.isDirty)) return false

    this.dispose()

    return true
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
    this.model?.dispose()
    this.model = null
  }

  private async reading(task: () => Promise<void>): Promise<void> {
    this.checking = true

    try {
      if (!this.disposed) await task()
    } finally {
      this.checking = false
      this.recheckIfAsked()
    }
  }

  private read(known: FileVersion | null): Promise<FileRead> {
    return invoke('fs:readFile', { ...fileRequest(this.projectId, this.path), known }).catch(
      (error: unknown) => {
        console.warn(`[editor] ${this.path} не прочитался:`, error)

        return UNREADABLE
      },
    )
  }

  /** Прочитанное с диска без своих правок: показать как есть. */
  private accept(read: FileRead): void {
    if (this.disposed || read.kind === 'unchanged') return
    // Файла нет: вкладка файла закроется сама, а разница с ним увидит удаление, а не вечное
    // «читается». Модель остаётся: вернётся файл - текст встанет в неё же.
    if (read.kind === 'missing') {
      this.setStatus({ kind: 'missing' })

      return this.host.onGone(this)
    }
    // Файл не читается, а текст уже есть - оставить его: сбой скорее всего на мгновение.
    if (read.kind === 'failed' && this.model) return

    if (read.kind !== 'text') {
      this.model?.dispose()
      this.model = null
      this.setStatus(read.kind === 'failed' ? { kind: 'unreadable', reason: read.reason } : read)

      return
    }

    if (this.model) return this.adopt(read)

    this.model = createDocumentModel(this.projectId, this.path, read.text)
    this.model.onDidChangeContent((event) => {
      noteEditorEdit(this.projectId, this.path, event, this.applyingDisk)
      this.handleEdit()
    })
    this.markSaved(read)
    this.setStatus({ kind: 'text', readOnly: read.readOnly, notice: null, bom: read.bom })
  }

  /** Текст с диска - в модель (только середина, отдельным шагом отмены). */
  private adopt(read: TextRead): void {
    if (!this.model) return

    this.applyingDisk = true
    putText(this.model, read.text)
    this.applyingDisk = false
    this.markSaved(read)
    this.setStatus({ kind: 'text', readOnly: read.readOnly, notice: null, bom: read.bom })
  }

  /**
   * Файл на диске поменялся. Тот же текст - запомнить версию. Тронули, а текст прежний -
   * тоже. Своих правок нет - взять чужую. Есть - не выбирать за человека: вопрос,
   * автосохранение ждёт ответа.
   */
  private reconcile(read: FileRead): void {
    if (read.kind === 'unchanged' || read.kind === 'failed') return
    if (read.kind === 'text' && read.version === this.version) return
    if (!this.model || (!this.isDirty && !this.notice)) return this.accept(read)

    if (read.kind === 'text' && holdsText(this.model, read.text)) {
      this.markSaved(read)
      this.setNotice(null)
    } else if (read.kind === 'text' && read.hash === this.base) {
      this.version = read.version
      if (this.notice?.kind === 'conflict') this.setNotice(null)
    } else {
      this.setNotice(read.kind === 'missing' ? { kind: 'deleted' } : { kind: 'conflict' })
    }
  }

  private handleEdit(): void {
    if (this.applyingDisk || this.notice) return
    if (this.outside) return this.setNotice({ kind: 'outside' })

    this.clearTimer()
    this.timer = window.setTimeout(() => void this.save(), AUTOSAVE_DELAY_MS)
  }

  /** Записать модель (WriteMode). Записи идут по одной: новая ждёт идущую. */
  private async write(mode: WriteMode): Promise<void> {
    this.clearTimer()

    while (this.saving) await this.saving

    const model = this.model

    if (!model || this.disposed || this.status.kind !== 'text' || this.status.readOnly) return
    if (mode === 'auto' && this.notice) return
    if (mode !== 'overwrite' && !this.isDirty) return

    const versionId = model.getAlternativeVersionId()

    this.writeSerial += 1

    const saving = invoke('fs:writeFile', {
      ...fileRequest(this.projectId, this.path),
      text: model.getValue(),
      bom: this.bom,
      expected: mode === 'overwrite' ? null : this.version,
      base: this.base,
      outside: mode !== 'auto',
    })
      .catch(() => WRITE_FAILED)
      .then((result) => this.settle(result, versionId))

    this.saving = saving
    await saving

    if (this.saving === saving) this.saving = null

    this.recheckIfAsked()
  }

  private settle(result: FileWrite, versionId: number): void {
    if (this.disposed) return

    if (result.kind === 'saved') {
      this.version = result.version
      this.base = result.hash
      this.savedVersionId = versionId
      this.setNotice(null)
    } else if (result.kind === 'failed') {
      this.setNotice(
        result.reason === 'outside'
          ? { kind: 'outside' }
          : { kind: 'saveFailed', reason: result.reason },
      )
    } else {
      this.setNotice({ kind: result.kind === 'missing' ? 'deleted' : 'conflict' })
    }
  }

  private markSaved(read: TextRead): void {
    this.version = read.version
    this.base = read.hash
    this.bom = read.bom
    this.outside = read.outside
    this.realPath = read.realPath
    this.savedVersionId = this.model?.getAlternativeVersionId() ?? 0
  }

  private recheckIfAsked(): void {
    if (!this.checkAgain || this.disposed || this.saving || this.checking) return

    this.checkAgain = false
    void this.checkDisk()
  }

  private setNotice(notice: DocumentNotice | null): void {
    if (this.status.kind === 'text' && this.status.notice !== notice) {
      this.setStatus({ ...this.status, notice })
    }
  }

  private setStatus(status: DocumentStatus): void {
    this.status = status
    this.host.onStatus(this)
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer)

    this.timer = null
  }
}
