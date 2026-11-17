import type { Ref, ReactNode } from 'react'

import type { WebImageRead } from '@shared/preview-images'

import type { ImageFile } from '../image-file.queries'
import type { PreviewImageData } from '../markdown-preview.types'

export type MarkdownPreviewProps = {
  projectId: string
  /** Файл Markdown вкладки: путь от корня проекта. */
  path: string
  /** Прокручиваемый лист просмотра: по нему редактор прокручивается вместе с кодом. */
  ref?: Ref<HTMLDivElement> | undefined
}

export type PreviewCodeProps = { code: string; language: string }

/** Ссылка и картинка знают, из какого файла они: пути в них - от его папки. */
type InFile = { projectId: string; filePath: string }

export type PreviewLinkProps = InFile & { href: string; children: ReactNode }

export type ImageLightboxProps = { projectId: string; path: string; onClose: () => void }

export type PreviewImageProps = InFile & { image: PreviewImageData }

export type ProjectImageProps = { projectId: string; path: string; image: PreviewImageData }

export type WebImageProps = InFile & { url: string; image: PreviewImageData }

export type ShownImageProps = { src: string; image: PreviewImageData }

/**
 * Почему картинки нет: файла нет, не картинка, велика, нельзя прочесть - или это
 * картинка с сайта, которую ещё не разрешили показать (hidden).
 */
export type ImageProblem =
  | Exclude<ImageFile, { kind: 'image' }>
  | Exclude<WebImageRead, { kind: 'image' }>
  | { kind: 'hidden' }

export type ImageCaptionProps = { image: PreviewImageData; problem: ImageProblem }

export type WebImagesNoticeProps = {
  projectId: string
  path: string
  /** Адреса картинок с сайтов в файле - сейчас. */
  urls: readonly string[]
}
