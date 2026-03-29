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
      <div className="flex items-center justify-between px-3 pt-1 pb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">
          Projects
        </span>
        <button
          onClick={() => setShowNewProject(true)}
          title="New project"
          className="bg-transparent border-none cursor-pointer text-[var(--text-faint)] px-0.5 text-base leading-none flex items-center"
        >
          +
        </button>
      </div>

      {showNewProject && (
        <div className="px-3 py-1.5 flex gap-1">
          <input
            autoFocus
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject()
              if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName('') }
            }}
            placeholder="Project name…"
            className="flex-1 text-xs px-2 py-1 border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none"
          />
          <button
            onClick={handleCreateProject}
            className="bg-[var(--accent)] border-none text-white px-2 py-1 text-[11px] cursor-pointer"
          >
            Add
          </button>
        </div>
      )}

      {projects.length === 0 && !showNewProject && (
        <div className="px-3 pt-[3px] pb-1.5 text-xs text-[var(--text-faint)] italic">
          No projects yet
        </div>
      )}

      {projects.map((project) => {
        const isOpen = expandedProjects.has(project.id)
        return (
          <div key={project.id}>
            <button
              onClick={() => toggleProject(project.id)}
              className="w-full flex items-center gap-1.5 py-[5px] px-3 bg-transparent border-none cursor-pointer text-[13px] text-[var(--text)] text-left font-medium"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className={`shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>
                <path d="M2 1.5l4.5 3L2 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              </svg>
              <svg width="13" height="11" viewBox="0 0 13 11" fill="none" className="shrink-0">
                <path d="M1 2.5h4l1.5 2H12v5H1V2.5z" fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth="1"/>
              </svg>
              <span className="truncate flex-1 text-[13px]">
                {project.name}
              </span>
              <span className="text-[10px] text-[var(--text-faint)] shrink-0">
                {project.chats.length}
              </span>
            </button>
            {isOpen && (
              <div className="pl-2.5">
                {project.chats.length === 0 ? (
                  <div className="px-3 py-0.5 pb-[5px] text-xs text-[var(--text-faint)] italic">Empty</div>
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
