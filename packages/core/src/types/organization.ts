export type Organization = {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
}

export type OrganizationMember = {
  user_id: string
  org_id: string
  joined_at: string
}

export type OrgInviteCode = {
  id: string
  org_id: string
  code: string
  created_by: string
  expires_at: string | null
  is_active: boolean
}
