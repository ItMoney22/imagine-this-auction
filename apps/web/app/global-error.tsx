'use client'

// global-error replaces the root layout, so globals.css is not available here —
// styles must be inline.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg,#faf8ff 0%,#f6f3ff 45%,#fdfcff 100%)',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            padding: '2.5rem',
            borderRadius: '1.5rem',
            border: '1px solid rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.85)',
            boxShadow: '0 24px 60px rgba(79,70,229,0.12)',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a' }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#475569' }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '2rem',
              padding: '0.6rem 1.5rem',
              borderRadius: '0.75rem',
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              fontWeight: 600,
              background: 'linear-gradient(90deg,#6366f1,#a855f7)',
              boxShadow: '0 10px 25px rgba(99,102,241,0.25)',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
