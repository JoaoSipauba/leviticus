export type Permission =
  | 'add_songs'
  | 'manage_songs'
  | 'manage_groups'
  | 'manage_playlists'
  | 'add_songs_to_playlist'
  | 'manage_members'
  | 'manage_roles'

export type Role = {
  id: string
  org_id: string
  name: string
  updated_at: string
}

export type RolePermission = {
  role_id: string
  permission: Permission
}

export type UserRoleAssignment = {
  id: string
  user_id: string
  org_id: string
  role_id: string
  group_id: string | null
}
