import { prisma } from '@/lib/db'

const STATUS_COLOR: Record<string, string> = {
  RUNNING:     '#0078d4',
  COMPLETED:   '#107c10',
  FAILED:      '#d13438',
  PARTIAL:     '#ff8c00',
  INTERRUPTED: '#6b6b6b',
}

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
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Admin</h1>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Products', value: productCount },
          { label: 'Manufacturers', value: manufacturerCount },
          { label: 'Crawl Runs', value: logs.length },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#d13438' }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: '#6b6b6b', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Crawl trigger */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Crawler</div>
        <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 12 }}>
          The crawler runs as a standalone Node.js script. To start a crawl, run the following command in your terminal:
        </div>
        <pre style={{ background: '#f3f3f3', padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', border: '1px solid #e0e0e0' }}>
          npm run crawl
        </pre>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
          Optional: <code>npm run crawl -- --categories=FLAT_PANEL,DOWNLIGHT</code>
        </div>
      </div>

      {/* Crawl log table */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontSize: 13, fontWeight: 700 }}>
          Crawl History
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b6b6b', fontSize: 13 }}>
            No crawl runs yet. Run <code>npm run crawl</code> to start.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f3f3f3', borderBottom: '1px solid #e0e0e0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Started</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Manufacturer</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Found</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Parsed</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Failed</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Duration</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', color: '#6b6b6b' }}>
                    {new Date(log.startedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{log.manufacturer?.name ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: STATUS_COLOR[log.status] || '#6b6b6b', color: '#fff' }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>{log.productsFound}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#107c10' }}>{log.productsNew + log.productsUpdated}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: log.parseFailures > 0 ? '#d13438' : '#6b6b6b' }}>{log.parseFailures}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {duration(log.startedAt, log.completedAt)}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#d13438', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.errors ? JSON.stringify(log.errors).slice(0, 60) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
