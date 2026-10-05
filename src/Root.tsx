import { lazy, Suspense } from 'react'
import { AuthGate } from './components/auth/AuthGate'

// The app (and the portfolio data it reads) only loads after logging in.
const App = lazy(() => import('./App.tsx'))

export function Root() {
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
