import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const clerkConfigured = !!(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

/**
 * Returns a 401 response if Clerk is configured and the request is unauthenticated.
 * When Clerk env vars are not set (local dev / pre-configuration), auth is skipped.
 */
export async function requireAuth(): Promise<NextResponse | null> {
  if (!clerkConfigured) return null
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}
