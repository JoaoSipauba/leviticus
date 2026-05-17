import { createClient, SupabaseClient } from './deps.ts'

export type AuthContext = {
  userId: string
  orgId: string
  serviceClient: SupabaseClient    // bypassa RLS
  userClient: SupabaseClient       // respeita RLS do usuário
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`)
    this.name = 'ForbiddenError'
  }
}

export async function authenticate(req: Request, orgId: string): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header')
  }
  const jwt = authHeader.substring('Bearer '.length)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) throw new UnauthorizedError('Invalid JWT')

  const serviceClient = createClient(supabaseUrl, serviceKey)

  // Verificar que o user é membro da org
  const { count, error: memberErr } = await serviceClient
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id)
    .eq('org_id', orgId)

  if (memberErr) throw new Error(`Membership check failed: ${memberErr.message}`)
  if ((count ?? 0) === 0) {
    throw new UnauthorizedError('Not a member of this org')
  }

  return {
    userId: userData.user.id,
    orgId,
    serviceClient,
    userClient,
  }
}

export async function requirePermission(ctx: AuthContext, perm: string): Promise<void> {
  // Owners têm tudo
  const { data: orgRow } = await ctx.serviceClient
    .from('organizations')
    .select('owner_id')
    .eq('id', ctx.orgId)
    .single()
  if (orgRow?.owner_id === ctx.userId) return

  const { count } = await ctx.serviceClient
    .from('user_role_assignments')
    .select('id, role_permissions!inner(permission)', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('org_id', ctx.orgId)
    .eq('role_permissions.permission', perm)

  if ((count ?? 0) === 0) throw new ForbiddenError(perm)
}
