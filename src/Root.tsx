import { lazy, Suspense } from 'react'
import { AuthGate } from './components/auth/AuthGate'
import { CloudGate } from './sync/CloudGate'
import { cloudConfigured, SUPABASE_KEY, SUPABASE_URL } from './sync/config'
import { createSupabaseCloud } from './sync/supabase'

// The app (and the portfolio data it reads) only loads after logging in.
const App = lazy(() => import('./App.tsx'))
const loadCloud = () => createSupabaseCloud(SUPABASE_URL, SUPABASE_KEY)

export function Root() {
  // With a Supabase project configured: email + password account, data synced to the cloud.
  if (cloudConfigured)
    return (
      <CloudGate loadCloud={loadCloud}>
        {(signOut) => (
          <Suspense fallback={null}>
            <App onLock={signOut} />
          </Suspense>
        )}
      </CloudGate>
    )
  // Otherwise: local-only data behind the username + PIN lock.
  return (
    <AuthGate>
      {(lock) => (
        <Suspense fallback={null}>
          <App onLock={lock} />
        </Suspense>
      )}
    </AuthGate>
  )
}
