create table public.waitlist (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null,
  platforms  text[]      not null default '{}',
  created_at timestamptz default now() not null,
  constraint waitlist_email_unique unique (email)
);

alter table public.waitlist enable row level security;

-- Landing page (anon) pode inserir, mas nunca ler
create policy "waitlist_insert_anon"
  on public.waitlist
  for insert
  to anon
  with check (true);
