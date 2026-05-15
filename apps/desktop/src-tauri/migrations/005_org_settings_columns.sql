ALTER TABLE orgs ADD COLUMN city TEXT;
ALTER TABLE orgs ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE IF NOT EXISTS org_invite_codes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  group_id TEXT
);

CREATE TABLE IF NOT EXISTS organization_members (
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_org ON user_role_assignments(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_org_invite_codes_org_id ON org_invite_codes(org_id);
