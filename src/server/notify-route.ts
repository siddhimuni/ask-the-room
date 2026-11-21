/**
 * Notification routes. Each one sends email through the platform's email
 * integration (`email/send`).
 *
 * Billing: integrations default to developer billing, so the app owner's token
 * (APP_OWNER_JWT) pays for each email.
 *
 * POST /api/notify/approved      (admin only): email a member that their question is live.
 * POST /api/notify/new-question  (any signed-in user): email the host that a question arrived.
 *
 * Risk: any signed-in member can trigger the new-question email, so the owner
 * pays for every question posted. There's no rate limit yet (see README).
 */

import type { Hono } from 'hono'
import { apiWorkerFetch, resolveAppRole, splitIntegrationEndpoint } from 'deepspace/worker'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

const MAX_QUESTION_LENGTH = 280
const MAX_SUBJECT_SNIPPET = 60
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A one-line preview of the question for the subject. Including the text makes
 * each email's subject unique, so mail clients don't group them into one thread.
 */
function subjectSnippet(question: string): string {
  const oneLine = question.replace(/\s+/g, ' ').trim()
  return oneLine.length <= MAX_SUBJECT_SNIPPET
    ? oneLine
    : oneLine.slice(0, MAX_SUBJECT_SNIPPET - 1).trimEnd() + '…'
}

/** Sends one email through the platform. Returns false if the send failed. */
async function sendEmail(
  env: Env,
  email: { to: string; subject: string; text: string },
): Promise<boolean> {
  const target = splitIntegrationEndpoint('email/send')
  if (!target) return false
  const res = await apiWorkerFetch(env, target.path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.APP_OWNER_JWT}`,
    },
    body: JSON.stringify(email),
  })
  const payload = (await res.json().catch(() => ({}))) as { success?: boolean }
  if (!res.ok || payload.success === false) {
    console.error('[notify] email failed with status', res.status)
    return false
  }
  return true
}

export function registerNotifyRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.post('/api/notify/approved', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)
    if ((await resolveAppRole(c.env, auth.userId)) !== 'admin') {
      return c.json({ error: 'Only moderators can send this' }, 403)
    }

    const input = await c.req.json().catch(() => null)
    const to = typeof input?.to === 'string' ? input.to.trim() : ''
    const question =
      typeof input?.question === 'string' ? input.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
    if (!EMAIL_PATTERN.test(to) || !question) {
      return c.json({ error: 'Invalid recipient or question' }, 400)
    }

    const sent = await sendEmail(c.env, {
      to,
      subject: `Your question is live: ${subjectSnippet(question)}`,
      text: `Your question was approved and is now on the board:\n\n"${question}"\n\nThanks for taking part.`,
    })
    if (!sent) return c.json({ error: 'The email could not be sent' }, 502)
    return c.json({ sent: true })
  })

  app.post('/api/notify/new-question', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Unauthorized' }, 401)

    // The host's address is a secret (ADMIN_NOTIFY_EMAIL), not a value in the code.
    const host = c.env.ADMIN_NOTIFY_EMAIL?.trim() ?? ''
    if (!EMAIL_PATTERN.test(host)) return c.json({ sent: false, reason: 'not configured' })

    const input = await c.req.json().catch(() => null)
    const question =
      typeof input?.question === 'string' ? input.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
    if (!question) return c.json({ error: 'Invalid question' }, 400)

    const moderateUrl = new URL('/moderate', c.req.url).toString()
    const sent = await sendEmail(c.env, {
      to: host,
      subject: `New question: ${subjectSnippet(question)}`,
      text: `A new question is waiting for review:\n\n"${question}"\n\nReview it here: ${moderateUrl}`,
    })
    if (!sent) return c.json({ error: 'The email could not be sent' }, 502)
    return c.json({ sent: true })
  })
}
