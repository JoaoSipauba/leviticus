-- Sessões de reprodução persistidas localmente — usadas pra calcular
-- minutos tocados de forma resiliente a crash/force-quit.
--
-- A coluna `played_seconds` é atualizada a cada ~15s enquanto a música toca.
-- No fim natural (song_completed) ou parada parcial (song_stopped), o evento
-- de analytics lê o valor desta tabela em vez de tentar reconstruir do estado
-- em memória (que se perde em panic do Rust, force-quit, OS kill).
--
-- No boot, qualquer linha que sobrou é tratada como sessão órfã: emite-se
-- um song_stopped retroativo com o último `played_seconds` salvo, e a linha
-- é deletada. Perda máxima de áudio contabilizado: o intervalo do throttle
-- (~15s) — não uma faixa inteira.
--
-- Apenas local — NÃO sincroniza com Supabase. É buffer pra calcular métrica.

CREATE TABLE IF NOT EXISTS playback_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id         TEXT    NOT NULL,
  playlist_id     TEXT,
  started_at      TEXT    NOT NULL,
  last_tick_at    TEXT    NOT NULL,
  played_seconds  INTEGER NOT NULL DEFAULT 0
);
