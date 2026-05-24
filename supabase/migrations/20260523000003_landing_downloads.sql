-- Tabela pra rastrear clicks nos botões de download da landing.
-- Sem PII (sem IP, sem email). UA e referrer são informativos.
-- Apenas service role escreve (via API route da landing) e lê (via admin).

create table landing_downloads (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null check (platform in ('mac', 'win')),
  occurred_at timestamptz not null default now(),
  referrer    text,
  user_agent  text,
  country     text
);

alter table landing_downloads enable row level security;

-- Sem POLICY: bloqueia anon e authenticated. Só service role tem acesso.

create index idx_landing_downloads_occurred on landing_downloads (occurred_at desc);
create index idx_landing_downloads_platform on landing_downloads (platform, occurred_at desc);
