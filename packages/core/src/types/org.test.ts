import { describe, it, expectTypeOf } from 'vitest'
import type { Permission } from './org.js'

describe('Permission type', () => {
  it('includes manage_integrations', () => {
    const p: Permission = 'manage_integrations'
    expectTypeOf(p).toMatchTypeOf<Permission>()
  })

  it('still includes existing permissions', () => {
    const perms: Permission[] = [
      'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
      'add_songs_to_playlist', 'manage_members', 'manage_roles', 'manage_integrations'
    ]
    expectTypeOf(perms).toEqualTypeOf<Permission[]>()
  })
})
