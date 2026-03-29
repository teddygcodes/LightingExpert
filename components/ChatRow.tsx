'use client'

import Link from 'next/link'
import { useState, useRef, useCallback } from 'react'
import { useClickOutside } from '@/lib/hooks/useClickOutside'

export interface ChatItem {
  id: string
  title: string | null
  projectId: string | null
  updatedAt: string
}

export interface ProjectItem {
  id: string
  name: string
  chats: ChatItem[]
}

interface ChatRowProps {
  chat: ChatItem
  active: boolean
  projects: ProjectItem[]
  onAssign: (chatId: string, projectId: string | null) => void
  onDelete: (chatId: string) => void
}

export default function ChatRow({ chat, active, projects, onAssign, onDelete }: ChatRowProps) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useClickOutside(menuRef, useCallback(() => setMenuOpen(false), []))

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false) }}
    >
      <Link
        href={`/chat/${chat.id}`}
        style={{
          display: 'block',
          padding: '5px 28px 5px 16px',
          fontSize: 13,
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          background: active ? 'var(--accent-dim)' : hovered ? 'var(--bg)' : 'transparent',
          textDecoration: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
          lineHeight: 1.5,
          transition: 'background 0.1s',
        }}
      >
        {chat.title ?? 'New chat'}
      </Link>

      {(hovered || menuOpen) && (
        <div ref={menuRef} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen((v) => !v) }}
            style={{
              background: menuOpen ? 'var(--border)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              color: 'var(--text-muted)',
              fontSize: 14,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ···
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 180,
              zIndex: 100,
            }}>
              <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)' }}>
                  Move to project
                </div>
                {projects.length === 0 ? (
                  <div style={{ padding: '4px 12px 6px', fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>No projects</div>
                ) : (
                  projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { onAssign(chat.id, p.id); setMenuOpen(false) }}
                      style={{
                        width: '100%', textAlign: 'left', background: chat.projectId === p.id ? 'var(--accent-dim)' : 'none',
                        border: 'none', cursor: 'pointer', padding: '5px 12px',
                        fontSize: 12, color: chat.projectId === p.id ? 'var(--accent)' : 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {chat.projectId === p.id && <span style={{ color: 'var(--accent)', fontSize: 10 }}>✓</span>}
                      {p.name}
                    </button>
                  ))
                )}
                {chat.projectId && (
                  <button
                    onClick={() => { onAssign(chat.id, null); setMenuOpen(false) }}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 12px', fontSize: 12, color: 'var(--text-muted)' }}
                  >
                    Remove from project
                  </button>
                )}
              </div>
              <button
                onClick={() => { onDelete(chat.id); setMenuOpen(false) }}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12, color: 'var(--accent)' }}
              >
                Delete chat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
