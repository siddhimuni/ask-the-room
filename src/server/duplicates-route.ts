/**
 * POST /api/duplicates: ask Claude whether a pending question repeats an
 * approved one. Admin only.
 *
 * Billing: the admin's own JWT pays for the call (caller-pays), so no owner
 * secret is needed. Each check is one small call to GPT-OSS 120B on Cerebras
 * (an open model served through the DeepSpace proxy), made only when the
 * admin clicks "Check duplicate".
 *
 * Input:  { question: string, approved: { id: string, body: string }[] }
 * Output: { match: string | null }  the id of the approved question, or null
 */

import type { Hono } from 'hono'
import { generateText } from 'ai'
import { createDeepSpaceAI, resolveAppRole } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

const MAX_QUESTION_LENGTH = 280
const MAX_CANDIDATES = 200

export function registerDuplicatesRoute(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/duplicates', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    if ((await resolveAppRole(c.env, auth.userId)) !== 'admin') {
      return c.json({ error: 'Only moderators can check duplicates' }, 403)
    }

    // The raw JWT is needed so the caller's account pays for the AI call.
    const authHeader = c.req.header('Authorization') ?? ''
    const callerJwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!callerJwt) return c.json({ error: 'Unauthorized' }, 401)

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

    try {
      const model = createDeepSpaceAI(c.env, 'cerebras', { authToken: callerJwt })('gpt-oss-120b')
      // A reasoning model spends output tokens thinking first, so the limit must
      // leave room for that. A tiny limit can cut the reply off before the number.
      const { text } = await generateText({ model, prompt, maxOutputTokens: 1000 })
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
