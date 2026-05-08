-- has_permission delega pra is_org_owner internamente, mas essa chamada tem
-- comportamento inconsistente no contexto DELETE do PostgREST local — owners
-- da org acabam recebendo "0 rows affected" silenciosamente em vez de conseguir
-- excluir suas próprias músicas. Mesmo padrão do fix em song_groups
-- (20260507000003): expandimos o owner check inline pra evitar a chamada
-- problemática.

DROP POLICY IF EXISTS "users with manage_songs can delete" ON songs;

CREATE POLICY "users with manage_songs can delete"
  ON songs FOR DELETE
  USING (
    has_permission(org_id, 'manage_songs')
    OR EXISTS (
      SELECT 1 FROM organizations
      WHERE id = org_id AND owner_id = auth.uid()
    )
  );

-- UPDATE provavelmente sofre do mesmo problema; preventivamente aplicamos o
-- mesmo padrão. (Se só quisesse fixar DELETE bastava o bloco acima.)
DROP POLICY IF EXISTS "users with manage_songs can update" ON songs;

CREATE POLICY "users with manage_songs can update"
  ON songs FOR UPDATE
  USING (
    has_permission(org_id, 'manage_songs')
    OR EXISTS (
      SELECT 1 FROM organizations
      WHERE id = org_id AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    has_permission(org_id, 'manage_songs')
    OR EXISTS (
      SELECT 1 FROM organizations
      WHERE id = org_id AND owner_id = auth.uid()
    )
  );
