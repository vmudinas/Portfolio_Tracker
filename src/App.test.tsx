import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { defaultState, saveState } from './lib/storage'
import type { QuoteProvider } from './providers/QuoteProvider'

const prices: Record<string, number> = { AAPL: 200, MSFT: 300 }
const fakeProvider: QuoteProvider = {
  name: 'fake',
  getQuote: async (s) =>
    prices[s]
      ? { symbol: s, price: prices[s], change: 2, changePct: 1, prevClose: prices[s] - 2, updatedAt: '' }
      : null,
  search: async () => [],
}
const factory = () => fakeProvider

function withKey() {
  const s = defaultState()
  s.settings.finnhubApiKey = 'test'
  saveState(s)
}

async function addLot(user: ReturnType<typeof userEvent.setup>, symbol: string, shares: string, price: string) {
  await user.click(screen.getAllByRole('button', { name: /add (your first )?stock/i })[0])
  const dialog = screen.getByRole('dialog', { name: 'Add a purchase' })
  await user.type(within(dialog).getByLabelText('Symbol'), symbol)
  await user.type(within(dialog).getByLabelText('Shares'), shares)
  await user.type(within(dialog).getByLabelText(/price paid/i), price)
  await user.click(within(dialog).getByRole('button', { name: 'Add purchase' }))
  // let the (fake) price fetch settle so React state updates happen inside the test
  await screen.findByText(/prices updated|last regular-session prices/i)
}

describe('App', () => {
  it('renders the title and asks for an API key', () => {
    render(<App providerFactory={factory} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Portfolio Tracker' })).toBeInTheDocument()
    expect(screen.getByText(/add your free finnhub api key/i)).toBeInTheDocument()
  })

  it('adds a stock and shows gain/loss', async () => {
    withKey()
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await addLot(user, 'aapl', '10', '150')

    const table = screen.getByRole('table')
    expect(within(table).getByText('AAPL')).toBeInTheDocument()
    await waitFor(() => expect(within(table).getAllByText('+$500.00').length).toBeGreaterThan(0))
    expect(within(table).getByText('+33.33%')).toBeInTheDocument()
    expect(screen.getByLabelText('Portfolio summary')).toHaveTextContent('$2,000.00')
  })

  it('validates the form', async () => {
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await user.click(screen.getByRole('button', { name: /add your first stock/i }))
    await user.click(screen.getByRole('button', { name: 'Add purchase' }))
    expect(screen.getByText('Enter a ticker like AAPL')).toBeInTheDocument()
    expect(screen.getByText('Shares must be more than 0')).toBeInTheDocument()
  })

  it('keeps each profile separate', async () => {
    withKey()
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await addLot(user, 'MSFT', '1', '250')
    expect(screen.getByRole('table')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Profile'), '__new')
    await user.type(screen.getByLabelText('Profile name'), 'Retirement')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText(/no stocks in this portfolio yet/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Profile'), 'My portfolio')
    expect(within(screen.getByRole('table')).getByText('MSFT')).toBeInTheDocument()
  })

  it('persists data across reloads', async () => {
    withKey()
    const user = userEvent.setup()
    const { unmount } = render(<App providerFactory={factory} />)
    await addLot(user, 'AAPL', '1', '100')
    unmount()
    render(<App providerFactory={factory} />)
    expect(within(screen.getByRole('table')).getByText('AAPL')).toBeInTheDocument()
    await screen.findByText(/prices updated/i)
  })

  it('shows after-hours moves from the trade stream', async () => {
    withKey()
    const user = userEvent.setup()
    const afterHours: QuoteProvider = {
      ...fakeProvider,
      getQuote: async (sym) => ({ ...(await fakeProvider.getQuote(sym))!, updatedAt: '2026-10-02T20:00:00Z' }),
      getMarketStatus: async () => ({ session: 'post', holiday: null }),
      streamTrades: (symbols, onTrade) => {
        const t = setTimeout(
          () => symbols.forEach((s) => onTrade({ symbol: s, price: prices[s] * 1.1, time: Date.now() })),
          10,
        )
        return () => clearTimeout(t)
      },
    }
    render(<App providerFactory={() => afterHours} />)
    await addLot(user, 'AAPL', '10', '150')
    await waitFor(() => expect(screen.getByLabelText('Portfolio summary')).toHaveTextContent('After hours +$200.00'), {
      timeout: 3000,
    })
    expect(within(screen.getByRole('table')).getByText('+10.00%')).toBeInTheDocument()
    expect(screen.getAllByText('After hours').length).toBeGreaterThan(0) // market badge
  })

  it('shows the optional charts', async () => {
    withKey()
    const user = userEvent.setup()
    const history = {
      name: 'fake',
      getHistory: async () => {
        const d = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
        return [
          { date: d(20), close: 100 },
          { date: d(1), close: 125 },
        ]
      },
    }
    const { unmount } = render(<App providerFactory={factory} />)
    await addLot(user, 'AAPL', '1', '100')
    await user.click(screen.getByRole('button', { name: /charts/i }))
    // the chart module is lazy-loaded, so allow time for the import
    await user.click(await screen.findByRole('tab', { name: 'Compare stocks' }, { timeout: 5000 }))
    expect(await screen.findByRole('button', { name: 'Add Twelve Data key' }, { timeout: 5000 })).toBeInTheDocument()
    unmount()

    const s = JSON.parse(localStorage.getItem('portfolio-tracker:v1')!)
    s.settings.twelveDataApiKey = 'td'
    localStorage.setItem('portfolio-tracker:v1', JSON.stringify(s))
    render(<App providerFactory={factory} historyFactory={() => history} />)
    // the chart view choice is remembered
    const picker = await screen.findByRole('group', { name: 'Stocks to chart' }, { timeout: 5000 })
    await waitFor(() => expect(within(picker).getByRole('button', { name: /AAPL/ })).toHaveTextContent('+25.00%'))
    await screen.findByText(/prices updated/i)
  })

  it('records a sale with realized gain, dividends and cash', async () => {
    withKey()
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await addLot(user, 'AAPL', '10', '150')

    await user.click(screen.getByRole('button', { name: '+ Add transaction' }))
    let dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Sell' }))
    await user.type(within(dialog).getByLabelText('Symbol'), 'AAPL')
    await user.type(within(dialog).getByLabelText(/^Shares/), '20')
    await user.type(within(dialog).getByLabelText(/sale price/i), '180')
    await user.click(within(dialog).getByRole('button', { name: 'Record sale' }))
    expect(within(dialog).getByText('You held 10 shares on that date')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/^Shares/))
    await user.type(within(dialog).getByLabelText(/^Shares/), '4')
    await user.click(within(dialog).getByRole('button', { name: 'Record sale' }))

    await user.click(screen.getByRole('button', { name: '+ Add transaction' }))
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Dividend' }))
    await user.type(within(dialog).getByLabelText('Symbol'), 'AAPL')
    await user.type(within(dialog).getByLabelText(/amount received/i), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Record dividend' }))

    await user.click(screen.getByRole('button', { name: /cash \$0\.00, edit/i }))
    await user.type(screen.getByLabelText(/uninvested cash/i), '800')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    const summary = screen.getByLabelText('Portfolio summary')
    // 6 shares × $200 + $800 cash
    expect(summary).toHaveTextContent('$2,000.00')
    // realized (180−150)×4 = 120; dividends 5; unrealized (200−150)×6 = 300
    expect(summary).toHaveTextContent('Realized +$120.00')
    expect(summary).toHaveTextContent('Dividends +$5.00')
    expect(summary).toHaveTextContent('+$425.00')

    await user.click(screen.getByRole('tab', { name: 'Activity' }))
    const list = screen.getByRole('list', { name: 'Transactions' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('Realized +$120.00')).toBeInTheDocument()
  })

  it('watchlist alerts fire when the price crosses the target', async () => {
    withKey()
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await addLot(user, 'AAPL', '1', '100')
    await user.click(screen.getByRole('tab', { name: /watchlist/i }))
    await user.type(screen.getByLabelText('Symbol to watch'), 'msft')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const table = screen.getByRole('table')
    expect(within(table).getByText('MSFT')).toBeInTheDocument()
    await waitFor(() => expect(within(table).getByText('$300.00')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Alert symbol'), 'MSFT')
    await user.type(screen.getByLabelText('Target price'), '250')
    await user.click(screen.getByRole('button', { name: 'Add alert' }))
    // MSFT is $300, already above $250
    expect(await screen.findByText(/MSFT rises above \$250\.00/, { selector: 'strong' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Alerts' })).getByRole('button', { name: 'Re-arm' }),
    ).toBeInTheDocument()
  })

  it('switches between light, dark and black themes', async () => {
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await user.click(screen.getByRole('radio', { name: 'Black' }))
    expect(document.documentElement).toHaveClass('dark', 'black')
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('portfolio-tracker:theme')).toBe('light')
  })

  it('backs up and restores everything after browser data is cleared', async () => {
    withKey()
    const user = userEvent.setup()
    let saved = ''
    const createObjectURL = vi.fn((b: Blob) => {
      void b.text().then((t) => (saved = t))
      return 'blob:backup'
    })
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { unmount } = render(<App providerFactory={factory} />)
    await addLot(user, 'AAPL', '10', '150')
    // reminder appears once there is data and no backup
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Backup and restore' }))
    await user.click(screen.getByRole('button', { name: /download backup/i }))
    await waitFor(() => expect(saved).toContain('"AAPL"'))
    expect(click).toHaveBeenCalled()
    expect(saved).not.toContain('"finnhubApiKey"')
    unmount()

    // Simulate the browser clearing site data.
    localStorage.clear()
    render(<App providerFactory={factory} />)
    expect(screen.getByText(/no stocks in this portfolio yet/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /restore from a backup file/i }))
    const file = new File([saved], 'portfolio-tracker-backup.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Backup file'), file)
    const contents = await screen.findByLabelText('Backup contents')
    expect(contents).toHaveTextContent('1 transactions')
    await user.click(within(contents).getByRole('button', { name: 'Restore this backup' }))
    expect(screen.getByRole('status')).toHaveTextContent('Restored 1 profile(s) and 1 transactions.')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(within(screen.getByRole('table')).getByText('AAPL')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back up now' })).not.toBeInTheDocument()
    click.mockRestore()
  })

  it('rejects a file that is not a backup', async () => {
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await user.click(screen.getByRole('button', { name: 'Backup and restore' }))
    await user.upload(screen.getByLabelText('Backup file'), new File(['hello'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn’t a Portfolio Tracker backup/)
  })

  it('totals selected holdings and shows returns with Sharpe', async () => {
    withKey()
    const s = JSON.parse(localStorage.getItem('portfolio-tracker:v1')!)
    s.settings.twelveDataApiKey = 'td'
    s.profiles[0].lots = [
      { id: 'a', symbol: 'AAPL', shares: 10, buyPrice: 100, buyDate: '2023-01-15' },
      { id: 'm', symbol: 'MSFT', shares: 2, buyPrice: 250, buyDate: '2023-01-15' },
      { id: 'k', symbol: 'KO', shares: 5, buyPrice: 60, buyDate: '2023-01-15' },
    ]
    localStorage.setItem('portfolio-tracker:v1', JSON.stringify(s))
    // ~4 years of month-end closes rising 1–2% a month
    const monthlyHistory = {
      name: 'fake',
      getHistory: async (symbol: string, interval: string) => {
        if (interval !== '1month') return []
        const out = []
        const now = new Date()
        for (let i = 48; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          out.push({
            date: d.toISOString().slice(0, 10),
            close: (symbol === 'SPY' ? 400 : 80) * Math.pow(1.01 + (i % 2) * 0.01, 48 - i),
          })
        }
        return out
      },
    }
    const user = userEvent.setup()
    render(<App providerFactory={factory} historyFactory={() => monthlyHistory} />)
    await screen.findByText(/prices updated/i)

    await user.click(screen.getAllByRole('checkbox', { name: 'Select AAPL' })[0])
    await user.click(screen.getAllByRole('checkbox', { name: 'Select MSFT' })[0])
    const bar = screen.getByLabelText('Selected holdings total')
    // AAPL 10 × $200 + MSFT 2 × $300 = $2,600; cost $1,000 + $500
    expect(bar).toHaveTextContent('$2,600.00')
    expect(bar).toHaveTextContent('$1,500.00')
    expect(bar).toHaveTextContent('+$1,100.00')

    await user.click(within(bar).getByRole('button', { name: /returns & sharpe/i }))
    const stats = await screen.findByLabelText('Return statistics', {}, { timeout: 5000 })
    await waitFor(() => expect(within(stats).getByText('Whole portfolio')).toBeInTheDocument())
    expect(within(stats).getByText('Selected (2)')).toBeInTheDocument()
    expect(within(stats).getByText('S&P 500 (SPY)')).toBeInTheDocument()
    const spyRow = within(stats).getByText('S&P 500 (SPY)').closest('tr')!
    const headers = within(stats)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers.slice(1)).toEqual(['1D', '2W', 'YTD', '1Y', '2Y', '3Y', 'ITD', 'ITD / yr', 'Sharpe 1Y', 'Sharpe 3Y'])
    // 48 months of history ⇒ 2Y/3Y returns and both Sharpe ratios are available; 1D comes from the live SPY quote
    const cells = within(spyRow)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(cells.slice(5).every((c) => c !== '—')).toBe(true)
    expect(screen.getByLabelText('Monthly returns')).toHaveTextContent('Monthly returns — Whole portfolio')

    await user.click(within(stats).getByRole('button', { name: 'AAPL' }))
    expect(screen.getByLabelText('Monthly returns')).toHaveTextContent('Monthly returns — AAPL')
  })

  it('compares portfolios side by side with a combined total', async () => {
    withKey()
    const st = JSON.parse(localStorage.getItem('portfolio-tracker:v1')!)
    st.profiles[0].name = 'Growth'
    st.profiles[0].lots = [{ id: 'a', symbol: 'AAPL', shares: 10, buyPrice: 150, buyDate: '2024-01-02' }]
    st.profiles.push({
      id: 'p2',
      name: 'Income',
      createdAt: '2024-01-01',
      lots: [{ id: 'm', symbol: 'MSFT', shares: 2, buyPrice: 250, buyDate: '2024-01-02' }],
      sales: [],
      dividends: [{ id: 'd', symbol: 'MSFT', amount: 10, date: '2024-06-01' }],
      cash: 100,
      watchlist: [],
      alerts: [],
    })
    localStorage.setItem('portfolio-tracker:v1', JSON.stringify(st))
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    await user.click(screen.getByRole('tab', { name: 'All funds (2)' }))
    const table = await screen.findByRole('table', { name: 'Portfolio totals' }, { timeout: 5000 })
    // Growth: 10 × $200 = $2,000. Income: 2 × $300 + $100 cash = $700 (MSFT priced once the tab loads its quote).
    await waitFor(() => expect(within(table).getByText('$700.00')).toBeInTheDocument())
    expect(
      within(table)
        .getByRole('button', { name: /Growth/ })
        .closest('tr')!,
    ).toHaveTextContent('$2,000.00')
    const combinedRow = within(table).getByText('Combined (2)').closest('tr')!
    expect(combinedRow).toHaveTextContent('$2,700.00')
    // The summary cards switch to the total across every fund (AUM).
    const cards = screen.getByRole('region', { name: 'All funds summary' })
    expect(cards).toHaveTextContent('$2,700.00')
    expect(cards).toHaveTextContent('Cash $100.00')
    expect(screen.getByRole('heading', { name: 'All funds (2)' })).toBeInTheDocument()
    await user.click(within(table).getByRole('checkbox', { name: 'Include Income' }))
    expect(within(table).getByText('Combined (1)').closest('tr')!).toHaveTextContent('$2,000.00')
    await user.click(within(table).getByRole('button', { name: /Income/ }))
    expect(screen.getByRole('tab', { name: /Holdings/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Portfolio summary' })).toHaveTextContent('$700.00')
    // The profile menu opens the overview too.
    await user.selectOptions(screen.getByLabelText('Profile'), 'All funds (2)')
    expect(screen.getByRole('tab', { name: 'All funds (2)' })).toHaveAttribute('aria-selected', 'true')
    await user.selectOptions(screen.getByLabelText('Profile'), 'Growth')
    expect(screen.getByRole('region', { name: 'Portfolio summary' })).toHaveTextContent('$2,000.00')
  })

  it('shows the all-funds total for funds that hold only cash', async () => {
    withKey()
    const st = JSON.parse(localStorage.getItem('portfolio-tracker:v1')!)
    st.profiles[0].name = 'Roth I'
    st.profiles[0].cash = 1500
    st.profiles.push({ ...st.profiles[0], id: 'p2', name: 'Roth V', cash: 500 })
    localStorage.setItem('portfolio-tracker:v1', JSON.stringify(st))
    const user = userEvent.setup()
    render(<App providerFactory={factory} />)
    // A cash-only fund still shows its summary, so the cash can be seen and edited.
    expect(screen.getByRole('region', { name: 'Portfolio summary' })).toHaveTextContent('$1,500.00')
    await user.click(screen.getByRole('tab', { name: 'All funds (2)' }))
    expect(screen.getByRole('region', { name: 'All funds summary' })).toHaveTextContent('$2,000.00')
  })

  it('shows the market heat map and top 20 gainers/losers among large caps', async () => {
    withKey()
    // every symbol gets a price; % change depends on the ticker so ordering is deterministic
    const market: QuoteProvider = {
      name: 'market',
      getQuote: async (sym) => {
        const pct = ((sym.charCodeAt(0) * 7 + sym.length * 13) % 21) - 10
        return { symbol: sym, price: 100, change: pct, changePct: pct, prevClose: 100 - pct, updatedAt: '' }
      },
      search: async () => [],
    }
    const user = userEvent.setup()
    render(<App providerFactory={() => market} />)
    await user.click(screen.getByRole('tab', { name: 'Heat map' }))
    const map = screen.getByRole('img', { name: 'Market heat map' })
    expect(map).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/S&P 500/)).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: 'Top movers' }))
    const gainers = await screen.findByRole('table', { name: 'Top 20 gainers' })
    await waitFor(() => expect(within(gainers).getAllByRole('row').length).toBeGreaterThan(5), { timeout: 8000 })
    const pcts = within(gainers)
      .getAllByRole('row')
      .slice(1)
      .map((r) => Number(r.querySelectorAll('td')[3].textContent!.replace('%', '').replace('−', '-').replace('+', '')))
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts)
    await user.click(screen.getByRole('button', { name: 'Whole US market' }))
    expect(screen.getByRole('button', { name: 'Add Alpha Vantage key' })).toBeInTheDocument()
  }, 15000)
})
