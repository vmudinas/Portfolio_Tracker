import type { ReactNode } from 'react'
import { Card } from '../ui'

const FEATURES = [
  'Live prices, including pre-market and after-hours',
  'All funds overview with total value across every fund',
  '1D to inception returns, Sharpe ratio and S&P 500 comparison',
  'Market heat map and top gainers / losers',
]

/** Home page shell: app intro on the left, the sign-in card (children) on the right. */
export function HomeLayout({ children, footnote }: { children: ReactNode; footnote?: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-10">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <section aria-label="About" className="space-y-5">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-11 w-11" />
            <h1 className="text-3xl font-semibold tracking-tight">Portfolio Tracker</h1>
          </div>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Track your stock portfolios, compare funds and see how you’re doing against the market.
          </p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            {[...FEATURES, footnote ?? 'Your data stays in this browser — back it up any time'].map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-teal-700 dark:text-teal-400">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  )
}
