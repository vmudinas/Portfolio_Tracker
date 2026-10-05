import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { checkLogin, readCredentials, saveCredentials } from '../../lib/auth'
import { LoginSettings } from './LoginSettings'

describe('LoginSettings', () => {
  it('is hidden when there is no login', () => {
    const { container } = render(<LoginSettings />)
    expect(container).toBeEmptyDOMElement()
  })

  it('changes the username and PIN only with the current PIN', async () => {
    await saveCredentials('admin', '482913')
    const user = userEvent.setup()
    render(<LoginSettings />)
    await user.click(screen.getByRole('button', { name: 'Change username or PIN' }))
    await user.type(screen.getByLabelText('Current PIN'), '000000')
    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'vitas')
    await user.type(screen.getByLabelText(/^New PIN/), '135790')
    await user.type(screen.getByLabelText('Confirm new PIN'), '135790')
    await user.click(screen.getByRole('button', { name: 'Save login' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Current PIN is wrong')

    await user.clear(screen.getByLabelText('Current PIN'))
    await user.type(screen.getByLabelText('Current PIN'), '482913')
    await user.click(screen.getByRole('button', { name: 'Save login' }))
    expect(await screen.findByText('Login updated.')).toHaveAttribute('role', 'status')
    const c = readCredentials()!
    expect(c.username).toBe('vitas')
    expect(await checkLogin(c, 'vitas', '135790')).toBe(true)
    expect(await checkLogin(c, 'admin', '482913')).toBe(false)
  })
})
