import { create } from 'zustand'
import type { DevicePresence, PlayerState } from '@leviticus/core'

type RemoteStore = {
  onlineDevices: DevicePresence[]
  targetDeviceId: string | null
  remotePlayerState: PlayerState | null
  setOnlineDevices: (devices: DevicePresence[]) => void
  setTargetDevice: (deviceId: string | null) => void
  setRemotePlayerState: (state: PlayerState | null) => void
}

export const useRemoteStore = create<RemoteStore>((set) => ({
  onlineDevices: [],
  targetDeviceId: null,
  remotePlayerState: null,
  setOnlineDevices: (onlineDevices) => set({ onlineDevices }),
  setTargetDevice: (targetDeviceId) => set({ targetDeviceId }),
  setRemotePlayerState: (remotePlayerState) => set({ remotePlayerState }),
}))
