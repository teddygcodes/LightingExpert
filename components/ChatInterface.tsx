'use client'

import { useChat } from 'ai/react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Message } from 'ai'
import ChatMessage from './ChatMessage'

const EXAMPLE_PROMPTS = [
  "What's a good 2x4 LED troffer for a school classroom?",
  'Cross reference the Lithonia CPX to Cooper',
  'Find a wet location wall pack under 80W with DLC',
  'Show me high bay fixtures for a warehouse over 20,000 lumens',
]

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

function titleFromMessages(messages: Message[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first || typeof first.content !== 'string') return 'New chat'
  return first.content.slice(0, 60).trim() + (first.content.length > 60 ? '…' : '')
}

interface Props {
  chatId?: string
}

export default function ChatInterface({ chatId }: Props) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [initialMessages, setInitialMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(!!chatId)
  const currentChatIdRef = useRef<string | null>(chatId ?? null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)

  // Load messages from DB when chatId is provided
  useEffect(() => {
    if (!chatId) { setLoadingMessages(false); return }
    fetch(`/api/chats/${chatId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((chat) => {
        if (chat?.messages) setInitialMessages(chat.messages)
        setLoadingMessages(false)
      })
      .catch(() => setLoadingMessages(false))
  }, [chatId])

  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setMessages } =
    useChat({ api: '/api/chat', initialMessages })

  // Save messages to DB (debounced)
  const saveToDb = useCallback(async (msgs: Message[], id: string) => {
    if (isSavingRef.current) return
    isSavingRef.current = true
    try {
      const body: Record<string, unknown> = { messages: msgs }
      if (msgs.length <= 2) body.title = titleFromMessages(msgs)
      const res = await fetch(`/api/chats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) console.warn('[ChatInterface] Failed to save chat:', res.status)
      else window.dispatchEvent(new CustomEvent('chat-updated'))
    } catch (err) {
      console.warn('[ChatInterface] Network error saving chat:', err)
    } finally {
      isSavingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (messages.length === 0 || isLoading) return

    // First message in a new chat: create DB record and navigate to /chat/[id]
    if (!currentChatIdRef.current) {
      const title = titleFromMessages(messages)
      fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, messages }),
      })
        .then((r) => r.json())
        .then((chat) => {
          currentChatIdRef.current = chat.id
          router.replace(`/chat/${chat.id}`, { scroll: false })
          window.dispatchEvent(new CustomEvent('chat-updated'))
        })
      return
    }

    // Debounced save for existing chat
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveToDb(messages, currentChatIdRef.current!)
    }, 800)

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [messages, isLoading, saveToDb, router])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100)
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const sendMessage = (text: string) => append({ role: 'user', content: text })
  const handleAddToSubmittal = (catalogNumber: string) => sendMessage(`Add ${catalogNumber} to my submittal`)
  const handleSelectProduct = (catalogNumber: string) => sendMessage(`spec sheet for ${catalogNumber}`)

  const handleNewChat = () => {
    setMessages([])
    currentChatIdRef.current = null
    router.push('/')
  }

  const streamingMsgId =
    isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant'
      ? messages[messages.length - 1].id
      : null

  const followUpSuggestions = getFollowUpSuggestions(messages)
  const canSend = !isLoading && !!input.trim()

  if (loadingMessages) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 44px)', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 44px)', background: 'var(--bg)', margin: -24 }}>

      {/* Message list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="chat-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '32px 0 16px' }}
      >
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 28px' }}>

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '10vh' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: 'var(--accent)', marginBottom: 20 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M9 2h6l1 5H8L9 2Z" fill="white" fillOpacity=".9"/>
                  <path d="M8 7h8l1 3H7L8 7Z" fill="white" fillOpacity=".7"/>
                  <path d="M12 10v8M9 14l3 4 3-4" stroke="white" strokeWidth="1.5" strokeLinecap="square"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--text)', marginBottom: 8 }}>
                Lighting Expert
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 32px', lineHeight: 1.65 }}>
                Search products, cross-reference manufacturers, pull spec sheets, and build submittals — all in conversation.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 560, margin: '0 auto' }}>
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="prompt-chip"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      padding: '12px 14px',
                      fontSize: 13,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      textAlign: 'left',
                      lineHeight: 1.45,
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            // Suppress the spec sheet card when a search result already appeared in this
            // exchange (either same message or a preceding step-message before the last user turn).
            const suppressSpecSheet = (() => {
              if (!msg.toolInvocations?.some((inv) => inv.toolName === 'get_spec_sheet')) return false
              if (msg.toolInvocations?.some((inv) => inv.toolName === 'search_products' && inv.state === 'result')) return true
              for (let j = i - 1; j >= 0; j--) {
                if (messages[j].role === 'user') break
                if (messages[j].toolInvocations?.some((inv) => inv.toolName === 'search_products' && inv.state === 'result')) return true
              }
              return false
            })()
            return (
              <ChatMessage key={msg.id} message={msg} onAddToSubmittal={handleAddToSubmittal} onSelectProduct={handleSelectProduct} isStreaming={msg.id === streamingMsgId} suppressSpecSheet={suppressSpecSheet} />
            )
          })}

          {!isLoading && followUpSuggestions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, marginBottom: 20, paddingLeft: 2 }}>
              {followUpSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="followup-chip"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    padding: '5px 12px 5px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span style={{ color: 'var(--accent)', fontSize: 10 }}>▶</span>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '14px 28px 10px',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.04)',
      }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? 'Thinking…' : 'Ask about fixtures, specs, or applications…'}
              disabled={isLoading}
              rows={1}
              className="chat-input"
              style={{
                flex: 1,
                resize: 'none',
                border: '1px solid var(--border)',
                borderBottom: '2px solid var(--border)',
                padding: '9px 12px',
                fontSize: 14,
                lineHeight: 1.5,
                background: 'var(--bg)',
                color: 'var(--text)',
                overflow: 'hidden',
                transition: 'border-color 0.15s ease',
              }}
            />
            <button
              onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
              disabled={!canSend}
              className="send-btn"
              style={{
                background: canSend ? 'var(--accent)' : 'var(--border)',
                color: canSend ? '#fff' : 'var(--text-faint)',
                border: 'none',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canSend ? 'pointer' : 'default',
                flexShrink: 0,
                alignSelf: 'flex-end',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8h10M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter"/>
              </svg>
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              Enter to send · Shift+Enter for newline
            </span>
            {messages.length > 0 && (
              <button
                onClick={handleNewChat}
                style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: 0 }}
              >
                New chat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
