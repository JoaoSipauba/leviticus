-- Verifica se o usuário autenticado é membro da org
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
  )
$$;

-- Verifica se o usuário autenticado é dono da org
CREATE OR REPLACE FUNCTION is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = p_org_id AND owner_id = auth.uid()
  )
$$;

-- Verifica se o usuário tem uma permissão na org
-- Se p_group_id for NULL, aceita tanto permissões globais quanto de grupo
-- Se p_group_id for fornecido, aceita permissões globais OU permissões do grupo específico
CREATE OR REPLACE FUNCTION has_permission(
  p_org_id uuid,
  p_permission text,
  p_group_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN role_permissions rp ON rp.role_id = ura.role_id
    WHERE ura.user_id = auth.uid()
      AND ura.org_id = p_org_id
      AND rp.permission = p_permission
      AND (
        ura.group_id IS NULL
        OR (p_group_id IS NOT NULL AND ura.group_id = p_group_id)
      )
  )
  OR is_org_owner(p_org_id)
$$;
