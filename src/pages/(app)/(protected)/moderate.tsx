/**
 * Moderator page: approve, hide, pin, and mark questions answered.
 * Only admins can change status, pinned, answered, and hideReason (see questions-schema.ts).
 */

import { useState, type ReactNode } from 'react'
import { getAuthToken, useAuthProfileReady, useMutations, useQuery, useUserLookup } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import {
  sortBoard,
  tallyVotes,
  type QuestionData,
  type SettingData,
  type VoteData,
} from '../../../lib/board'

/** Why a question was hidden. Stored in `hideReason` so the Hidden list can show it. */
const HIDE_REASONS = ['duplicate', 'abusive', 'off-topic', 'other'] as const
type HideReason = (typeof HIDE_REASONS)[number]

export default function ModeratePage() {
  const { user } = useAuthProfileReady({ requireUser: true })
  const { error } = useToast()
  const questions = useQuery<QuestionData>('questions', { orderBy: 'createdAt', orderDir: 'asc' })
  const votes = useQuery<VoteData>('votes')
  const writes = useMutations<Partial<QuestionData>>('questions')
  const topicRows = useQuery<SettingData>('settings', { where: { key: 'topic' } })
  const settingWrites = useMutations<SettingData>('settings')
  // Admins can read each user's email, so this maps an author ID to their email.
  const lookup = useUserLookup()
  const [topicDraft, setTopicDraft] = useState<string | null>(null)
  // Results of "Check duplicate", keyed by pending question ID.
  const [checks, setChecks] = useState<Record<string, 'checking' | { match: string | null }>>({})
  // The reason the host has picked for each question before hiding it.
  const [reasons, setReasons] = useState<Record<string, HideReason>>({})
  const currentTopic = topicRows.records[0]?.data.value ?? ''

  if (user?.role !== 'admin') {
    return <p className="p-8 text-sm text-muted-foreground">Only moderators can open this page.</p>
  }

  const tallies = tallyVotes(votes.records)
  const pending = questions.records.filter((q) => q.data.status === 'pending')
  const approved = sortBoard(
    questions.records.filter((q) => q.data.status === 'approved'),
    tallies,
  )
  const hidden = questions.records.filter((q) => q.data.status === 'hidden')

  // Asks the server whether a pending question repeats an approved one.
  // Runs only when the admin clicks, so credits are spent on purpose.
  async function checkDuplicate(q: { recordId: string; data: QuestionData }) {
    setChecks((c) => ({ ...c, [q.recordId]: 'checking' }))
    try {
      const token = await getAuthToken()
      // Relative path: the app's own worker serves this route, on the same origin as the page.
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question: q.data.body,
          approved: approved.map((a) => ({ id: a.recordId, body: a.data.body })),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(`HTTP ${res.status}: ${body.error ?? 'no message from server'}`)
      }
      const { match } = (await res.json()) as { match: string | null }
      const hit = approved.find((a) => a.recordId === match)
      setChecks((c) => ({ ...c, [q.recordId]: { match: hit?.data.body ?? null } }))
    } catch (err) {
      setChecks((c) => {
        const next = { ...c }
        delete next[q.recordId]
        return next
      })
      error('Duplicate check failed', err instanceof Error ? err.message : 'Please try again.')
    }
  }

  async function saveTopic() {
    const value = (topicDraft ?? currentTopic).trim()
    try {
      const row = topicRows.records[0]
      // Update the existing topic row, or create it the first time.
      if (row) await settingWrites.putConfirmed(row.recordId, { value })
      else await settingWrites.createConfirmed({ key: 'topic', value })
      setTopicDraft(null)
    } catch {
      error('Topic not saved', 'Please try again.')
    }
  }

  async function update(recordId: string, patch: Partial<QuestionData>): Promise<boolean> {
    try {
      await writes.putConfirmed(recordId, patch)
      return true
    } catch {
      error('Update failed', 'Please try again.')
      return false
    }
  }

  // Hides a question and records the reason the host picked.
  function hide(recordId: string) {
    return update(recordId, { status: 'hidden', hideReason: reasons[recordId] ?? 'other' })
  }

  // Approves a question, then emails its author. The approval stands even if
  // the email fails, and the admin is told so.
  async function approve(q: { recordId: string; createdBy: string; data: QuestionData }) {
    const saved = await update(q.recordId, { status: 'approved' })
    if (!saved) return
    const to = lookup.userMap.get(q.createdBy)?.email
    if (!to) return
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/notify/approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to, question: q.data.body }),
      })
      if (!res.ok) error('Approved, but the email failed', 'The question is on the board.')
    } catch {
      error('Approved, but the email failed', 'The question is on the board.')
    }
  }

  async function remove(recordId: string) {
    if (!window.confirm('Delete this question for good? Its votes stay in the database.')) return
    try {
      await writes.removeConfirmed(recordId)
    } catch {
      error('Delete failed', 'Please try again.')
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 text-foreground">
      <Section title="Session topic">
        <div className="flex gap-2">
          <Input
            value={topicDraft ?? currentTopic}
            onChange={(e) => setTopicDraft(e.target.value)}
            placeholder="e.g. Intro to DeepSpace, 45-minute talk"
          />
          <Button size="sm" onClick={saveTopic}>
            Save
          </Button>
        </div>
      </Section>

      <Section title={`Pending (${pending.length})`}>
        {pending.map((q) => (
          <Item key={q.recordId} body={q.data.body} meta={duplicateNote(checks[q.recordId])}>
            <Button
              size="sm"
              variant="outline"
              disabled={checks[q.recordId] === 'checking'}
              onClick={() => checkDuplicate(q)}
            >
              Check duplicate
            </Button>
            <Button size="sm" onClick={() => approve(q)}>
              Approve
            </Button>
            <ReasonSelect
              value={reasons[q.recordId] ?? 'other'}
              onChange={(r) => setReasons((prev) => ({ ...prev, [q.recordId]: r }))}
            />
            <Button size="sm" variant="outline" onClick={() => hide(q.recordId)}>
              Hide
            </Button>
          </Item>
        ))}
      </Section>

      <Section title={`Approved (${approved.length})`}>
        {approved.map((q) => (
          <Item key={q.recordId} body={q.data.body} meta={`▲ ${tallies.get(q.recordId) ?? 0}`}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update(q.recordId, { pinned: q.data.pinned === 1 ? 0 : 1 })}
            >
              {q.data.pinned === 1 ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update(q.recordId, { answered: q.data.answered === 1 ? 0 : 1 })}
            >
              {q.data.answered === 1 ? 'Unmark answered' : 'Mark answered'}
            </Button>
            <ReasonSelect
              value={reasons[q.recordId] ?? 'other'}
              onChange={(r) => setReasons((prev) => ({ ...prev, [q.recordId]: r }))}
            />
            <Button size="sm" variant="outline" onClick={() => hide(q.recordId)}>
              Hide
            </Button>
          </Item>
        ))}
      </Section>

      <Section title={`Hidden (${hidden.length})`}>
        {hidden.map((q) => (
          <Item key={q.recordId} body={q.data.body} meta={`Reason: ${q.data.hideReason || 'not given'}`}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update(q.recordId, { status: 'approved', hideReason: '' })}
            >
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(q.recordId)}>
              Delete
            </Button>
          </Item>
        ))}
      </Section>
    </div>
  )
}

function ReasonSelect({ value, onChange }: { value: HideReason; onChange: (r: HideReason) => void }) {
  return (
    <select
      aria-label="Reason for hiding"
      value={value}
      onChange={(e) => onChange(e.target.value as HideReason)}
      className="rounded-md border border-border bg-background px-2 text-sm"
    >
      {HIDE_REASONS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  )
}

function duplicateNote(check: 'checking' | { match: string | null } | undefined): string | undefined {
  if (check === undefined) return undefined
  if (check === 'checking') return 'Checking for duplicates…'
  if (check.match === null) return 'No duplicate found (AI suggestion)'
  return `Possible duplicate of: "${check.match}" (AI suggestion, you decide)`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Item({ body, meta, children }: { body: string; meta?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-sm">{body}</p>
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
