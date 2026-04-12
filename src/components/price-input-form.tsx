import { useState } from 'react'
import type { FormEvent } from 'react'
import './price-input-form.css'

interface Props {
  onSubmit: (message: string) => void
  disabled?: boolean
}

export function PriceInputForm({ onSubmit, disabled = false }: Props) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      setError('Please describe your product and its costs')
      return
    }
    setError('')
    onSubmit(message.trim())
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="form-section-title">Product Details</h2>

      <div className="form-field">
        <label className="form-label" htmlFor="message">
          Describe your product
        </label>
        <textarea
          className="form-textarea"
          id="message"
          rows={3}
          placeholder="e.g. I sell hoodies, manufacturing cost $6, shipping $2"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && (
          <span className="form-error" role="alert">
            {error}
          </span>
        )}
      </div>

      <button className="form-submit" type="submit" disabled={disabled}>
        {disabled ? 'Analyzing...' : 'Get Pricing'}
      </button>
    </form>
  )
}
