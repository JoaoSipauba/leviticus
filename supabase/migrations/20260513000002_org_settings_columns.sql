ALTER TABLE organizations
  ADD COLUMN city text,
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE org_invite_codes
  ADD COLUMN label text;
