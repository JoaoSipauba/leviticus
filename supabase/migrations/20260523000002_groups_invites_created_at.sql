-- Adiciona created_at em groups e org_invite_codes pra rastreio temporal
-- no dashboard admin. Aditivo: nullable + default now() cobre inserts novos
-- sem que o app precise listar a coluna.

alter table groups
  add column if not exists created_at timestamptz default now();

alter table org_invite_codes
  add column if not exists created_at timestamptz default now();

create index if not exists idx_groups_created_at on groups (created_at);
create index if not exists idx_org_invite_codes_created_at on org_invite_codes (created_at);
