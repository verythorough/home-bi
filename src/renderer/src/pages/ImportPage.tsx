import { useState, useRef, DragEvent } from 'react'

interface ImportStats {
  accounts: number
  transactions: number
  splits: number
  investments: number
}

function ImportPage(): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const pendingFilePath = useRef<string | undefined>(undefined)

  async function runImport(filePath?: string): Promise<void> {
    setStatus('importing')
    setMessage('')
    setStats(null)
    setShowConfirm(false)

    const result = await window.api.importQifFile(filePath)

    if (!result.success) {
      if (result.reason === 'cancelled') {
        setStatus('idle')
        return
      }
      setStatus('error')
      setMessage(result.reason ?? 'Unknown error')
    } else {
      setStatus('success')
      setMessage(result.filePath ?? '')
      setStats(result.stats ?? null)
    }
  }

  function handleImportClick(): void {
    if (status === 'success') {
      pendingFilePath.current = undefined
      setShowConfirm(true)
    } else {
      runImport()
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    // Electron exposes the native file path on File objects
    const filePath = (file as File & { path?: string }).path
    if (!filePath) return
    if (status === 'success') {
      pendingFilePath.current = filePath
      setShowConfirm(true)
    } else {
      runImport(filePath)
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(): void {
    setIsDragOver(false)
  }

  function confirmReimport(): void {
    runImport(pendingFilePath.current)
  }

  return (
    <div>
      <h1 className="page-title">Import QIF File</h1>
      <p className="page-description">
        Select a QIF file exported from Quicken. Each import replaces all existing financial data.
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          marginTop: 32,
          border: `2px dashed ${isDragOver ? '#e94560' : '#2a2a4a'}`,
          borderRadius: 10,
          padding: '40px 32px',
          textAlign: 'center',
          background: isDragOver ? 'rgba(233,69,96,0.08)' : 'transparent',
          transition: 'border-color 0.15s, background 0.15s',
          maxWidth: 480,
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
        <div style={{ color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
          Drag & drop a QIF file here, or
        </div>
        <button
          onClick={handleImportClick}
          disabled={status === 'importing'}
          style={{
            padding: '10px 24px',
            background: status === 'importing' ? '#444' : '#e94560',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: status === 'importing' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'importing'
            ? 'Importing…'
            : status === 'success'
              ? 'Re-import File…'
              : 'Choose QIF File…'}
        </button>
      </div>

      {status === 'error' && (
        <div style={{ marginTop: 20, color: '#ff6b6b', maxWidth: 480 }}>
          Error: {message}
        </div>
      )}

      {status === 'success' && stats && (
        <div style={{ marginTop: 24, maxWidth: 480 }}>
          <div style={{ color: '#6bffb8', marginBottom: 12, wordBreak: 'break-all' }}>
            ✓ Imported from {message}
          </div>
          <div
            style={{
              background: 'var(--sidebar-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '16px 20px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
              Import Summary
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(
                  [
                    ['Accounts', stats.accounts],
                    ['Transactions', stats.transactions],
                    ['Splits', stats.splits],
                    ['Investments', stats.investments],
                  ] as [string, number][]
                ).map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>{label}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        color: 'var(--text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {value.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'var(--sidebar-bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '28px 32px',
              maxWidth: 380,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>
              Replace existing data?
            </div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Re-importing will delete all existing accounts, transactions, and investments and
              replace them with the new file.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '8px 20px',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmReimport}
                style={{
                  padding: '8px 20px',
                  background: '#e94560',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Re-import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImportPage
