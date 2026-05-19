// Imports centralizados — facilita troca de versão e import maps no Deno
export { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
export { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
export type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
