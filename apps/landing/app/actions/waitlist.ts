'use server'

import { supabase } from '@/lib/supabase'

type Result = { ok: true } | { ok: false; duplicate: boolean }

export async function joinWaitlist(email: string, platforms: string[]): Promise<Result> {
  const { error } = await supabase
    .from('waitlist')
    .insert({ email: email.trim().toLowerCase(), platforms })

  if (!error) return { ok: true }

  // código 23505 = unique_violation (email já cadastrado)
  if (error.code === '23505') return { ok: false, duplicate: true }

  console.error('[waitlist]', error)
  return { ok: false, duplicate: false }
}
