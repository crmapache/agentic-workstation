import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'

/**
 * Переводы интерфейса. Пока один язык; новый - это файл в locales/ с теми же
 * ключами и строка в resources. Строки прямо в JSX запрещает линтер. Имя провайдера в
 * строках панели ({{agent}}, {{cli}}) здесь - Claude; у панелей других провайдеров свой
 * экземпляр со своим именем (features/agent-panel/panel-i18n.ts).
 */
void i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false, defaultVariables: en.providerWords.claude },
  returnNull: false,
})
