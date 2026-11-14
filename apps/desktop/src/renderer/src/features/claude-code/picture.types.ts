import type { PicturePlace } from '@shared/claude-draft'

/**
 * Откуда окно берёт картинку чипа (как в ACC): байты уже здесь (вставленная в поле) или
 * место, откуда их спросить, и запасное место, если там её не оказалось. name - путь
 * выбранной картинки целиком: на чипе он разрезан, и две картинки с похожими именами из
 * разных папок иначе не различить.
 */
export type PictureSource = (
  { data: string } | { place: PicturePlace; fallback?: PicturePlace | undefined }
) & {
  name?: string | undefined
}

/** Что показать за чипом: картинку с её размером, ожидание или «нечего показать». */
export type PictureLook =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; url: string; width: number; height: number }
