// packages/core/src/types/org.ts
export type Permission =
  | 'add_songs'
  | 'manage_songs'
  | 'manage_groups'
  | 'manage_playlists'
  | 'add_songs_to_playlist'
  | 'manage_members'
  | 'manage_roles'
  | 'manage_integrations'

export type Organization = {
  id: string
  name: string
  owner_id: string
  city: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export type OrgMember = {
  user_id: string
  org_id: string
  joined_at: string
}

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

export type InviteCode = {
  id: string
  org_id: string
  code: string
  label: string | null
  created_by: string
  expires_at: string | null
  is_active: boolean
}
