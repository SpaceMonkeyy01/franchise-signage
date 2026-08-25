'use client';

// The last boundary, and the only one that catches a failure in the root layout.
//
// `error.tsx` renders INSIDE the root layout, so it cannot help when the layout
// itself — or a server render that fails before anything is flushed — is what
// went wrong. Next replaces the whole document in that case, which is why this
// file supplies its own <html> and <body>: there is no layout left to provide
// them.
//
// It says exactly what error.tsx says. Someone whose link just failed does not
// care which boundary caught it, and two different apologies for the same
// experience is how a product starts sounding improvised.

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
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
          background: '#f6f7f9',
          fontFamily: 'ui-sans-serif, system-ui, Helvetica, Arial, sans-serif',
        }}
      >
        <main
          style={{
            maxWidth: 420,
            margin: 16,
            padding: 24,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
            Something went wrong at our end
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: '#4b5563' }}>
            Nothing you were doing has been lost, and your link still works. Try again — if it keeps
            happening, reply to any email from us and a person will pick it up.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 20,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#111827',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ margin: '16px 0 0', fontSize: 10, color: '#d1d5db' }}>ref {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
