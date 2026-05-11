-- Bucket público pra distribuir os binários e o manifest do auto-updater.
-- Repo do app é privado, então o endpoint do updater não pode ser GitHub
-- Releases (404 sem auth). Hospedamos aqui:
--   storage/v1/object/public/app-releases/latest.json       (overwritten a cada release)
--   storage/v1/object/public/app-releases/vX.Y.Z/...        (arquivos versionados)
--
-- public=true permite GET anônimo. Writes vêm do CI usando service_role key.

INSERT INTO storage.buckets (id, name, public)
VALUES ('app-releases', 'app-releases', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
