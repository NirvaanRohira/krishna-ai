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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return // let textarea insert newline naturally
    e.preventDefault()
    submit()
  }

  return (
    <div className="input-bar">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask your question…"
        disabled={loading}
        className="input-bar__textarea"
      />
      <button onClick={submit} disabled={loading}>
        Send
      </button>
    </div>
  )
}
