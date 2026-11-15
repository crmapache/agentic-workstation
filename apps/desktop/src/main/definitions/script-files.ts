import ts from 'typescript'

const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
}

/** Код на TypeScript или JavaScript - вид разбора по расширению; null - не код, по нему не ходим. */
export const scriptKindOf = (file: string): ts.ScriptKind | null =>
  SCRIPT_KINDS[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? null

/** Путь так, как его пишет TypeScript: через «/» и на Windows. */
export const tsPath = (path: string): string => path.replaceAll('\\', '/')
