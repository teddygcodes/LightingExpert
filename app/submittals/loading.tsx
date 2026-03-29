import { SkeletonTable } from '@/components/Skeleton'

export default function SubmittalsLoading() {
  return (
    <div style={{ padding: '24px 32px' }}>
      <SkeletonTable rows={8} cols={5} />
    </div>
  )
}
