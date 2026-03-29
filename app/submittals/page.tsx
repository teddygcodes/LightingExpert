import { prisma } from '@/lib/db'
import Link from 'next/link'
import { DeleteSubmittalButton } from '@/components/DeleteSubmittalButton'
import { SUBMITTAL_STATUS_COLOR, COLORS } from '@/lib/design-tokens'

export default async function SubmittalsPage() {
  const submittals = await prisma.submittal.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { items: true } } },
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Submittals</h1>
        <Link
          href="/submittals/new"
          style={{
            background: COLORS.accent,
            color: '#fff',
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          + New Submittal
        </Link>
      </div>

      {submittals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No submittals yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Create a submittal package to generate PDF documents for your lighting project.</div>
          <Link
            href="/submittals/new"
            style={{ color: COLORS.accent, textDecoration: 'none', fontWeight: 600 }}
          >
            Create your first submittal →
          </Link>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: COLORS.text, color: '#fff' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Project Name</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Project #</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Revision</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Fixtures</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Updated</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>PDF</th>
              <th style={{ padding: '8px 12px', width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {submittals.map((s, i) => (
              <tr key={s.id} style={{ background: i % 2 === 0 ? '#f9f9f9' : '#fff', borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '8px 12px' }}>
                  <Link href={`/submittals/${s.id}`} style={{ color: COLORS.accent, textDecoration: 'none', fontWeight: 600 }}>
                    {s.projectName}
                  </Link>
                </td>
                <td style={{ padding: '8px 12px', color: COLORS.textMuted }}>{s.projectNumber ?? '—'}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{s.revision ?? 'Rev 0'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: SUBMITTAL_STATUS_COLOR[s.status] || COLORS.textMuted,
                    color: '#fff',
                  }}>
                    {s.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>{s._count.items}</td>
                <td style={{ padding: '8px 12px', color: COLORS.textMuted, fontSize: 12 }}>
                  {new Date(s.updatedAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {s.pdfUrl ? (
                    <a href={s.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.blue, fontSize: 12 }}>
                      Download ↗
                    </a>
                  ) : (
                    <span style={{ color: '#aaa', fontSize: 12 }}>Not generated</span>
                  )}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  <DeleteSubmittalButton id={s.id} name={s.projectName} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
