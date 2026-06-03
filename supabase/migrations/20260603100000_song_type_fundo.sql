-- Adiciona 'fundo' (fundo musical) à enumeração de song_type.
-- Issue: pedido pra que durante pregação/oração toque-se uma faixa de
-- ambiente em looping enquanto a pessoa fala. "Fundo" é o tipo dela.
--
-- Migration aditiva: nenhum dado existente quebra; apenas expande os
-- valores aceitos pela CHECK constraint.

ALTER TABLE songs
  DROP CONSTRAINT IF EXISTS songs_song_type_check;

ALTER TABLE songs
  ADD CONSTRAINT songs_song_type_check
  CHECK (song_type IN ('normal', 'playback', 'instrumental', 'vs', 'fundo'));
