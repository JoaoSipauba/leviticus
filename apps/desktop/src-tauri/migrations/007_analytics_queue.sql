-- Fila durável de eventos de analytics. Puramente local — NÃO é sincronizada
-- pro Supabase. trackEvent() escreve aqui; flushAnalyticsQueue() drena.
CREATE TABLE analytics_queue (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL
);
