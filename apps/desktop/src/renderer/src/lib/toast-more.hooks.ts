import { useTranslation } from 'react-i18next'

/**
 * Подписи стрелки, которая раскрывает длинное пояснение уведомления в углу окна (Toast more):
 * одни на все уведомления IDE, чтобы ни одно не встало простынёй во всю высоту окна.
 */
export const useToastMore = () => {
  const { t } = useTranslation()

  return { showLabel: t('common.showMore'), hideLabel: t('common.showLess') }
}
