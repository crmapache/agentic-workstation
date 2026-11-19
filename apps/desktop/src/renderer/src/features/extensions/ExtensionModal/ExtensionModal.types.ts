import type { ExtensionInfo, ExtensionSettingField } from '@shared/extensions'

export type ExtensionModalProps = { extension: ExtensionInfo }

export type ExtensionPartProps = { extension: ExtensionInfo }

export type SettingFieldProps = {
  extensionId: string
  field: ExtensionSettingField
  value: ExtensionInfo['settings'][string] | undefined
}
