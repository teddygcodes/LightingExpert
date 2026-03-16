'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'

interface ChatItem {
  id: string
  title: string | null
  projectId: string | null
  updatedAt: string
}

interface ProjectItem {
  id: string
  name: string
  chats: ChatItem[]
}

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

interface ChatRowProps {
  chat: ChatItem
  active: boolean
  projects: ProjectItem[]
  onAssign: (chatId: string, projectId: string | null) => void
  onDelete: (chatId: string) => void
}

function ChatRow({ chat, active, projects, onAssign, onDelete }: ChatRowProps) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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

      {/* Context menu button — visible on hover */}
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
              {/* Move to project */}
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
              {/* Delete */}
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

const navItems = [
  { href: '/products', label: 'Products' },
  { href: '/cross-reference', label: 'Cross Reference' },
  { href: '/submittals', label: 'Submittals' },
  { href: '/admin', label: 'Admin / Crawl Log' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)

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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName.trim() }),
    })
    const project = await res.json()
    setProjects((prev) => [...prev, project])
    setExpandedProjects((prev) => new Set([...prev, project.id]))
    setNewProjectName('')
    setShowNewProject(false)
  }

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const activeChatId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null
  const isOnNewChat = pathname === '/' && !activeChatId
  const groups = groupByRecency(chats)

  return (
    <nav style={{
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 2px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
              Projects
            </span>
            <button
              onClick={() => setShowNewProject(true)}
              title="New project"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '0 2px', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            >
              +
            </button>
          </div>

          {showNewProject && (
            <div style={{ padding: '6px 12px', display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject()
                  if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName('') }
                }}
                placeholder="Project name…"
                style={{
                  flex: 1, fontSize: 12, padding: '4px 8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)', color: 'var(--text)',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleCreateProject}
                style={{ background: 'var(--accent)', border: 'none', color: '#fff', padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
              >
                Add
              </button>
            </div>
          )}

          {projects.length === 0 && !showNewProject && (
            <div style={{ padding: '3px 12px 6px', fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              No projects yet
            </div>
          )}

          {projects.map((project) => {
            const isOpen = expandedProjects.has(project.id)
            return (
              <div key={project.id}>
                <button
                  onClick={() => toggleProject(project.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text)',
                    textAlign: 'left',
                    fontWeight: 500,
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                    <path d="M2 1.5l4.5 3L2 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                  </svg>
                  <svg width="13" height="11" viewBox="0 0 13 11" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1 2.5h4l1.5 2H12v5H1V2.5z" fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth="1"/>
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 13 }}>
                    {project.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                    {project.chats.length}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ paddingLeft: 10 }}>
                    {project.chats.length === 0 ? (
                      <div style={{ padding: '2px 12px 5px', fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>Empty</div>
                    ) : (
                      project.chats.map((chat) => (
                        <ChatRow
                          key={chat.id}
                          chat={{ ...chat, projectId: project.id }}
                          active={activeChatId === chat.id}
                          projects={projects}
                          onAssign={handleAssign}
                          onDelete={handleDelete}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
