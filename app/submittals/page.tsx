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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold m-0">Submittals</h1>
        <Link
          href="/submittals/new"
          className="bg-[var(--accent)] text-white px-[18px] py-2 text-[13px] font-semibold no-underline hover:no-underline"
        >
          + New Submittal
        </Link>
      </div>

      {submittals.length === 0 ? (
        <div className="text-center py-[60px] px-5 text-[var(--text-muted)]">
          <div className="font-semibold mb-2">No submittals yet</div>
          <div className="text-[13px] mb-5">Create a submittal package to generate PDF documents for your lighting project.</div>
          <Link
            href="/submittals/new"
            className="text-[var(--accent)] font-semibold"
          >
            Create your first submittal →
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Project #</th>
                <th>Revision</th>
                <th>Status</th>
                <th className="text-center">Fixtures</th>
                <th>Updated</th>
                <th>PDF</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {submittals.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/submittals/${s.id}`} className="text-[var(--accent)] font-semibold">
                      {s.projectName}
                    </Link>
                  </td>
                  <td className="text-[var(--text-muted)]">{s.projectNumber ?? '—'}</td>
                  <td className="font-[family-name:var(--font-mono)] text-xs">{s.revision ?? 'Rev 0'}</td>
                  <td>
                    <span
                      className="inline-block px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ background: SUBMITTAL_STATUS_COLOR[s.status] || COLORS.textMuted }}
                    >
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-center">{s._count.items}</td>
                  <td className="text-[var(--text-muted)] text-xs">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </td>
                  <td>
                    {s.pdfUrl ? (
                      <a href={s.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--blue,#0078d4)] text-xs">
                        Download ↗
                      </a>
                    ) : (
                      <span className="text-[var(--text-faint)] text-xs">Not generated</span>
                    )}
                  </td>
                  <td className="text-center">
                    <DeleteSubmittalButton id={s.id} name={s.projectName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
