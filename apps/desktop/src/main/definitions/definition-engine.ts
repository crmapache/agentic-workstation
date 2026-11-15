import ts from 'typescript'

import type { TextSpan } from '@shared/definitions'

import { nodeAt, importedBy, requiredBy, isModuleSpecifier } from './definition-nodes'
import {
  DEFINITION_SOURCES,
  DEFINITION_MAX_TEXT,
  DEFINITION_DOCUMENTS,
} from './definition.constants'
import type { Place, JobAnswer, ImportedName, DefinitionJob } from './definition.types'
import { ImportChase } from './import-chase'
import { ModuleResolver } from './module-resolver'
import { tsPath, scriptKindOf } from './script-files'
import { SourceCache } from './source-cache'

/**
 * Разбор открытого файла: один файл, без библиотек и без чтения импортов. Областям видимости,
 * затенению, параметрам и деструктуризации этого хватает с запасом, а стоит это один разбор
 * файла. Импорты дальше ведёт ImportChase - по модулю за раз, не поднимая весь проект.
 */
const COMPILER: ts.CompilerOptions = {
  noLib: true,
  noResolve: true,
  noEmit: true,
  allowJs: true,
  types: [],
  jsx: ts.JsxEmit.Preserve,
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
}

const NONE: JobAnswer = { kind: 'none' }

type Document = { version: string; text: string }

/** Что подчеркнуть и куда вести. */
type Hit = { origin: TextSpan; place: Place }

/** Определение по TypeScript: что подчеркнуть и где начинается имя объявления. */
type Definition = { origin: TextSpan; start: number }

/**
 * «Где определено» для ⌘ + наведение (ADR 0061): переменная, параметр, функция, класс, тип - в
 * том же файле, по областям видимости TypeScript; импорт - в файле модуля, у самого экспорта;
 * строка пути импорта - сам файл. Тексты открытых файлов приходят из окна (там правка, которая
 * ещё не на диске), файлы, куда ведут импорты, читаются с диска.
 */
export class DefinitionEngine {
  private readonly documents = new Map<string, Document>()
  private readonly imports = new ImportChase(
    new ModuleResolver(),
    new SourceCache(DEFINITION_SOURCES, DEFINITION_MAX_TEXT),
  )
  private readonly service: ts.LanguageService
  private current: string | null = null

  constructor() {
    const text = (file: string) => this.documents.get(file)?.text

    this.service = ts.createLanguageService(
      {
        getScriptFileNames: () => (this.current ? [this.current] : []),
        getScriptVersion: (file) => this.documents.get(file)?.version ?? '',
        getScriptSnapshot: (file) => {
          const known = text(file)

          return known === undefined ? undefined : ts.ScriptSnapshot.fromString(known)
        },
        getCurrentDirectory: () => '/',
        getCompilationSettings: () => COMPILER,
        getDefaultLibFileName: () => '/lib.d.ts',
        fileExists: (file) => this.documents.has(file),
        readFile: text,
      },
      ts.createDocumentRegistry(),
    )
  }

  find(job: DefinitionJob): JobAnswer {
    const file = tsPath(job.file)

    if (scriptKindOf(file) === null) return NONE
    if (job.text !== undefined) this.remember(file, { version: job.version, text: job.text })

    const document = this.documents.get(file)

    if (document?.version !== job.version) return { kind: 'needText' }
    if (document.text.length > DEFINITION_MAX_TEXT) return NONE

    this.current = file

    const source = this.service.getProgram()?.getSourceFile(file)
    const node = source && nodeAt(source, job.offset)
    const hit = source && node ? this.hit(source, node) : null

    return hit ? { kind: 'found', origin: hit.origin, target: this.position(hit.place) } : NONE
  }

  private hit(source: ts.SourceFile, node: ts.Node): Hit | null {
    const file = source.fileName

    if (ts.isStringLiteralLike(node) && isModuleSpecifier(node)) {
      const target = this.imports.module(file, node.text)
      const origin = { start: node.getStart(source) + 1, end: node.end - 1 }

      return target ? { origin, place: { file: target, pos: 0 } } : null
    }

    if (!ts.isIdentifier(node)) return null

    const origin = { start: node.getStart(source), end: node.end }
    // Имя в самой строке импорта или реэкспорта - сразу в модуль, как в WebStorm.
    const own = importedBy(node)

    if (own) return this.through(origin, file, own)

    const definition = this.definition(file, origin.start)

    if (!definition) {
      const member = this.namespaceMember(source, node)

      return member ? this.through(origin, file, member) : null
    }

    const via = this.importAt(source, definition.start)

    if (via) return this.through(definition.origin, file, via)
    // Наведение на само объявление: вести некуда, ссылки нет.
    if (definition.start === origin.start) return null

    return { origin: definition.origin, place: { file, pos: definition.start } }
  }

  private definition(file: string, pos: number): Definition | null {
    const bound = this.service.getDefinitionAndBoundSpan(file, pos)
    const first = bound?.definitions?.find((item) => item.fileName === file)

    if (!bound || !first) return null

    const { start, length } = bound.textSpan

    return { origin: { start, end: start + length }, start: first.textSpan.start }
  }

  /** Объявление - импорт или require: тогда оно не здесь, а в модуле. */
  private importAt(source: ts.SourceFile, pos: number): ImportedName | null {
    const declared = nodeAt(source, pos)

    return declared && ts.isIdentifier(declared)
      ? (importedBy(declared) ?? requiredBy(declared))
      : null
  }

  /** «ns.member» и «ns.Type», где ns - модуль целиком (import * as ns): член этого модуля. */
  private namespaceMember(source: ts.SourceFile, node: ts.Identifier): ImportedName | null {
    const parent = node.parent
    const left =
      ts.isPropertyAccessExpression(parent) && parent.name === node
        ? parent.expression
        : ts.isQualifiedName(parent) && parent.right === node
          ? parent.left
          : null

    if (!left || !ts.isIdentifier(left)) return null

    const definition = this.definition(source.fileName, left.getStart(source))
    const via = definition && this.importAt(source, definition.start)

    return via?.name === '*' ? { spec: via.spec, name: node.text } : null
  }

  private through(origin: TextSpan, file: string, via: ImportedName): Hit | null {
    const place = this.imports.find(file, via)

    return place ? { origin, place } : null
  }

  /** Строка и колонка с 1: в открытом файле - по его тексту, в другом - по файлу с диска. */
  private position({ file, pos }: Place) {
    const source =
      file === this.current
        ? this.service.getProgram()?.getSourceFile(file)
        : this.imports.sources.get(file)
    const { line, character } = source?.getLineAndCharacterOfPosition(pos) ?? {
      line: 0,
      character: 0,
    }

    return { file, line: line + 1, column: character + 1 }
  }

  private remember(file: string, document: Document) {
    this.documents.delete(file)
    this.documents.set(file, document)

    for (const oldest of this.documents.keys()) {
      if (this.documents.size <= DEFINITION_DOCUMENTS) break

      this.documents.delete(oldest)
    }
  }
}
