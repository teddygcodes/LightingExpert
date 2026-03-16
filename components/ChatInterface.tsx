'use client'

import { useChat } from 'ai/react'
import { useEffect, useRef, useState } from 'react'
import type { Message } from 'ai'
import ChatMessage from './ChatMessage'

const STORAGE_KEY = 'atlantiskb-chat-messages'

const EXAMPLE_PROMPTS = [
  "What's a good 2x4 LED troffer for a school classroom?",
  'Cross reference the Lithonia CPX to Cooper',
  'Find a wet location wall pack under 80W with DLC',
  'Show me high bay fixtures for a warehouse over 20,000 lumens',
]

// ─── Suggested follow-up chips ─────────────────────────────────────────────────

function getFollowUpSuggestions(messages: Message[]): string[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return []

  const hasSearch = last.toolInvocations?.some(
    (inv) => inv.toolName === 'search_products' && inv.state === 'result'
  )
  const hasCrossRef = last.toolInvocations?.some(
    (inv) => inv.toolName === 'cross_reference' && inv.state === 'result'
  )

  if (hasSearch) {
    return [
      'View spec sheet for the first result',
      'Cross reference the top result to another brand',
      'Add the first fixture to my submittal',
    ]
  }
  if (hasCrossRef) {
    return ['Show me the spec sheet for the best match', 'Add the top match to my submittal']
  }
  return []
}

// ─── Load / save localStorage ─────────────────────────────────────────────────

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as Message[]) : []
  } catch {
    return []
  }
}

export default function ChatInterface() {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [initialMessages] = useState<Message[]>(() => loadMessages())

  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setMessages } =
    useChat({
      api: '/api/chat',
      initialMessages,
    })

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
      } catch {
        // Storage full — ignore
      }
    }
  }, [messages])

  // Auto-scroll to bottom on new messages/streaming
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setAutoScroll(atBottom)
  }

  // Textarea auto-grow (max 4 rows ≈ 120px)
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) {
        handleSubmit(e as unknown as React.FormEvent)
      }
    }
  }

  const sendMessage = (text: string) => {
    append({ role: 'user', content: text })
  }

  // "Add to Submittal" from product card routes through chat to keep state in sync
  const handleAddToSubmittal = (catalogNumber: string) => {
    sendMessage(`Add ${catalogNumber} to my submittal`)
  }

  const clearConversation = () => {
    localStorage.removeItem(STORAGE_KEY)
    setMessages([])
  }

  const followUpSuggestions = getFollowUpSuggestions(messages)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 44px)',
        background: '#f3f3f3',
      }}
    >
      {/* Message list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 8px' }}
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '12vh', color: '#555' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💡</div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 8,
                color: '#1a1a1a',
              }}
            >
              Lighting Expert
            </h2>
            <p
              style={{
                fontSize: 14,
                color: '#6b6b6b',
                maxWidth: 480,
                margin: '0 auto 24px',
                lineHeight: 1.6,
              }}
            >
              Ask me anything about lighting fixtures, specs, or applications.
              I can search products, cross-reference between manufacturers,
              pull up spec sheets, and add fixtures to your submittal.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                maxWidth: 560,
                margin: '0 auto',
              }}
            >
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: '#fff',
                    border: '1px solid #d0d0d0',
                    padding: '8px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    color: '#1a1a1a',
                    textAlign: 'left',
                    lineHeight: 1.4,
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAddToSubmittal={handleAddToSubmittal}
          />
        ))}

        {/* Follow-up suggestion chips */}
        {!isLoading && followUpSuggestions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {followUpSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                style={{
                  background: '#fff',
                  border: '1px solid #d0d0d0',
                  padding: '5px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: '#444',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          background: '#fff',
          borderTop: '1px solid rgba(0,0,0,0.12)',
          padding: '12px 16px',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: 1 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoading
                ? 'Thinking…'
                : 'Ask about fixtures, specs, or applications…'
            }
            disabled={isLoading}
            rows={1}
            style={{
              width: '100%',
              resize: 'none',
              border: '1px solid #ccc',
              padding: '9px 12px',
              fontSize: 14,
              fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
              lineHeight: 1.5,
              outline: 'none',
              background: isLoading ? '#f9f9f9' : '#fff',
              color: '#1a1a1a',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          />
        </div>

        <button
          onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
          disabled={isLoading || !input.trim()}
          style={{
            background: isLoading || !input.trim() ? '#ccc' : '#d13438',
            color: '#fff',
            border: 'none',
            padding: '9px 18px',
            fontSize: 14,
            cursor: isLoading || !input.trim() ? 'default' : 'pointer',
            alignSelf: 'flex-end',
            flexShrink: 0,
          }}
        >
          Send ➤
        </button>
      </div>

      {/* Clear conversation */}
      {messages.length > 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '4px 0 8px',
            fontSize: 11,
            color: '#aaa',
            background: '#fff',
          }}
        >
          <button
            onClick={clearConversation}
            style={{
              background: 'none',
              border: 'none',
              color: '#aaa',
              cursor: 'pointer',
              fontSize: 11,
              textDecoration: 'underline',
            }}
          >
            Clear conversation
          </button>
        </div>
      )}
    </div>
  )
}
