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

type View = 'allocation' | 'performance' | 'compare'
const VIEW_KEY = 'portfolio-tracker:chart-view'

interface Props {
  positions: Position[]
  cash: number
  book: Book
  /** Holdings, biggest first. */
  symbols: string[]
  historyProvider: HistoryProvider | null
  quoteProvider: QuoteProvider | null
  onOpenSettings: () => void
}

/** Lazy-loaded chart area: allocation donut, portfolio performance vs S&P 500, and stock comparison. */
export default function ChartsPanel(props: Props) {
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      return v === 'performance' || v === 'compare' ? v : 'allocation'
    } catch {
      return 'allocation'
    }
  })
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
          { id: 'compare', label: 'Compare stocks' },
        ]}
      />
      <div className="pt-4">
        {view === 'allocation' && <AllocationView positions={props.positions} cash={props.cash} profiles={profiles} />}
        {view !== 'allocation' && !props.historyProvider && <NeedsHistoryKey onOpenSettings={props.onOpenSettings} />}
        {view === 'performance' && props.historyProvider && (
          <PerformanceView book={props.book} provider={props.historyProvider} />
        )}
        {view === 'compare' && props.historyProvider && (
          <CompareView symbols={props.symbols} provider={props.historyProvider} />
        )}
      </div>
    </Card>
  )
}
