import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'

/** Тексты телефона - по-английски, как интерфейс IDE; ключи - в locales/en.json. */
void i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18next
