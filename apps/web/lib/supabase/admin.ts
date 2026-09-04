import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/types/database'

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin credentials are not configured')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Call a Postgres function through the service-role client.
 *
 * The hand-maintained `Database` type in lib/types/database.ts does not satisfy
 * supabase-js's `GenericSchema` constraint, so `client.rpc(name, args)` resolves
 * its args parameter to `undefined` and rejects every call — including
 * long-standing ones like `get_wallet_balance`. Until the types are regenerated
 * from the live schema, this helper keeps the cast in one place instead of
 * scattering `as any` through the AI credit code.
 */
export async function adminRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: T | null; error: { message: string } | null }> {
  const client = createAdminClient() as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: T | null; error: { message: string } | null }>
  }

  return client.rpc(fn, args)
}
