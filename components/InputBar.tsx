'use client'
import { useState } from 'react'

interface InputBarProps {
  onSubmit: (message: string) => void
  loading?: boolean
}

export function InputBar({ onSubmit, loading = false }: InputBarProps) {
  const [value, setValue] = useState('')

  function submit() {
    if (!value.trim()) return
    onSubmit(value.trim())
    setValue('')
  }

  return (
    <div className="input-bar">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="Ask your question..."
        disabled={loading}
      />
      <button onClick={submit} disabled={loading}>
        Send
      </button>
    </div>
  )
}
