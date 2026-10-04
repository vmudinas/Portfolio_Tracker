import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { money } from '../../lib/format'
import type { CompanyProfile } from '../../providers/QuoteProvider'
import type { Position } from '../../types'
import { Segmented } from '../ui'
import { ChartMessage, Swatch, TooltipBox } from './common'
import { seriesColor } from './chartUtils'

const MAX_NAMED = 7

interface Slice {
  name: string
  value: number
  color: string
}

interface Props {
  positions: Position[]
  cash: number
  profiles: Record<string, CompanyProfile | null | undefined>
}

export default function AllocationView({ positions, cash, profiles }: Props) {
  const [by, setBy] = useState<'stock' | 'industry'>('stock')

  const slices = useMemo<Slice[]>(() => {
    const groups = new Map<string, number>()
    for (const p of positions) {
      if (!p.marketValue) continue
      const key =
        by === 'stock'
          ? p.symbol
          : profiles[p.symbol] === undefined
            ? 'Not classified yet'
            : (profiles[p.symbol]?.industry ?? 'Funds & ETFs')
      groups.set(key, (groups.get(key) ?? 0) + p.marketValue)
    }
    const ranked = [...groups.entries()].sort((a, b) => b[1] - a[1])
    const named = ranked.slice(0, MAX_NAMED)
    const other = ranked.slice(MAX_NAMED).reduce((s, [, v]) => s + v, 0)
    // Colour follows the name (alphabetical slot), not the size rank, so re-sorting doesn't repaint.
    const alpha = [...named].map(([n]) => n).sort()
    const out: Slice[] = named.map(([name, value]) => ({ name, value, color: seriesColor(alpha.indexOf(name)) }))
    if (other > 0)
      out.push({ name: `Other (${ranked.length - MAX_NAMED})`, value: other, color: 'var(--chart-neutral)' })
    if (cash > 0) out.push({ name: 'Cash', value: cash, color: 'var(--chart-neutral-2)' })
    return out
  }, [positions, cash, profiles, by])

  const total = slices.reduce((s, x) => s + x.value, 0)

  return (
    <div>
      <div className="flex justify-end">
        <Segmented
          label="Group allocation by"
          value={by}
          onChange={setBy}
          options={[
            { id: 'stock', label: 'By stock' },
            { id: 'industry', label: 'By industry' },
          ]}
        />
      </div>
      {total <= 0 ? (
        <div className="h-56">
          <ChartMessage>Allocation appears once prices load.</ChartMessage>
        </div>
      ) : (
        <div className="mt-2 grid items-center gap-4 sm:grid-cols-2">
          <div className="relative h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    const s = active && payload?.[0] ? (payload[0].payload as Slice) : null
                    if (!s) return null
                    return (
                      <TooltipBox
                        title={s.name}
                        items={[
                          {
                            key: 'v',
                            label: `${((s.value / total) * 100).toFixed(1)}%`,
                            color: s.color,
                            value: money(s.value),
                          },
                        ]}
                      />
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="font-semibold tabular-nums">{money(total)}</p>
              </div>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm" aria-label="Allocation">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <Swatch color={s.color} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-slate-500 tabular-nums">{money(s.value)}</span>
                <span className="w-14 text-right font-medium tabular-nums">
                  {((s.value / total) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {by === 'industry' && (
        <p className="mt-2 text-xs text-slate-500">
          Industries from Finnhub company profiles; funds and ETFs are grouped together.
        </p>
      )}
    </div>
  )
}
