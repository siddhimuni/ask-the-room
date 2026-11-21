/**
 * Moderator page: approve, hide, pin, and mark questions answered.
 * Only admins can change status, pinned, and answered (see questions-schema.ts).
 */

import { useState, type ReactNode } from 'react'
import { useAuthProfileReady, useMutations, useQuery } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import {
  sortBoard,
  tallyVotes,
  type QuestionData,
  type SettingData,
  type VoteData,
} from '../../../lib/board'

export default function ModeratePage() {
  const { user } = useAuthProfileReady({ requireUser: true })
  const { error } = useToast()
  const questions = useQuery<QuestionData>('questions', { orderBy: 'createdAt', orderDir: 'asc' })
  const votes = useQuery<VoteData>('votes')
  const writes = useMutations<Partial<QuestionData>>('questions')
  const topicRows = useQuery<SettingData>('settings', { where: { key: 'topic' } })
  const settingWrites = useMutations<SettingData>('settings')
  const [topicDraft, setTopicDraft] = useState<string | null>(null)
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

  async function update(recordId: string, patch: Partial<QuestionData>) {
    try {
      await writes.putConfirmed(recordId, patch)
    } catch {
      error('Update failed', 'Please try again.')
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
          <Item key={q.recordId} body={q.data.body}>
            <Button size="sm" onClick={() => update(q.recordId, { status: 'approved' })}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => update(q.recordId, { status: 'hidden' })}>
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
            <Button size="sm" variant="outline" onClick={() => update(q.recordId, { status: 'hidden' })}>
              Hide
            </Button>
          </Item>
        ))}
      </Section>

      <Section title={`Hidden (${hidden.length})`}>
        {hidden.map((q) => (
          <Item key={q.recordId} body={q.data.body}>
            <Button size="sm" variant="outline" onClick={() => update(q.recordId, { status: 'approved' })}>
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
