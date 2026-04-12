import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriceInputForm } from './price-input-form'

describe('PriceInputForm', () => {
  it('renders all fields', () => {
    render(<PriceInputForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/product name/i)).toBeTruthy()
    expect(screen.getByLabelText(/category/i)).toBeTruthy()
    expect(screen.getByLabelText(/manufacturing cost/i)).toBeTruthy()
    expect(screen.getByLabelText(/shipping cost/i)).toBeTruthy()
    expect(screen.getByLabelText(/additional costs/i)).toBeTruthy()
  })

  it('category dropdown has all 5 options', () => {
    render(<PriceInputForm onSubmit={vi.fn()} />)
    const select = screen.getByLabelText(/category/i) as HTMLSelectElement
    expect(select.options.length).toBe(5)
  })

  it('calls onSubmit with correct CostInputs shape on valid submit', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PriceInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText(/product name/i), 'Test Jacket')
    await user.type(screen.getByLabelText(/manufacturing cost/i), '10')
    await user.type(screen.getByLabelText(/shipping cost/i), '2')
    await user.click(screen.getByRole('button', { name: /calculate/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      productName: 'Test Jacket',
      category: 'clothing',
      manufacturingCost: 10,
      shippingCost: 2,
      additionalCosts: 0,
    })
  })

  it('does not call onSubmit and shows error when product name is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PriceInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText(/manufacturing cost/i), '10')
    await user.type(screen.getByLabelText(/shipping cost/i), '2')
    await user.click(screen.getByRole('button', { name: /calculate/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('does not call onSubmit when manufacturing cost is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PriceInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText(/product name/i), 'Test Product')
    await user.type(screen.getByLabelText(/shipping cost/i), '2')
    await user.click(screen.getByRole('button', { name: /calculate/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('treats empty additional costs as 0', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PriceInputForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText(/product name/i), 'Test')
    await user.type(screen.getByLabelText(/manufacturing cost/i), '10')
    await user.type(screen.getByLabelText(/shipping cost/i), '2')
    await user.click(screen.getByRole('button', { name: /calculate/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ additionalCosts: 0 }),
    )
  })

  it('disables the submit button when disabled prop is true', () => {
    render(<PriceInputForm onSubmit={vi.fn()} disabled={true} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
