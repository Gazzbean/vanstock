// ============================================================
// app/page.tsx
// The homepage. It doesn't show any content itself — it just
// immediately sends the visitor to the login page.
// This is why visiting localhost:3000 (with nothing after it)
// was showing a 404 before this file existed.
// ============================================================

import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/login')
}
