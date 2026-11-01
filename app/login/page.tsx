// ============================================================
// app/login/page.tsx
// The sign-in page. Uses Supabase Auth.
// ============================================================

'use client'

import { useState, useTransition } from 'react'
import { signIn } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    // Read the native form values, including browser/password-manager autofill.
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!email || !password) {
      setError('Enter your email address and password.')
      return
    }
    startTransition(async () => {
      try {
        const result = await signIn(email, password)
        if (result?.error) {
          setError(result.error)
        } else {
          router.push('/dashboard')
          router.refresh()
        }
      } catch {
        setError('Sign-in could not be completed. Please try again.')
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl mb-1">🚐</div>
          <h1 className="text-lg font-medium text-gray-900">VanStock</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to your account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="alert alert-danger">{error}</div>
            )}

            <div>
              <label className="form-label">Email address</label>
              <input
                className="form-input"
                type="email"
                name="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                name="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={isPending}
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Contact your manager if you need an account.
        </p>
      </div>
    </div>
  )
}
