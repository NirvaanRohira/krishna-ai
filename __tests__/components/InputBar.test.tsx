import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InputBar } from '@/components/InputBar'

describe('InputBar', () => {
  it('renders a text input and submit button', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('calls onSubmit with the typed message when submitted', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'I feel lost' } })
    fireEvent.click(screen.getByRole('button'))
    expect(onSubmit).toHaveBeenCalledWith('I feel lost')
  })

  it('clears the input after submit', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'some message' } })
    fireEvent.click(screen.getByRole('button'))
    expect(input.value).toBe('')
  })

  it('does not call onSubmit when input is empty', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits on Enter key press', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Enter key test' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('Enter key test')
  })

  it('is disabled while loading', () => {
    render(<InputBar onSubmit={vi.fn()} loading />)
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
  })
})
