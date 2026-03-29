'use client'

import { useState } from 'react'
import ChatRow from './ChatRow'
import type { ChatItem, ProjectItem } from './ChatRow'

interface ProjectListProps {
  projects: ProjectItem[]
  activeChatId: string | null
  onAssign: (chatId: string, projectId: string | null) => void
  onDelete: (chatId: string) => void
  onProjectCreated: (project: ProjectItem) => void
}

export default function ProjectList({ projects, activeChatId, onAssign, onDelete, onProjectCreated }: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName.trim() }),
    })
    const project = await res.json()
    onProjectCreated(project)
    setExpandedProjects((prev) => new Set([...prev, project.id]))
    setNewProjectName('')
    setShowNewProject(false)
  }

  return (
    <div>
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
                      onAssign={onAssign}
                      onDelete={onDelete}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
