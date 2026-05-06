import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DevicePresence, RemoteCommand, PlayerState } from '@leviticus/core'
import { supabase } from './supabase.js'
import { getDeviceId, getDeviceName } from './device.js'

let _channel: RealtimeChannel | null = null
let _channelUserId: string | null = null

export function getChannel(userId: string): RealtimeChannel {
  if (_channel && _channelUserId === userId) return _channel
  if (_channel) {
    supabase.removeChannel(_channel)
  }
  _channelUserId = userId
  _channel = supabase.channel(`remote-control:${userId}`, {
    config: { presence: { key: getDeviceId() } },
  })
  return _channel
}

export async function announcePresence(userId: string): Promise<void> {
  const channel = getChannel(userId)
  const presence: DevicePresence = {
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    platform: 'desktop',
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 10_000)
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        await channel.track(presence)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(new Error(`Realtime channel status: ${status}`))
      }
    })
  })
}

export function destroyChannel(): void {
  if (_channel) {
    supabase.removeChannel(_channel)
    _channel = null
    _channelUserId = null
  }
}

export function onCommand(
  userId: string,
  handler: (cmd: RemoteCommand['payload']) => void
): void {
  getChannel(userId).on('broadcast', { event: 'command' }, ({ payload }) => {
    const cmd = payload as RemoteCommand
    if (cmd.target_device_id === getDeviceId()) {
      handler(cmd.payload)
    }
  })
}

export async function broadcastPlayerState(
  userId: string,
  state: PlayerState
): Promise<void> {
  await getChannel(userId).send({
    type: 'broadcast',
    event: 'player_state',
    payload: state,
  })
}

export async function sendCommand(
  userId: string,
  command: RemoteCommand
): Promise<void> {
  await getChannel(userId).send({
    type: 'broadcast',
    event: 'command',
    payload: command,
  })
}

export function getOnlineDevices(userId: string): DevicePresence[] {
  const state = getChannel(userId).presenceState()
  return Object.values(state).flat() as unknown as DevicePresence[]
}
