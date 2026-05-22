-- Tabela de eventos comportamentais do app desktop. INSERT-only do ponto de
-- vista do app; leitura só via service role (dashboard /admin).
-- Aditiva e retrocompatível: app antigo continua funcionando, só não emite.
CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id)    ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN (
    'app_opened', 'song_played', 'song_completed',
    'download_succeeded', 'download_failed'
  )),
  -- song_id/playlist_id sem FK de propósito: o evento é histórico imutável e
  -- deve sobreviver à deleção da música/culto.
  song_id     uuid,
  playlist_id uuid,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text,
  platform    text,
  occurred_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_occurred ON analytics_events (occurred_at);
CREATE INDEX idx_analytics_events_org      ON analytics_events (org_id, occurred_at);
CREATE INDEX idx_analytics_events_type     ON analytics_events (event_type, occurred_at);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Membro autenticado só insere evento próprio, numa org da qual participa.
CREATE POLICY analytics_insert_own ON analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );
-- Sem policy de SELECT: a tabela é invisível pro app. Leitura só via service role.
