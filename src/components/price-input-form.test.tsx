import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriceInputForm } from './price-input-form'

describe('PriceInputForm', () => {
  it('renders a textarea and a submit button', () => {
    render(<PriceInputForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('does not call onSubmit and shows an error when textarea is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PriceInputForm onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: /get pricing/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('calls onSubmit with the raw message string on valid submit', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PriceInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByRole('textbox'), 'I sell hoodies, cost $6, shipping $2')
    await user.click(screen.getByRole('button', { name: /get pricing/i }))
    expect(onSubmit).toHaveBeenCalledWith('I sell hoodies, cost $6, shipping $2')
  })

  it('disables the submit button when disabled prop is true', () => {
    render(<PriceInputForm onSubmit={vi.fn()} disabled={true} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
