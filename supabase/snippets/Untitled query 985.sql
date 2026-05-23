-- Simula JWT do usuário e testa o fluxo completo
SELECT set_config('request.jwt.claims', '{"sub":"53fa4635-5d03-4cc1-b161-0d72f803ddf4","role":"authenticated"}', true);
SELECT auth.uid();
SELECT is_org_member('a6581613-a0c3-4549-a96a-3ccc560ac30e'::uuid) AS is_member;
SELECT has_permission('a6581613-a0c3-4549-a96a-3ccc560ac30e'::uuid, 'manage_songs') AS can_manage;