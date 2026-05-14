CREATE OR REPLACE VIEW user_profiles
WITH (security_invoker = true) AS
SELECT
  u.id as user_id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ) as full_name,
  u.email
FROM auth.users u;

GRANT SELECT ON user_profiles TO authenticated;
