import type {
  StorePage,
  StoreSort,
  StoreResult,
  StoreUpdate,
  StoreIdentity,
  StoreListingView,
} from '@shared/extension-store'
import type { ExtensionsState } from '@shared/extensions'

import { publisherIdOf } from '@agentic-workstation/store-protocol/node-signer'
import { checkPackage, compareVersions } from '@agentic-workstation/store-protocol/package-format'

import type { ExtensionsService } from '../extensions-service'
import type { ExtensionSecrets } from '../extensions-service.types'
import type { ExtensionsStore } from '../extensions-store'
import { parseManifest } from '../manifest/manifest'
import { packExtension, unpackExtension } from './package-io'
import type { StoreClient } from './store-client'
import { knownPublicKey } from './store-keys'

export type ExtensionStoreDeps = {
  root: string
  client: StoreClient
  extensions: ExtensionsService
  store: ExtensionsStore
  secrets: ExtensionSecrets
}

const fail = <T>(
  error: Extract<StoreResult<T>, { ok: false }>['error'],
  message: string,
): StoreResult<T> => ({
  ok: false,
  error,
  message,
})

/**
 * Магазин расширений в IDE (ADR 0091): каталог и карточки, установка и обновление с проверкой
 * отпечатка пакета и манифеста, публикация своей папки, отзывы. Ставит в ту же папку расширений;
 * своё расширение с тем же id магазин не затирает.
 */
export class ExtensionStore {
  constructor(private readonly deps: ExtensionStoreDeps) {}

  list(query: { q: string; sort: StoreSort; offset: number }): Promise<StoreResult<StorePage>> {
    return this.deps.client.list(query)
  }

  async view(id: string): Promise<StoreResult<StoreListingView>> {
    const [detail, reviews] = await Promise.all([
      this.deps.client.detail(id),
      this.deps.client.reviews(id, 0),
    ])

    if (!detail.ok) return detail
    if (!reviews.ok) return reviews

    const key = knownPublicKey(this.deps.secrets)

    return {
      ok: true,
      value: {
        listing: detail.value,
        reviews: reviews.value,
        installed: this.installed(id),
        mine: key !== null && publisherIdOf(key) === detail.value.publisher.id,
      },
    }
  }

  reviews(id: string, offset: number): Promise<StoreResult<StoreListingView['reviews']>> {
    return this.deps.client.reviews(id, offset)
  }

  /**
   * Поставить или обновить: пакет сверяется с отпечатком, манифест - разбором IDE. Новое
   * расширение получает права, которые человек видел у кнопки установки; обновление - прежние
   * права: попросило шире - ждёт одобрения.
   */
  async install(id: string, version: string | null): Promise<StoreResult<ExtensionsState>> {
    const detail = await this.deps.client.detail(id)

    if (!detail.ok) return detail

    const target = detail.value.versions.find(
      (item) => item.version === (version ?? detail.value.version),
    )

    if (!target) return fail('not-found', `No version ${version ?? ''} of ${id}.`)

    const before = this.deps.store.get(id)
    const installed = this.installed(id)

    if (installed?.local) return fail('exists-local', `Your own extension "${id}" is already here.`)

    const downloaded = await this.deps.client.download(id, target.version, target.digest)

    if (!downloaded.ok) return downloaded

    const check = checkPackage(downloaded.value)

    if (!check.ok) return fail('invalid-package', check.reason)

    const manifest = parseManifest(JSON.stringify(check.pkg.manifest), id)

    if (!manifest.ok) return fail('invalid-package', manifest.detail)

    await unpackExtension(this.deps.root, check.pkg, id)
    this.deps.store.update(id, {
      enabled: true,
      granted: installed ? before.granted : manifest.manifest.requests,
      source: { kind: 'store', version: target.version, publisher: detail.value.publisher.name },
    })
    await this.deps.extensions.reload(id)
    void this.deps.client.recordInstall(id, target.version)

    return { ok: true, value: this.deps.extensions.state() }
  }

  /** Опубликовать своё расширение: пакет из папки, подпись ключом этой IDE. */
  async publish(id: string): Promise<StoreResult<{ version: string }>> {
    const local = this.deps.extensions.state().extensions.find((item) => item.id === id)

    if (!local) return fail('not-found', `No extension "${id}".`)
    if (this.deps.store.get(id).source)
      return fail('not-owner', 'An extension from the store is published by its author.')

    const pack = await packExtension(local.dir)

    if (!pack.ok) return fail('invalid-package', pack.reason)

    const published = await this.deps.client.publish(id, pack.pkg)

    return published.ok ? { ok: true, value: { version: published.value.version } } : published
  }

  review(id: string, rating: number, text: string): Promise<StoreResult<unknown>> {
    return this.deps.client.review(id, rating, text)
  }

  report(id: string, reason: string): Promise<StoreResult<unknown>> {
    return this.deps.client.report(id, reason)
  }

  unpublish(id: string): Promise<StoreResult<unknown>> {
    return this.deps.client.unpublish(id)
  }

  identity(): Promise<StoreResult<StoreIdentity>> {
    return this.deps.client.me()
  }

  rename(name: string): Promise<StoreResult<StoreIdentity>> {
    return this.deps.client.rename(name)
  }

  /** Поставленное из магазина, у чего вышла версия новее. */
  async updates(): Promise<StoreResult<StoreUpdate[]>> {
    const fromStore = this.deps.extensions
      .state()
      .extensions.map((item) => ({ id: item.id, source: this.deps.store.get(item.id).source }))
      .filter((item) => item.source !== null)

    if (fromStore.length === 0) return { ok: true, value: [] }

    const fresh = await this.deps.client.pick(fromStore.map((item) => item.id))

    if (!fresh.ok) return fresh

    return {
      ok: true,
      value: fromStore.flatMap(({ id, source }) => {
        const latest = fresh.value.items.find((item) => item.id === id)?.version

        return latest && source && compareVersions(latest, source.version) > 0
          ? [{ id, installed: source.version, latest }]
          : []
      }),
    }
  }

  private installed(id: string): StoreListingView['installed'] {
    const local = this.deps.extensions.state().extensions.find((item) => item.id === id)

    if (!local) return null

    const source = this.deps.store.get(id).source

    return source
      ? { version: source.version, local: false }
      : { version: local.manifest?.version ?? '', local: true }
  }
}
