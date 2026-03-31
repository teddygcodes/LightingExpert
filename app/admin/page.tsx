import { prisma } from '@/lib/db'
import { CRAWL_STATUS_COLOR, COLORS } from '@/lib/design-tokens'

export default async function AdminPage() {
  const logs = await prisma.crawlLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: { manufacturer: { select: { name: true } } },
  })

  const productCount = await prisma.product.count()
  const manufacturerCount = await prisma.manufacturer.count()

  function duration(start: Date, end: Date | null) {
    if (!end) return '—'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Admin</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Products', value: productCount },
          { label: 'Manufacturers', value: manufacturerCount },
          { label: 'Crawl Runs', value: logs.length },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-[var(--border)] px-5 py-4">
            <div className="text-[28px] font-bold text-[var(--accent)]">{stat.value}</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Crawler */}
      <div className="bg-white border border-[var(--border)] p-5 mb-6">
        <div className="text-[13px] font-bold mb-2">Crawler</div>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          The crawler runs as a standalone Node.js script. To start a crawl, run the following command in your terminal:
        </div>
        <pre className="bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2.5 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          npm run crawl
        </pre>
        <div className="text-[11px] text-[var(--text-faint)] mt-2">
          Optional: <code style={{ fontFamily: 'var(--font-mono)' }}>npm run crawl -- --categories=FLAT_PANEL,DOWNLIGHT</code>
        </div>
      </div>

      {/* Crawl log table */}
      <div className="bg-white border border-[var(--border)]">
        <div className="px-4 py-3 border-b border-[var(--border)] text-[13px] font-bold">
          Crawl History
        </div>
        {logs.length === 0 ? (
          <div className="p-10 text-center text-[var(--text-muted)] text-[13px]">
            No crawl runs yet. Run <code style={{ fontFamily: 'var(--font-mono)' }}>npm run crawl</code> to start.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Manufacturer</th>
                  <th>Status</th>
                  <th className="text-center">Found</th>
                  <th className="text-center">Parsed</th>
                  <th className="text-center">Failed</th>
                  <th className="text-right">Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-[var(--text-muted)]">
                      {new Date(log.startedAt).toLocaleString()}
                    </td>
                    <td>{log.manufacturer?.name ?? '—'}</td>
                    <td>
                      <span
                        className="inline-block px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ background: CRAWL_STATUS_COLOR[log.status] || COLORS.textMuted }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="text-center">{log.productsFound}</td>
                    <td className="text-center text-[var(--green,#107c10)]">{log.productsNew + log.productsUpdated}</td>
                    <td className="text-center" style={{ color: log.parseFailures > 0 ? COLORS.accent : COLORS.textMuted }}>{log.parseFailures}</td>
                    <td className="text-right" style={{ fontFamily: 'var(--font-mono)' }}>
                      {duration(log.startedAt, log.completedAt)}
                    </td>
                    <td className="text-[var(--accent)] text-[11px] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {log.errors ? JSON.stringify(log.errors).slice(0, 60) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
