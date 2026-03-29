// app/api/chat/route.ts
import { streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { NextRequest } from 'next/server'
import { LIGHTING_EXPERT_SYSTEM_PROMPT } from '@/lib/agent/system-prompt'
import { agentTools } from '@/lib/agent/tools'
import { checkRateLimit } from '@/lib/agent/rate-limit'
import { chatRequestSchema } from '@/lib/validations'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[chat route] ANTHROPIC_API_KEY is not set')
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const anthropic = createAnthropic({ apiKey })

  // Rate limiting by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const { allowed, retryAfterMs } = checkRateLimit(ip)
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait a moment before trying again.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((retryAfterMs ?? 60000) / 1000)),
        },
      }
    )
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const parsed = chatRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return new Response(
      JSON.stringify({ error: issue.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  // Trim: keep last 20 messages; strip tool result content from messages older than 10 from end
  const allMessages = parsed.data.messages
  const messages = trimMessages(allMessages)

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: LIGHTING_EXPERT_SYSTEM_PROMPT,
    tools: agentTools,
    messages,
    maxTokens: 8192,
    maxSteps: 3,
    onError: (err) => {
      console.error('[chat route] streamText error:', err)
    },
  })

  return result.toDataStreamResponse()
}

// ─── Conversation trimming ─────────────────────────────────────────────────────
// Keep last 20 messages. For messages older than position 10 from the end,
// drop tool result content to reduce token count while preserving message structure.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trimMessages(messages: any[]): any[] {
  const last20 = messages.slice(-20)
  const cutoff = Math.max(0, last20.length - 10)

  return last20.map((msg, i) => {
    if (i >= cutoff) return msg
    if (msg.toolInvocations) {
      return {
        ...msg,
        toolInvocations: msg.toolInvocations.map((inv: Record<string, unknown>) =>
          inv.state === 'result'
            ? { ...inv, result: '[result omitted to save context]' }
            : inv
        ),
      }
    }
    return msg
  })
}
