import { describe, it, expect, vi, beforeAll } from 'vitest'

const mockGenerateContent = vi.fn().mockResolvedValue({
  response: { text: () => 'What is dharma?' },
})

vi.mock('@google/generative-ai', () => {
  class MockModel {
    generateContent = mockGenerateContent
  }
  class MockGoogleGenerativeAI {
    getGenerativeModel() { return new MockModel() }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI }
})

beforeAll(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key')
})

describe('lib/transcribe', () => {
  it('exports transcribeAudio function', async () => {
    const mod = await import('@/lib/transcribe')
    expect(typeof mod.transcribeAudio).toBe('function')
  })

  it('returns transcribed text string from audio blob', async () => {
    const { transcribeAudio } = await import('@/lib/transcribe')
    const fakeBlob = new Blob(['audio-data'], { type: 'audio/webm' })
    const result = await transcribeAudio(fakeBlob)
    expect(typeof result).toBe('string')
    expect(result).toBe('What is dharma?')
  })

  it('sends audio as base64 inlineData to Gemini', async () => {
    const { transcribeAudio } = await import('@/lib/transcribe')
    const fakeBlob = new Blob(['audio-data'], { type: 'audio/webm' })
    await transcribeAudio(fakeBlob)
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ inlineData: expect.objectContaining({ mimeType: 'audio/webm' }) }),
      ])
    )
  })

  it('throws when Gemini returns empty transcription', async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { text: () => '' } })
    const { transcribeAudio } = await import('@/lib/transcribe')
    const fakeBlob = new Blob(['audio-data'], { type: 'audio/webm' })
    await expect(transcribeAudio(fakeBlob)).rejects.toThrow('No transcription returned')
  })

  it('throws on API error so caller can show error message', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API error'))
    const { transcribeAudio } = await import('@/lib/transcribe')
    const fakeBlob = new Blob(['audio-data'], { type: 'audio/webm' })
    await expect(transcribeAudio(fakeBlob)).rejects.toThrow('API error')
  })
})
