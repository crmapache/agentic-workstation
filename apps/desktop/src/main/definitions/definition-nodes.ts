import ts from 'typescript'

import type { ImportedName } from './definition.types'

/** Вызовы, у которых первый аргумент - путь модуля: подмена модуля в тестах vitest и jest. */
const MOCK_CALLS = new Set(['mock', 'doMock', 'unmock', 'importActual', 'requireActual'])

const MOCK_OWNERS = new Set(['vi', 'jest'])

type WithModule = { moduleSpecifier?: ts.Expression | undefined }

const moduleOf = (declaration: WithModule): string | null => {
  const spec = declaration.moduleSpecifier

  return spec && ts.isStringLiteralLike(spec) ? spec.text : null
}

const named = (spec: string | null, name: string): ImportedName | null =>
  spec === null ? null : { spec, name }

/** Самый глубокий узел, который накрывает смещение (без пробелов и комментариев перед ним). */
export const nodeAt = (source: ts.SourceFile, offset: number): ts.Node | undefined => {
  let found: ts.Node | undefined

  const visit = (node: ts.Node): void => {
    if (offset < node.getStart(source) || offset >= node.end) return

    found = node
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(source, visit)

  return found
}

/**
 * Имя - часть импорта или реэкспорта: «import { a as b }», «import a», «import * as a»,
 * «import a = require()», «export { a } from», «export * as a from». Ответ - путь модуля и
 * какое имя в нём; null - имя не оттуда.
 */
export const importedBy = (id: ts.Identifier): ImportedName | null => {
  const parent = id.parent

  if (ts.isImportSpecifier(parent)) {
    return named(moduleOf(parent.parent.parent.parent), (parent.propertyName ?? parent.name).text)
  }

  if (ts.isImportClause(parent) && parent.name === id)
    return named(moduleOf(parent.parent), 'default')
  if (ts.isNamespaceImport(parent)) return named(moduleOf(parent.parent.parent), '*')
  if (ts.isNamespaceExport(parent)) return named(moduleOf(parent.parent), '*')

  if (ts.isExportSpecifier(parent)) {
    return named(moduleOf(parent.parent.parent), (parent.propertyName ?? parent.name).text)
  }

  if (
    ts.isImportEqualsDeclaration(parent) &&
    parent.name === id &&
    ts.isExternalModuleReference(parent.moduleReference)
  ) {
    const spec = parent.moduleReference.expression

    return named(ts.isStringLiteralLike(spec) ? spec.text : null, '*')
  }

  return null
}

/** Путь из «require('путь')»; null - это не он. */
const requireOf = (value: ts.Expression | undefined): string | null => {
  const spec = value && ts.isCallExpression(value) ? value.arguments[0] : undefined
  const isRequire =
    value !== undefined &&
    ts.isCallExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === 'require'

  return isRequire && spec && ts.isStringLiteralLike(spec) ? spec.text : null
}

/**
 * Имя из CommonJS: «const a = require('x')» - модуль целиком, «const { a, b: c } = require('x')» -
 * его член.
 */
export const requiredBy = (id: ts.Identifier): ImportedName | null => {
  const parent = id.parent

  if (ts.isVariableDeclaration(parent) && parent.name === id) {
    return named(requireOf(parent.initializer), '*')
  }

  const pattern = parent.parent

  if (
    !ts.isBindingElement(parent) ||
    parent.name !== id ||
    !ts.isObjectBindingPattern(pattern) ||
    !ts.isVariableDeclaration(pattern.parent)
  ) {
    return null
  }

  const key = parent.propertyName ?? parent.name

  return ts.isIdentifier(key) || ts.isStringLiteral(key)
    ? named(requireOf(pattern.parent.initializer), key.text)
    : null
}

/** Вызов, первый аргумент которого - путь модуля: import(), require(), require.resolve(), vi.mock(). */
const takesModule = (call: ts.CallExpression): boolean => {
  const callee = call.expression

  if (callee.kind === ts.SyntaxKind.ImportKeyword) return true
  if (ts.isIdentifier(callee)) return callee.text === 'require'

  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    ((callee.expression.text === 'require' && callee.name.text === 'resolve') ||
      (MOCK_OWNERS.has(callee.expression.text) && MOCK_CALLS.has(callee.name.text)))
  )
}

/** Строка - путь модуля: в импорте, реэкспорте, import() и require(), import('x') в типе. */
export const isModuleSpecifier = (node: ts.StringLiteralLike): boolean => {
  const parent = node.parent

  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
    return parent.moduleSpecifier === node
  }

  if (ts.isCallExpression(parent)) return parent.arguments[0] === node && takesModule(parent)

  return (
    ts.isExternalModuleReference(parent) ||
    (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent))
  )
}
