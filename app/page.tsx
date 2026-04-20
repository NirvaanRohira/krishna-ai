import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-light tracking-wide">Krishna AI</h1>
        <p className="text-neutral-500 text-sm max-w-sm">
          A voice that draws on the Bhagavad Gita and the Upanishads to offer
          perspective on your life.
        </p>
      </div>

      <Link
        href="/chat"
        className="px-6 py-3 bg-neutral-900 text-white text-sm rounded-full hover:bg-neutral-700 transition-colors"
      >
        Begin
      </Link>

      <p className="text-xs text-neutral-400 text-center max-w-xs">
        This is an AI drawing from Sanskrit texts. It is not a spiritual
        authority.
      </p>
    </main>
  )
}
