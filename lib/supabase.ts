// ============================================================
// lib/supabase.ts   (REPLACES your existing file)
//
// WHY THIS CHANGED:
// Supabase needs to know WHO is logged in on every request.
// It remembers this using browser cookies. The original version
// of this file only had one client using the "service_role" key
// (an admin key with no concept of "current user"), so after
// signing in, the next action had no way to know you were logged in.
//
// This version adds a THIRD client — one that reads/writes the
// session cookie — so login state actually persists between page loads.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Browser client ──────────────────────────────────────────
// Used only if we ever call Supabase directly from client components.
// Not used much in this app since we go through Server Actions.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Admin client (service role) ─────────────────────────────
// Full access, bypasses RLS. Used for operations that need to
// read/write across the whole company (e.g. admin actions).
// Has NO concept of "who is logged in" — never use this to check auth.
export const createServerClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── Session-aware client (the important fix) ────────────────
// This client reads the login session from cookies, so it knows
// exactly which user is making the request. Use this whenever you
// need to know "who is currently logged in".
export async function createSessionClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
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
