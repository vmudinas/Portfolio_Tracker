import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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

  it('shows the optional trends chart', async () => {
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
    await user.click(screen.getByRole('button', { name: /chart/i }))
    // the chart module is lazy-loaded, so allow time for the import
    expect(await screen.findByRole('button', { name: 'Add Twelve Data key' }, { timeout: 5000 })).toBeInTheDocument()
    unmount()

    const s = JSON.parse(localStorage.getItem('portfolio-tracker:v1')!)
    s.settings.twelveDataApiKey = 'td'
    localStorage.setItem('portfolio-tracker:v1', JSON.stringify(s))
    render(<App providerFactory={factory} historyFactory={() => history} />)
    const picker = await screen.findByRole('group', { name: 'Stocks to chart' }, { timeout: 5000 })
    await waitFor(() => expect(within(picker).getByRole('button', { name: /AAPL/ })).toHaveTextContent('+25.00%'))
    await screen.findByText(/prices updated/i)
  })
})
