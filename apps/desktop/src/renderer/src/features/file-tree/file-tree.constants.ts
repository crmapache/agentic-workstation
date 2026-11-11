/**
 * Атрибуты кнопки строки дерева: их ставит строка (FileTreeNode), по ним меню правой кнопки
 * и клавиши дерева (FileTreeView) узнают, над чем действие. Один источник - иначе
 * переименование одного без другого молча отключило бы меню.
 */
export const ROW_PATH = 'data-tree-path'
export const ROW_DIRECTORY = 'data-tree-directory'
