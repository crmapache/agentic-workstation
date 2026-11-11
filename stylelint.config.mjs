/**
 * Строгая дизайн-система держится здесь, а не на внимательности: сырые цвета,
 * шрифты, радиусы, слои и отступы в стилях компонентов не проходят линтер.
 * Значения живут только в packages/ui/src/styles/tokens.css, компоненты берут их
 * через var(--...). Нужного токена нет - его добавляют в tokens.css, а не пишут
 * число на месте.
 */

const TEXT_SHADOW_MESSAGE = 'Тени у текста нет: стиль плоский (ADR 0006)'

/**
 * Область перетаскивания окна - только миксинами из _mixins.scss: no-drag на обычном
 * элементе вычитается из шапки, даже когда элемент прокручен за край панели и не виден,
 * и окно перестаёт тянуться над ним.
 */
const APP_REGION_MESSAGE =
  'Область перетаскивания окна - только миксинами window-drag-region и over-window-drag-region'

/** Свойства, которым разрешены только токены (и пара безопасных ключевых слов). */
const TOKEN_ONLY_PROPERTIES = [
  '/color$/',
  'fill',
  'stroke',
  'background',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'border-radius',
  'z-index',
  'box-shadow',
  'gap',
  'row-gap',
  'column-gap',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'transition-duration',
  'transition-timing-function',
]

export default {
  extends: ['stylelint-config-standard-scss'],
  plugins: ['stylelint-declaration-strict-value', 'stylelint-value-no-unknown-custom-properties'],
  ignoreFiles: ['**/node_modules/**', '**/out/**', '**/dist/**'],
  rules: {
    // CSS Modules: классы читаются из JS как styles.fooBar, поэтому camelCase.
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]*$',
      { message: 'Класс CSS Modules - camelCase (styles.fooBar)' },
    ],
    // Ссылка на токен, которого нет в tokens.css, браузер молча превращает в «ничего»:
    // переименовали токен - стиль пропал без единой ошибки. Ловим на линтере.
    // Переменные из JS (--depth) пишутся с запасным значением и сюда не попадают.
    'csstools/value-no-unknown-custom-properties': [
      true,
      { importFrom: ['packages/ui/src/styles/tokens.css'] },
    ],
    'color-no-hex': true,
    'color-named': 'never',
    // Сырые цвета - только в tokens.css. Градиенты и drop-shadow - тоже: стиль плоский
    // (ADR 0006), и если они понадобились компоненту - это решение о стиле, а не мелочь.
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklch'],
      ['linear-gradient', 'radial-gradient', 'conic-gradient'],
      ['repeating-linear-gradient', 'repeating-radial-gradient', 'drop-shadow'],
    ].flat(),
    'declaration-property-value-disallowed-list': {
      transition: ['/\\ball\\b/'],
      'transition-property': ['all'],
    },
    // Объёма нет (ADR 0006): тени у текста запрещены вовсе, а box-shadow - только у
    // всплывающего слоя и как кольцо фокуса. Градиент как фон - подложка окна и цвет букв
    // перелива «думает» (ADR 0025): это не объём, а цвет.
    'property-disallowed-list': [
      ['text-shadow', '/^(-webkit-)?app-region$/'],
      {
        message: (property) =>
          property.endsWith('app-region') ? APP_REGION_MESSAGE : TEXT_SHADOW_MESSAGE,
      },
    ],
    'declaration-property-value-allowed-list': [
      {
        'box-shadow': ['none', '/^var\\(--shadow-(overlay|focus|danger)\\)$/'],
        'background-image': ['none', '/^var\\(--gradient-(backdrop|shimmer)\\)$/'],
      },
      {
        message:
          'Объёма нет (ADR 0006): тень - только у всплывающего слоя и кольцо фокуса, градиент - подложка окна и перелив подписи «думает» (ADR 0025)',
      },
    ],
    'scale-unlimited/declaration-strict-value': [
      TOKEN_ONLY_PROPERTIES,
      {
        ignoreValues: [
          '0',
          'auto',
          'none',
          'inherit',
          'initial',
          'unset',
          'currentcolor',
          'transparent',
        ],
        expandShorthand: true,
        disableFix: true,
        message: 'Только токен дизайн-системы var(--...) (packages/ui/src/styles/tokens.css)',
      },
    ],
  },
  overrides: [
    {
      // Витрина показывает тени образцами: значение образца - из имени токена
      // (var(--sample, none)), поэтому список разрешённых теней к ней не применим.
      files: ['apps/desktop/src/renderer/src/features/showcase/**'],
      rules: {
        'declaration-property-value-allowed-list': null,
      },
    },
    {
      // Поправки к разметке Monaco и xterm.js: классы в ней чужие, не CSS Modules, и
      // camelCase к ним не относится. Значения - по-прежнему только токены.
      files: [
        'apps/desktop/src/renderer/src/features/editor/monaco.css',
        'apps/desktop/src/renderer/src/features/terminal/xterm.css',
      ],
      rules: {
        'selector-class-pattern': null,
      },
    },
    {
      // Миксины области перетаскивания окна - единственное место, где она задаётся.
      files: ['packages/ui/src/styles/_mixins.scss'],
      rules: {
        'property-disallowed-list': [['text-shadow'], { message: TEXT_SHADOW_MESSAGE }],
      },
    },
    {
      // Здесь токены и объявляются: сырые значения тут на своём месте.
      files: ['packages/ui/src/styles/tokens.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
        'scale-unlimited/declaration-strict-value': null,
      },
    },
  ],
}
