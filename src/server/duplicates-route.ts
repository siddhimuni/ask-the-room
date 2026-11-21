/**
 * POST /api/duplicates: ask a Claude model whether a pending question repeats an
 * approved one. Admin only.
 *
 * The model call goes through the platform's integrations catalog
 * (`anthropic/chat-completion`), the same way the email route calls `email/send`.
 * Billing is developer mode by default, so the app owner's token (APP_OWNER_JWT)
 * pays. The admin is the owner, so the admin pays in practice. Each call costs a
 * fraction of a cent (a test call measured $0.0000044).
 *
 * Input:  { question: string, approved: { id: string, body: string }[] }
 * Output: { match: string | null }  the id of the approved question, or null
 */

import type { Hono } from 'hono'
import { apiWorkerFetch, resolveAppRole, splitIntegrationEndpoint } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

const MAX_QUESTION_LENGTH = 280
const MAX_CANDIDATES = 200
const MODEL = 'claude-haiku-5-5'

/** The response shape of anthropic/chat-completion (checked with a test call). */
interface ChatCompletionResponse {
  success?: boolean
  data?: { content?: Array<{ type: string; text?: string }> }
}

export function registerDuplicatesRoute(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/duplicates', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    if ((await resolveAppRole(c.env, auth.userId)) !== 'admin') {
      return c.json({ error: 'Only moderators can check duplicates' }, 403)
    }

    const input = await c.req.json().catch(() => null)
    const question = typeof input?.question === 'string' ? input.question.trim() : ''
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      return c.json({ error: 'Invalid question' }, 400)
    }
    const approved: unknown[] = Array.isArray(input?.approved) ? input.approved : []
    if (approved.length > MAX_CANDIDATES) {
      return c.json({ error: 'Too many approved questions' }, 400)
    }
    const candidates: { id: string; body: string }[] = []
    for (const item of approved) {
      const q = item as { id?: unknown; body?: unknown }
      if (typeof q?.id === 'string' && typeof q?.body === 'string') {
        candidates.push({ id: q.id, body: q.body.slice(0, MAX_QUESTION_LENGTH) })
      }
    }
    if (candidates.length === 0) return c.json({ match: null })

    const list = candidates.map((q, i) => `${i + 1}. ${q.body}`).join('\n')
    const prompt = [
      'You check for duplicate questions at a live Q&A session.',
      `New question: """${question}"""`,
      `Existing approved questions:\n${list}`,
      'If one existing question asks essentially the same thing as the new question, reply with only its number.',
      'Otherwise reply with only the word NONE.',
    ].join('\n\n')

    const target = splitIntegrationEndpoint('anthropic/chat-completion')
    if (!target) return c.json({ error: 'AI integration path is invalid' }, 500)

    try {
      const res = await apiWorkerFetch(c.env, target.path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${c.env.APP_OWNER_JWT}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as ChatCompletionResponse
      if (!res.ok || payload.success === false) {
        console.error('[duplicates] AI integration failed with status', res.status)
        return c.json({ error: 'The duplicate check failed. Try again.' }, 502)
      }

      const text = (payload.data?.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
      // Only a valid list number counts. Anything else (including NONE) means no match.
      const n = Number.parseInt(text.trim(), 10)
      const picked = Number.isInteger(n) && n >= 1 && n <= candidates.length ? candidates[n - 1] : null
      return c.json({ match: picked?.id ?? null })
    } catch (err) {
      console.error('[duplicates] AI call failed', err)
      return c.json({ error: 'The duplicate check failed. Try again.' }, 502)
    }
  })
}
