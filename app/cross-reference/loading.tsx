import { SkeletonLine, SkeletonCard } from '@/components/Skeleton'

export default function CrossReferenceLoading() {
  return (
    <div style={{ padding: '24px 32px' }}>
      <SkeletonLine width="30%" height={20} style={{ marginBottom: 20 }} />
      <SkeletonLine width="100%" height={40} style={{ marginBottom: 24 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
