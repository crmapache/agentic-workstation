import ts from 'typescript'

import type { ImportedName } from './definition.types'

/**
 * Что модуль отдаёт под именем: here - объявлено в этом файле; imported - пришло из другого
 * модуля (реэкспорт или свой импорт, отданный дальше), pos - где он здесь; stars - явно нет,
 * но есть «export * from», искать там; none - нет.
 */
export type ExportHit =
  | { kind: 'here'; pos: number }
  | { kind: 'imported'; via: ImportedName; pos: number }
  | { kind: 'stars'; specs: readonly string[] }
  | { kind: 'none' }

type Binding = Extract<ExportHit, { kind: 'here' | 'imported' }>

/** Экспорт, который называет имя этого же модуля: «export { a }», «export default a». */
type LocalExport = { kind: 'local'; name: string; pos: number }

/** Имена одного уровня модуля (файла или тела «declare module»): что объявлено и что отдано. */
type Scope = {
  exports: Map<string, Binding | LocalExport>
  locals: Map<string, Binding>
  stars: string[]
  /** «export = X»: имена модуля - члены X (так устроены @types/react и другие старые типы). */
  equals: string | null
  statements: readonly ts.Statement[]
}

const scopes = new WeakMap<ts.SourceFile, Scope>()

const setFirst = <T>(map: Map<string, T>, name: string, value: T) => {
  if (!map.has(name)) map.set(name, value)
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((item) => item.kind === kind) ?? false)

const textOf = (node: ts.Expression | undefined): string | null =>
  node && ts.isStringLiteralLike(node) ? node.text : null

const bindingNames = (name: ts.BindingName): ts.Identifier[] =>
  ts.isIdentifier(name)
    ? [name]
    : name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
      )

/** Имена, которые объявляет инструкция верхнего уровня. */
const declaredNames = (statement: ts.Statement): ts.Identifier[] => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((item) => bindingNames(item.name))
  }

  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name))
  ) {
    return statement.name && ts.isIdentifier(statement.name) ? [statement.name] : []
  }

  return []
}

const imported = (spec: string, name: string, node: ts.Node, source: ts.SourceFile): Binding => ({
  kind: 'imported',
  via: { spec, name },
  pos: node.getStart(source),
})

const addImports = (statement: ts.ImportDeclaration, scope: Scope, source: ts.SourceFile) => {
  const spec = textOf(statement.moduleSpecifier)
  const clause = statement.importClause
  const named = clause?.namedBindings

  if (!spec || !clause) return
  if (clause.name)
    setFirst(scope.locals, clause.name.text, imported(spec, 'default', clause.name, source))
  if (named && ts.isNamespaceImport(named)) {
    setFirst(scope.locals, named.name.text, imported(spec, '*', named.name, source))
  }

  if (named && ts.isNamedImports(named)) {
    for (const element of named.elements) {
      const name = (element.propertyName ?? element.name).text

      setFirst(scope.locals, element.name.text, imported(spec, name, element.name, source))
    }
  }
}

const addExports = (statement: ts.ExportDeclaration, scope: Scope, source: ts.SourceFile) => {
  const spec = textOf(statement.moduleSpecifier)
  const clause = statement.exportClause

  if (!clause) {
    if (spec) scope.stars.push(spec)

    return
  }

  if (ts.isNamespaceExport(clause)) {
    if (spec) setFirst(scope.exports, clause.name.text, imported(spec, '*', clause.name, source))

    return
  }

  for (const element of clause.elements) {
    const own = element.propertyName ?? element.name

    setFirst(
      scope.exports,
      element.name.text,
      spec
        ? imported(spec, own.text, element.name, source)
        : { kind: 'local', name: own.text, pos: own.getStart(source) },
    )
  }
}

const addStatement = (statement: ts.Statement, scope: Scope, source: ts.SourceFile) => {
  if (ts.isImportDeclaration(statement)) return addImports(statement, scope, source)
  if (ts.isExportDeclaration(statement)) return addExports(statement, scope, source)

  if (ts.isImportEqualsDeclaration(statement)) {
    const reference = statement.moduleReference
    const spec = ts.isExternalModuleReference(reference) ? textOf(reference.expression) : null

    if (!spec) return

    const binding = imported(spec, '*', statement.name, source)

    setFirst(scope.locals, statement.name.text, binding)
    if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      setFirst(scope.exports, statement.name.text, binding)
    }

    return
  }

  if (ts.isExportAssignment(statement)) {
    const value = statement.expression
    const isName = ts.isIdentifier(value)

    if (statement.isExportEquals && isName) scope.equals = value.text
    setFirst(
      scope.exports,
      'default',
      isName
        ? { kind: 'local', name: value.text, pos: value.getStart(source) }
        : { kind: 'here', pos: value.getStart(source) },
    )

    return
  }

  const names = declaredNames(statement)
  const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)

  for (const name of names) {
    const binding: Binding = { kind: 'here', pos: name.getStart(source) }

    setFirst(scope.locals, name.text, binding)
    if (isExported && !isDefault) setFirst(scope.exports, name.text, binding)
  }

  if (isExported && isDefault) {
    setFirst(scope.exports, 'default', {
      kind: 'here',
      pos: (names[0] ?? statement).getStart(source),
    })
  }
}

const collect = (statements: readonly ts.Statement[], source: ts.SourceFile): Scope => {
  const scope: Scope = {
    exports: new Map(),
    locals: new Map(),
    stars: [],
    equals: null,
    statements,
  }

  for (const statement of statements) addStatement(statement, scope, source)

  return scope
}

/** Тела «declare module X {}» с этим именем (namespace) или со строковым (ambient-модуль). */
const moduleBodies = (statements: readonly ts.Statement[], name?: string): ts.ModuleBlock[] =>
  statements.flatMap((statement) =>
    ts.isModuleDeclaration(statement) &&
    statement.body &&
    ts.isModuleBlock(statement.body) &&
    (name === undefined ? ts.isStringLiteral(statement.name) : statement.name.text === name)
      ? [statement.body]
      : [],
  )

const lookup = (scope: Scope, name: string, source: ts.SourceFile): ExportHit => {
  const entry = scope.exports.get(name)

  if (entry?.kind === 'local')
    return scope.locals.get(entry.name) ?? { kind: 'here', pos: entry.pos }
  if (entry) return entry

  // export = X: в старых типах (React, Express) имена модуля - члены пространства X, и внутри
  // «declare namespace» они отданы и без слова export.
  for (const body of scope.equals ? moduleBodies(scope.statements, scope.equals) : []) {
    const inner = collect(body.statements, source)
    const member = inner.exports.get(name) ?? inner.locals.get(name)

    if (member?.kind === 'local')
      return inner.locals.get(member.name) ?? { kind: 'here', pos: member.pos }
    if (member) return member
  }

  return scope.stars.length > 0 ? { kind: 'stars', specs: scope.stars } : { kind: 'none' }
}

/**
 * Где модуль отдаёт имя (default - экспорт по умолчанию). По синтаксису верхнего уровня, без
 * проверки типов: экспорт всегда пишется там, и этого хватает. Не нашлось в файле - ищется в
 * телах «declare module "…"» (так написаны типы Node).
 */
export const findExport = (source: ts.SourceFile, name: string): ExportHit => {
  const known = scopes.get(source)
  const scope = known ?? collect(source.statements, source)

  if (!known) scopes.set(source, scope)

  const hit = lookup(scope, name, source)

  if (hit.kind !== 'none') return hit

  for (const body of moduleBodies(source.statements)) {
    const inner = lookup(collect(body.statements, source), name, source)

    if (inner.kind !== 'none') return inner
  }

  return hit
}
