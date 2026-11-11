import prettier from 'eslint-config-prettier'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

import js from '@eslint/js'

const RENDERER = 'apps/desktop/src/renderer/src'

const RENDERER_FILES = [`${RENDERER}/**/*.{ts,tsx}`, 'packages/ui/src/**/*.{ts,tsx}']

/**
 * Части приложения, между которыми линтер держит границы. Карта и смысл каждой -
 * в docs/architecture.md, правило «кто кого может импортировать» - ниже в
 * boundaries/dependencies. Новая папка верхнего уровня в рендерере без записи
 * здесь не попадёт ни в одну часть, и импорт из неё упадёт.
 */
const ELEMENTS = [
  { type: 'ui', pattern: 'packages/ui/src/**', partialMatch: false },
  { type: 'shared', pattern: 'apps/desktop/src/shared/**', partialMatch: false },
  { type: 'main', pattern: 'apps/desktop/src/main/**', partialMatch: false },
  { type: 'preload', pattern: 'apps/desktop/src/preload/**', partialMatch: false },
  { type: 'app', pattern: `${RENDERER}/app/**`, partialMatch: false },
  { type: 'workbench', pattern: `${RENDERER}/workbench/**`, partialMatch: false },
  {
    type: 'feature',
    pattern: `${RENDERER}/features/*/**`,
    partialMatch: false,
    capture: ['feature'],
  },
  { type: 'state', pattern: `${RENDERER}/state/**`, partialMatch: false },
  { type: 'lib', pattern: `${RENDERER}/lib/**`, partialMatch: false },
  { type: 'locales', pattern: `${RENDERER}/locales/**`, partialMatch: false },
  // Браузер для ИИ (ADR 0040): протокол - общий пакет, расширение Chrome и native host -
  // свои части. Host исполняется бинарником IDE как чистый Node и в главный процесс не ходит.
  {
    type: 'browser-protocol',
    pattern: 'packages/browser-protocol/src/**',
    partialMatch: false,
  },
  {
    type: 'browser-extension',
    pattern: 'apps/browser-extension/src/**',
    partialMatch: false,
  },
  { type: 'native-host', pattern: 'apps/desktop/src/native-host/**', partialMatch: false },
  // Remote Control (ADR 0041): протокол - общий пакет IDE и телефона, релей - свой сервер.
  {
    type: 'remote-protocol',
    pattern: 'packages/remote-protocol/src/**',
    partialMatch: false,
  },
  { type: 'relay', pattern: 'apps/relay/src/**', partialMatch: false },
  // Телефонный клиент Remote Control: своё приложение в браузере телефона. Из общего - только
  // протокол и дизайн-система; IDE он знает лишь по протоколу. Сквозные проверки (e2e/)
  // поднимают настоящий релей и RemoteService главного процесса с подделками сервисов IDE.
  { type: 'phone', pattern: 'apps/phone/src/**', partialMatch: false },
  { type: 'phone-e2e', pattern: 'apps/phone/e2e/**', partialMatch: false },
]

/** Тесты: им можно больше, чем коду (сквозная проверка поднимает настоящий релей). */
const FILE_CATEGORIES = [{ category: 'test', pattern: '**/*.test.ts' }]

const allowTo = (...types) => ({ to: { element: { types: { anyOf: types } } } })

const NO_BARREL = {
  group: ['**/index', '**/index.ts', '**/index.tsx'],
  message: 'Без barrel-файлов: импортируй файл компонента напрямую.',
}

const NO_REACT_FC = {
  name: 'react',
  importNames: ['FC', 'FunctionComponent'],
  message: 'Без React.FC: тип props - на параметре функции.',
}

/**
 * Разметка интерфейса - окна IDE, дизайн-системы и телефона: стили только в .module.scss, иконки -
 * lucide, подсказка - Tooltip, текст - через i18n, без React.FC.
 */
const INTERFACE_SYNTAX = [
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      'Inline style запрещён: стили в .module.scss. Исключение - по-настоящему динамическое значение (ширина при перетаскивании и т.п.) с eslint-disable и причиной.',
  },
  {
    selector: "JSXOpeningElement[name.name='svg']",
    message: 'Inline <svg> запрещён: иконки из lucide-react.',
  },
  {
    // Только у элементов разметки: у компонентов (Dialog, Card, Toast) title - свой проп.
    selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
    message:
      'Системный title выглядит чужим: подсказка - Tooltip из дизайн-системы (@agentic-workstation/ui/Tooltip).',
  },
  {
    selector: 'JSXText[value=/\\S/]',
    message: 'Текст интерфейса - только через i18n (t(...)), без строк прямо в JSX.',
  },
  {
    selector: "TSQualifiedName[left.name='React'][right.name=/^(FC|FunctionComponent)$/]",
    message: 'Без React.FC: тип props - на параметре функции.',
  },
]

export default defineConfig(
  {
    // bench/ - отдельные стенды со своими зависимостями, вне workspace и вне tsconfig.
    ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/coverage/**', 'bench/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      // Неиспользуемый аргумент с подчёркиванием - намеренный, а не забытый.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Обработчики событий в JSX возвращают промис, и это нормально: ошибки
      // ловит сам обработчик. Остальные «потерянные» промисы - ошибка.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Конфиги и скрипты на чистом JS: вне tsconfig, типовые правила к ним не применимы.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-misused-promises': 'off' },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Размер файла - главный сигнал, что пора делить. Лимит жёсткий намеренно:
  // в прошлой попытке IDE файлы доросли до 3-7 тысяч строк, и разобрать их потом
  // не получилось. Как делить - .claude/rules/renderer-components.md.
  {
    files: ['**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Границы между частями приложения (см. ELEMENTS выше).
  {
    files: [
      'apps/desktop/src/**/*.{ts,tsx}',
      'packages/ui/src/**/*.{ts,tsx}',
      'packages/browser-protocol/src/**/*.ts',
      'apps/browser-extension/src/**/*.ts',
      'packages/remote-protocol/src/**/*.ts',
      'apps/relay/src/**/*.ts',
      'apps/phone/src/**/*.{ts,tsx}',
      'apps/phone/e2e/**/*.ts',
    ],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': ELEMENTS,
      'boundaries/files': FILE_CATEGORIES,
      'boundaries/include': [
        'apps/desktop/src/**/*',
        'packages/ui/src/**/*',
        'packages/browser-protocol/src/**/*',
        'apps/browser-extension/src/**/*',
        'packages/remote-protocol/src/**/*',
        'apps/relay/src/**/*',
        'apps/phone/src/**/*',
        'apps/phone/e2e/**/*',
      ],
      'import/resolver': {
        typescript: {
          noWarnOnMultipleProjects: true,
          project: [
            'apps/desktop/tsconfig.node.json',
            'apps/desktop/tsconfig.web.json',
            'packages/ui/tsconfig.json',
            'packages/browser-protocol/tsconfig.json',
            'apps/browser-extension/tsconfig.app.json',
            'packages/remote-protocol/tsconfig.json',
            'apps/relay/tsconfig.json',
            'apps/phone/tsconfig.app.json',
            'apps/phone/tsconfig.node.json',
          ],
        },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            'Граница частей приложения: {{from.element.type}} не может импортировать {{to.element.type}}. Карта - docs/architecture.md.',
          policies: [
            // Внешние пакеты и встроенные модули ограничиваются отдельно (no-restricted-imports).
            { allow: { to: { module: { origin: 'external' } } } },
            { allow: { to: { module: { origin: 'core' } } } },
            // Внутри своей части - всегда можно.
            { allow: { dependency: { relationship: { to: 'internal' } } } },

            { from: { element: { type: 'ui' } }, allow: allowTo('ui') },
            { from: { element: { type: 'locales' } }, allow: allowTo('locales') },
            { from: { element: { type: 'shared' } }, allow: allowTo('shared') },
            {
              from: { element: { type: 'main' } },
              allow: allowTo('main', 'shared', 'browser-protocol', 'remote-protocol'),
            },
            { from: { element: { type: 'remote-protocol' } }, allow: allowTo('remote-protocol') },
            { from: { element: { type: 'relay' } }, allow: allowTo('relay') },
            // Релей своё содержимое не читает и протокола не знает; тесты сверяют его конверт с
            // протоколом, а сквозная проверка IDE поднимает его настоящим.
            {
              from: { element: { type: 'relay' }, file: { categories: 'test' } },
              allow: allowTo('remote-protocol'),
            },
            {
              from: { element: { type: 'main' }, file: { categories: 'test' } },
              allow: allowTo('relay'),
            },
            // Телефон не видит ни IDE, ни релея: только протокол и дизайн-систему.
            {
              from: { element: { type: 'phone' } },
              allow: allowTo('phone', 'ui', 'remote-protocol'),
            },
            // Сквозная проверка телефона: настоящий релей, RemoteService главного процесса с
            // подделками сервисов IDE (их общий контракт - shared) и ядро телефона.
            {
              from: { element: { type: 'phone-e2e' } },
              allow: allowTo('phone-e2e', 'phone', 'main', 'shared', 'relay', 'remote-protocol'),
            },
            { from: { element: { type: 'browser-protocol' } }, allow: allowTo('browser-protocol') },
            {
              from: { element: { type: 'browser-extension' } },
              allow: allowTo('browser-extension', 'browser-protocol'),
            },
            {
              from: { element: { type: 'native-host' } },
              allow: allowTo('native-host', 'browser-protocol'),
            },
            { from: { element: { type: 'preload' } }, allow: allowTo('preload', 'shared') },
            { from: { element: { type: 'lib' } }, allow: allowTo('lib', 'shared') },
            {
              from: { element: { type: 'state' } },
              allow: allowTo('state', 'lib', 'shared'),
            },
            // Фича видит только себя и общие слои. Соседнюю фичу - никогда: связывает
            // фичи workbench, общие данные лежат в state.
            {
              from: { element: { type: 'feature' } },
              allow: allowTo('state', 'lib', 'shared', 'ui', 'locales'),
            },
            {
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: {
                    type: 'feature',
                    captured: { feature: '{{from.element.captured.feature}}' },
                  },
                },
              },
            },
            {
              from: { element: { type: 'workbench' } },
              allow: allowTo('workbench', 'feature', 'state', 'lib', 'shared', 'ui', 'locales'),
            },
            {
              from: { element: { type: 'app' } },
              allow: allowTo(
                'app',
                'workbench',
                'feature',
                'state',
                'lib',
                'shared',
                'ui',
                'locales',
              ),
            },
          ],
        },
      ],
    },
  },

  // Главный процесс не знает про React и дизайн-систему.
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react/*',
                '@agentic-workstation/ui',
                '@agentic-workstation/ui/*',
              ],
              message: 'Главный процесс и общий контракт не зависят от интерфейса.',
            },
          ],
        },
      ],
    },
  },

  // Общий контракт импортируют все три процесса - в нём только типы и чистые данные.
  {
    files: ['apps/desktop/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*', 'react', 'react/*', '@agentic-workstation/ui/*'],
              message:
                'shared едет во все процессы: только типы и чистые данные, без Electron и Node.',
            },
          ],
        },
      ],
    },
  },

  // Native host исполняет бинарник IDE с ELECTRON_RUN_AS_NODE=1 - это чистый Node, Electron
  // в нём нет. Протокол едет и в расширение: без Node и Electron.
  {
    files: ['apps/desktop/src/native-host/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*'],
              message: 'Native host - чистый Node (ELECTRON_RUN_AS_NODE=1), Electron в нём нет.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/browser-protocol/src/**/*.ts', 'apps/browser-extension/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', 'node:*'],
              message: 'Протокол и расширение работают в браузере: без Node и Electron.',
            },
          ],
        },
      ],
    },
  },
  // Протокол Remote Control едет и в главный процесс, и в телефон: общий только язык (ES,
  // TextEncoder, DataView). Ни Node, ни DOM, ни Electron.
  {
    files: ['packages/remote-protocol/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', 'node:*', 'react', 'react/*'],
              message: 'Протокол Remote Control - чистый TypeScript для IDE и телефона.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['Buffer', 'process', 'window', 'document', 'atob', 'btoa'].map((name) => ({
          name,
          message: 'Протокол Remote Control - чистый TypeScript: без Node и DOM.',
        })),
      ],
    },
  },
  // Релей - Node и ws, к IDE отношения не имеет.
  {
    files: ['apps/relay/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', 'react', 'react/*', '@agentic-workstation/ui/*'],
              message: 'Релей - отдельный сервер на Node: без Electron и интерфейса.',
            },
          ],
        },
      ],
    },
  },

  // Окно не трогает Node и Electron напрямую: всё через мост preload (lib/ipc.ts).
  {
    files: RENDERER_FILES,
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', 'node:*'],
              message: 'Окно ходит в главный процесс только через lib/ipc.ts.',
            },
            NO_BARREL,
          ],
          paths: [NO_REACT_FC],
        },
      ],
      'no-restricted-syntax': ['error', ...INTERFACE_SYNTAX],
    },
  },

  // Телефон - страница в браузере телефона: ни Node, ни Electron, к IDE - только по протоколу.
  {
    files: ['apps/phone/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', 'node:*'],
              message:
                'Телефон - страница в браузере: без Node и Electron, к IDE - через протокол.',
            },
            NO_BARREL,
          ],
          paths: [NO_REACT_FC],
        },
      ],
      'no-restricted-syntax': ['error', ...INTERFACE_SYNTAX],
    },
  },

  // Тесты лежат рядом с кодом. Лимит размера на них не действует (см. выше), а
  // промисы describe/it дожидается сам vitest.
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },

  prettier,
)
