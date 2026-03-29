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
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false) }}
    >
      <Link
        href={`/chat/${chat.id}`}
        className={`block py-[5px] pr-7 pl-4 text-[13px] leading-normal truncate border-l-2 transition-[background] duration-100 no-underline ${
          active
            ? 'text-[var(--accent)] bg-[var(--accent-dim)] border-l-[var(--accent)]'
            : 'text-[var(--text-secondary)] bg-transparent hover:bg-[var(--bg)] border-l-transparent'
        }`}
      >
        {chat.title ?? 'New chat'}
      </Link>

      {(hovered || menuOpen) && (
        <div ref={menuRef} className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10">
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen((v) => !v) }}
            className={`border-none cursor-pointer px-1 py-0.5 text-[var(--text-muted)] text-sm leading-none flex items-center ${
              menuOpen ? 'bg-[var(--border)]' : 'bg-transparent'
            }`}
          >
            ···
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full bg-[var(--surface)] border border-[var(--border)] shadow-[0_4px_16px_rgba(0,0,0,0.12)] min-w-[180px] z-[100]">
              <div className="py-1 border-b border-b-[var(--border)]">
                <div className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-faint)]">
                  Move to project
                </div>
                {projects.length === 0 ? (
                  <div className="px-3 pt-1 pb-1.5 text-xs text-[var(--text-faint)] italic">No projects</div>
                ) : (
                  projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { onAssign(chat.id, p.id); setMenuOpen(false) }}
                      className={`w-full text-left border-none cursor-pointer py-[5px] px-3 text-xs flex items-center gap-1.5 ${
                        chat.projectId === p.id
                          ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'bg-transparent text-[var(--text-secondary)]'
                      }`}
                    >
                      {chat.projectId === p.id && <span className="text-[var(--accent)] text-[10px]">✓</span>}
                      {p.name}
                    </button>
                  ))
                )}
                {chat.projectId && (
                  <button
                    onClick={() => { onAssign(chat.id, null); setMenuOpen(false) }}
                    className="w-full text-left bg-transparent border-none cursor-pointer py-[5px] px-3 text-xs text-[var(--text-muted)]"
                  >
                    Remove from project
                  </button>
                )}
              </div>
              <button
                onClick={() => { onDelete(chat.id); setMenuOpen(false) }}
                className="w-full text-left bg-transparent border-none cursor-pointer py-1.5 px-3 text-xs text-[var(--accent)]"
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
