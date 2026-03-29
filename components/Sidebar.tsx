'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import ChatRow from './ChatRow'
import type { ChatItem, ProjectItem } from './ChatRow'
import ProjectList from './ProjectList'

function groupByRecency(chats: ChatItem[]): { label: string; items: ChatItem[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const last7 = new Date(today.getTime() - 6 * 86400000)
  const last30 = new Date(today.getTime() - 29 * 86400000)

  const groups: Record<string, ChatItem[]> = {
    'Today': [], 'Yesterday': [], 'Last 7 days': [], 'Last 30 days': [], 'Older': [],
  }
  for (const c of chats) {
    const d = new Date(c.updatedAt)
    if (d >= today) groups['Today'].push(c)
    else if (d >= yesterday) groups['Yesterday'].push(c)
    else if (d >= last7) groups['Last 7 days'].push(c)
    else if (d >= last30) groups['Last 30 days'].push(c)
    else groups['Older'].push(c)
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

const navItems = [
  { href: '/submittals', label: 'Submittals' },
  { href: '/products', label: 'Products' },
  { href: '/admin', label: 'Admin / Crawl Log' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])

  const loadData = useCallback(async () => {
    const [chatsRes, projectsRes] = await Promise.all([
      fetch('/api/chats'),
      fetch('/api/projects'),
    ])
    if (!chatsRes.ok || !projectsRes.ok) return
    const allChats: ChatItem[] = await chatsRes.json()
    const allProjects: ProjectItem[] = await projectsRes.json()
    setChats(allChats.filter((c) => !c.projectId))
    setProjects(allProjects)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const handler = () => loadData()
    window.addEventListener('chat-updated', handler)
    return () => window.removeEventListener('chat-updated', handler)
  }, [loadData])

  const handleAssign = async (chatId: string, projectId: string | null) => {
    await fetch(`/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    loadData()
  }

  const handleDelete = async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, { method: 'DELETE' })
      if (!res.ok) return
      loadData()
      if (pathname === `/chat/${chatId}`) router.push('/')
    } catch {
      // network error during delete — silently ignore, chat stays in sidebar
    }
  }

  const handleProjectCreated = (project: ProjectItem) => {
    setProjects((prev) => [...prev, project])
  }

  const activeChatId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null
  const isOnNewChat = pathname === '/' && !activeChatId
  const groups = groupByRecency(chats)

  return (
    <nav aria-label="Main navigation" style={{
      width: 260,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      position: 'fixed',
      top: 44,
      left: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      zIndex: 90,
      overflow: 'hidden',
    }}>
      {/* New Chat button */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={() => router.push('/')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: isOnNewChat ? 'var(--accent-dim)' : 'var(--bg)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            textAlign: 'left',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square"/>
          </svg>
          New chat
        </button>
      </div>

      {/* Scrollable list */}
      <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>

        {/* Chat history groups */}
        {groups.map(({ label, items }) => (
          <div key={label} style={{ paddingTop: 8 }}>
            <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
              {label}
            </div>
            {items.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={activeChatId === chat.id}
                projects={projects}
                onAssign={handleAssign}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ))}

        {/* Projects section */}
        <div style={{ marginTop: groups.length > 0 ? 12 : 8 }}>
          <ProjectList
            projects={projects}
            activeChatId={activeChatId}
            onAssign={handleAssign}
            onDelete={handleDelete}
            onProjectCreated={handleProjectCreated}
          />
        </div>

        {/* Divider + nav links */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 12px 8px' }} />

        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px 8px 16px',
                fontSize: 13,
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                background: active ? 'var(--accent-dim)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
