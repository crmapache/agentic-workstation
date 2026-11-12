import type { RemoteView, RemoteDevice, RemotePairing, RemotePending } from '@shared/remote'

export type PairingPanelProps = { view: RemoteView }

export type PairingOfferProps = { pairing: RemotePairing }

export type PendingPhoneProps = { pending: RemotePending }

export type PhoneListProps = { devices: RemoteDevice[] }
