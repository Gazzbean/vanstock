// ============================================================
// lib/supabase.ts   (FIX — replaces your existing file)
//
// WHAT CHANGED FROM LAST TIME:
// The setAll function's "cookiesToSet" parameter didn't have an
// explicit type, which Vercel's stricter build process rejected.
// We now explicitly tell TypeScript exactly what shape this data
// is: an array of objects, each with a name, value, and options.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Browser client ──────────────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Admin client (service role) ─────────────────────────────
export const createServerClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── Session-aware client ─────────────────────────────────────
export async function createSessionClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component context where cookies
          // can't be set — safe to ignore, middleware handles refresh.
        }
      },
    },
  })
}
