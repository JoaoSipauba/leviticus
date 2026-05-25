import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useAuthStore } from '../store/auth.js'
import { usePlayerStore } from '../store/player.js'
import { useRemoteStore } from '../store/remote.js'
import {
  announcePresence,
  onCommand,
  broadcastPlayerState,
  sendCommand,
  getOnlineDevices,
  getChannel,
  destroyChannel,
} from '../lib/realtime.js'
import { getDeviceId } from '../lib/device.js'
import { pauseAudio, resumeAudio, seekTo, setVolume, playSong } from '../lib/audio.js'
import { isDownloaded, downloadSong, getSongFilename } from '../lib/ytdlp.js'
import { getDb } from '../lib/db.js'
import type { RemoteCommand } from '@leviticus/core'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore()
  const playerStore = usePlayerStore()
  const { setOnlineDevices, setRemotePlayerState } = useRemoteStore()

  useEffect(() => {
    if (!user) return

    announcePresence(user.id).catch(() => {
      // realtime unavailable — remote control will not work
    })

    const channel = getChannel(user.id)

    channel.on('broadcast', { event: 'player_state' }, ({ payload }: { payload: unknown }) => {
      const state = payload as { device_id: string }
      if (state.device_id !== getDeviceId()) {
        setRemotePlayerState(payload as import('@leviticus/core').PlayerState)
      }
    })

    channel.on('presence', { event: 'sync' }, () => {
      setOnlineDevices(getOnlineDevices(user.id))
    })

    onCommand(user.id, async (cmd) => {
      if (cmd.type === 'play') { resumeAudio(); playerStore.resume() }
      else if (cmd.type === 'pause') { pauseAudio(); playerStore.pause() }
      else if (cmd.type === 'seek') seekTo(cmd.position_seconds)
      else if (cmd.type === 'set_volume') setVolume(cmd.volume)
      else if (cmd.type === 'play_song') {
        playerStore.setDownloading(true, 0)
        try {
          const downloaded = await isDownloaded(cmd.song_id)
          if (!downloaded) {
            const db = await getDb()
            const rows = await db.select<{ youtube_url: string }[]>(
              'SELECT youtube_url FROM songs WHERE id = ?', [cmd.song_id]
            )
            if (rows[0]) {
              await downloadSong(cmd.song_id, rows[0].youtube_url, (p) => {
                playerStore.setDownloading(true, p)
              })
            }
          }
          const path = await getSongFilename(cmd.song_id)
          playSong(path, { volume: usePlayerStore.getState().volume, songId: cmd.song_id, playlistId: usePlayerStore.getState().currentPlaylist?.id })
        } catch {
          // error is swallowed — UI will clear loading state via finally
        } finally {
          playerStore.setDownloading(false)
        }
      }
    })

    const interval = setInterval(async () => {
      const state = usePlayerStore.getState()
      await broadcastPlayerState(user.id, {
        device_id: getDeviceId(),
        song_id: state.currentSong?.id ?? null,
        playlist_id: state.currentPlaylist?.id ?? null,
        playlist_position: state.playlistPosition,
        playlist_total: state.playlistSongs.length > 0 ? state.playlistSongs.length : null,
        is_playing: state.isPlaying,
        position_seconds: state.position,
        volume: state.volume,
        is_downloading: state.isDownloading,
        download_progress: state.downloadProgress,
      })
    }, 1000)

    return () => {
      clearInterval(interval)
      destroyChannel()
    }
  }, [user])

  return <>{children}</>
}

export function RemoteControl() {
  const { onlineDevices, targetDeviceId, remotePlayerState, setTargetDevice } =
    useRemoteStore()
  const { user } = useAuthStore()

  const otherDevices = onlineDevices.filter((d) => d.device_id !== getDeviceId())

  if (otherDevices.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Controle Remoto</h2>
        <p className="text-gray-500 text-sm">
          Nenhum outro dispositivo online com a mesma conta.
        </p>
      </div>
    )
  }

  async function sendCmd(payload: RemoteCommand['payload']) {
    if (!user || !targetDeviceId) return
    await sendCommand(user.id, {
      target_device_id: targetDeviceId,
      payload,
    })
  }

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-xl font-semibold mb-4">Controle Remoto</h2>

      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-2">Dispositivo alvo:</p>
        <div className="space-y-2">
          {otherDevices.map((d) => (
            <button
              key={d.device_id}
              onClick={() => setTargetDevice(d.device_id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border ${
                targetDeviceId === d.device_id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 hover:bg-gray-800'
              }`}
            >
              <span className="text-xl">{d.platform === 'desktop' ? '💻' : '📱'}</span>
              <span>{d.device_name}</span>
            </button>
          ))}
        </div>
      </div>

      {targetDeviceId && remotePlayerState && (
        <div className="bg-gray-900 rounded-xl p-4 space-y-4">
          <p className="font-medium">
            {remotePlayerState.song_id ? 'Tocando' : 'Ocioso'}
          </p>

          {remotePlayerState.is_downloading && (
            <div>
              <p className="text-sm text-blue-400 mb-1">
                Baixando... {Math.round(remotePlayerState.download_progress * 100)}%
              </p>
              <div className="w-full bg-gray-700 rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full"
                  style={{ width: `${remotePlayerState.download_progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {remotePlayerState.playlist_position !== null && (
            <p className="text-sm text-gray-400">
              Música {(remotePlayerState.playlist_position ?? 0) + 1} de{' '}
              {remotePlayerState.playlist_total}
            </p>
          )}

          <div className="flex items-center gap-4 justify-center">
            <button onClick={() => sendCmd({ type: 'previous_in_playlist' })}
              className="text-2xl text-gray-400 hover:text-white">⏮</button>
            <button
              onClick={() =>
                sendCmd({ type: remotePlayerState.is_playing ? 'pause' : 'play' })
              }
              className="w-12 h-12 rounded-full bg-white text-gray-900 flex items-center justify-center text-xl hover:scale-105 transition-transform"
            >
              {remotePlayerState.is_playing ? '⏸' : '▶'}
            </button>
            <button onClick={() => sendCmd({ type: 'next_in_playlist' })}
              className="text-2xl text-gray-400 hover:text-white">⏭</button>
          </div>
        </div>
      )}
    </div>
  )
}
