import { useState } from 'react'
import { useProfiles } from '../../hooks/useProfiles'
import type { HistoryProvider } from '../../providers/HistoryProvider'
import type { QuoteProvider } from '../../providers/QuoteProvider'
import type { Book, Position } from '../../types'
import { Card, Tabs } from '../ui'
import AllocationView from './AllocationView'
import { NeedsHistoryKey } from './common'
import CompareView from './CompareView'
import PerformanceView from './PerformanceView'
import ReturnsView from './ReturnsView'

export type ChartView = 'allocation' | 'performance' | 'returns' | 'compare'
type View = ChartView
const VIEW_KEY = 'portfolio-tracker:chart-view'

interface Props {
  positions: Position[]
  cash: number
  book: Book
  /** Holdings, biggest first. */
  symbols: string[]
  historyProvider: HistoryProvider | null
  quoteProvider: QuoteProvider | null
  /** Holdings ticked in the table. */
  selected: string[]
  latestPrices: Record<string, number | undefined>
  riskFree: number
  /** Ask the panel to switch view (and preselect stocks for Compare). `id` changes per request. */
  request?: { id: number; view: View; symbols?: string[] }
  onOpenSettings: () => void
}

/** Lazy-loaded chart area: allocation donut, portfolio performance vs S&P 500, and stock comparison. */
export default function ChartsPanel(props: Props) {
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      return v === 'performance' || v === 'compare' || v === 'returns' ? v : 'allocation'
    } catch {
      return 'allocation'
    }
  })
  // Handle a new request from outside (e.g. "Compare selected") during render — no effect needed.
  const [handled, setHandled] = useState<number | null>(null)
  if (props.request && props.request.id !== handled) {
    setHandled(props.request.id)
    setView(props.request.view)
  }
  const profiles = useProfiles(view === 'allocation' ? props.symbols : [], props.quoteProvider)

  const choose = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <Tabs
        label="Charts"
        value={view}
        onChange={choose}
        tabs={[
          { id: 'allocation', label: 'Allocation' },
          { id: 'performance', label: 'Performance' },
          { id: 'returns', label: 'Returns & Sharpe' },
          { id: 'compare', label: 'Compare stocks' },
        ]}
      />
      <div className="pt-4">
        {view === 'allocation' && <AllocationView positions={props.positions} cash={props.cash} profiles={profiles} />}
        {view !== 'allocation' && !props.historyProvider && <NeedsHistoryKey onOpenSettings={props.onOpenSettings} />}
        {view === 'performance' && props.historyProvider && (
          <PerformanceView book={props.book} provider={props.historyProvider} />
        )}
        {view === 'returns' && props.historyProvider && (
          <ReturnsView
            book={props.book}
            held={props.symbols}
            selected={props.selected}
            latestPrices={props.latestPrices}
            riskFree={props.riskFree}
            provider={props.historyProvider}
          />
        )}
        {view === 'compare' && props.historyProvider && (
          <CompareView
            key={props.request?.symbols ? props.request.id : 'compare'}
            symbols={props.symbols}
            provider={props.historyProvider}
            preselect={props.request?.view === 'compare' ? props.request.symbols : undefined}
          />
        )}
      </div>
    </Card>
  )
}
