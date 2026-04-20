export default function UnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-semibold mb-3">Temporarily unavailable</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          This service is temporarily offline for maintenance. Please check back shortly.
        </p>
      </div>
    </main>
  )
}
