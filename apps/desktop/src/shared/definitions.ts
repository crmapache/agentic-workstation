/** Кусок текста: смещения в UTF-16 от начала, конец не включается - как у Monaco и TypeScript. */
export type TextSpan = { start: number; end: number }

/**
 * Куда ведёт имя: файл - путь от корня проекта или абсолютный (вне проекта, как у вкладки
 * файла по ссылке), строка и колонка с 1, как их считает человек.
 */
export type DefinitionTarget = { path: string; line: number; column: number }

/**
 * Ответ на «где определено»: found - что подчеркнуть (origin) и куда вести; none - вести
 * некуда, ссылки нет; needText - главный процесс не знает этой версии текста, окно присылает
 * её и спрашивает снова.
 */
export type DefinitionAnswer =
  | { kind: 'found'; origin: TextSpan; target: DefinitionTarget }
  | { kind: 'none' }
  | { kind: 'needText' }
