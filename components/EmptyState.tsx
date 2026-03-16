interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      padding: '48px 24px',
      textAlign: 'center',
      color: '#6b6b6b',
    }}>
      {icon && <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>}
      <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a', marginBottom: 6 }}>{title}</div>
      {description && <div style={{ fontSize: 13, marginBottom: action ? 16 : 0 }}>{description}</div>}
      {action && <div>{action}</div>}
    </div>
  )
}
