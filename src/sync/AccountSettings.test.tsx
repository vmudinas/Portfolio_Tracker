import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsDialog } from '../components/SettingsDialog'
import { saveCredentials } from '../lib/auth'
import { defaultState } from '../lib/storage'
import { fakeCloud } from '../test/fakeCloud'
import { SyncEngine } from './engine'
import { SyncContext, type SyncSession } from './SyncContext'

const noop = () => {}
const dialog = () => (
  <SettingsDialog
    state={defaultState()}
    onSave={noop}
    onOpenBackup={noop}
    onImportBook={noop}
    theme="system"
    onTheme={noop}
    onClearAll={noop}
    onClose={noop}
  />
)

describe('Settings login section', () => {
  it('shows only the local PIN login in local mode', async () => {
    await saveCredentials('admin', '482913')
    render(dialog())
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('shows only the cloud account in cloud mode, even if an old PIN login is still stored', async () => {
    await saveCredentials('admin', '482913')
    const f = fakeCloud()
    const session: SyncSession = {
      engine: new SyncEngine(f.cloud.store, 'u1', { revision: 1, state: defaultState() }),
      user: { id: 'u1', email: 'me@example.com' },
      auth: f.cloud.auth,
      signOut: async () => {},
    }
    render(<SyncContext.Provider value={session}>{dialog()}</SyncContext.Provider>)
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument()
  })
})
