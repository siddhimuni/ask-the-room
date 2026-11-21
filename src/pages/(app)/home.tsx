/**
 * The question board. Visitors see approved questions; signed-in members can
 * ask, vote, and delete their own questions.
 */

import { useState, type FormEvent } from 'react'
import { AuthOverlay, getAuthToken, useAuthProfileReady, useMutations, usePresence, useQuery } from 'deepspace'
import { Button, Textarea, useToast } from '@/components/ui'
import { APP_NAME } from '../../constants'
import {
  findMyVote,
  sortBoard,
  tallyVotes,
  type QuestionData,
  type SettingData,
  type VoteData,
} from '../../lib/board'

const MAX_LENGTH = 280

export default function BoardPage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const { error } = useToast()
  const [draft, setDraft] = useState('')
  const [showAuth, setShowAuth] = useState(false)

  const questions = useQuery<QuestionData>('questions', {
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const votes = useQuery<VoteData>('votes')
  const topicRows = useQuery<SettingData>('settings', { where: { key: 'topic' } })
  const presence = usePresence()
  const onlineCount = presence.users.filter((u) => presence.isOnline(u.id)).length
  const topicText = topicRows.records[0]?.data.value
  // Members may only send `body` when asking a question (see questions-schema.ts).
  const questionWrites = useMutations<Pick<QuestionData, 'body'>>('questions')
  const voteWrites = useMutations<Pick<VoteData, 'questionId'>>('votes')

  const me = user?.id
  const approved = questions.records.filter((q) => q.data.status === 'approved')
  const myPending = me
    ? questions.records.filter((q) => q.createdBy === me && q.data.status !== 'approved')
    : []
  const tallies = tallyVotes(votes.records)
  const board = sortBoard(approved, tallies)

  async function ask(e: FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    try {
      await questionWrites.createConfirmed({ body })
      setDraft('')
      notifyHost(body)
    } catch {
      error('Question not posted', 'Check the length and try again.')
    }
  }

  // Emails the host that a question arrived. Best-effort: the question is already posted.
  async function notifyHost(question: string) {
    try {
      const token = await getAuthToken()
      await fetch('/api/notify/new-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question }),
      })
    } catch {
      // Ignored on purpose: a failed alert shouldn't look like a failed question.
    }
  }

  async function toggleVote(questionId: string) {
    if (!me) {
      setShowAuth(true)
      return
    }
    const existing = findMyVote(votes.records, questionId, me)
    try {
      if (existing) await voteWrites.removeConfirmed(existing.recordId)
      else await voteWrites.createConfirmed({ questionId })
    } catch {
      error('Vote not saved', 'Please try again.')
    }
  }

  async function deleteQuestion(recordId: string) {
    try {
      await questionWrites.removeConfirmed(recordId)
    } catch {
      error('Could not delete', 'Only the author can delete this question.')
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 text-foreground">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{APP_NAME}</h1>
          {topicText && <p className="text-sm text-muted-foreground">{topicText}</p>}
        </div>
        <span className="text-xs text-muted-foreground">{onlineCount} online</span>
        {!isSignedIn && (
          <Button size="sm" onClick={() => setShowAuth(true)}>
            Sign in to ask
          </Button>
        )}
      </header>

      {isSignedIn && (
        <form onSubmit={ask} className="flex flex-col gap-2">
          <Textarea
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder="Ask a question"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {draft.length}/{MAX_LENGTH}
            </span>
            <Button type="submit" size="sm" disabled={!questionWrites.ready || !draft.trim()}>
              Post question
            </Button>
          </div>
        </form>
      )}

      {questions.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}

      {isSignedIn && myPending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Waiting for review</h2>
          {myPending.map((q) => (
            <div key={q.recordId} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <p className="text-sm">{q.data.body}</p>
              <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q.recordId)}>
                Delete
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        {board.length === 0 && questions.status !== 'loading' && (
          <p className="text-sm text-muted-foreground">No approved questions yet.</p>
        )}
        {board.map((q) => {
          const count = tallies.get(q.recordId) ?? 0
          const voted = !!me && !!findMyVote(votes.records, q.recordId, me)
          return (
            <div key={q.recordId} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Button
                size="sm"
                variant={voted ? 'default' : 'outline'}
                aria-pressed={voted}
                onClick={() => toggleVote(q.recordId)}
              >
                ▲ {count}
              </Button>
              <div className="flex-1">
                <p className="text-sm">{q.data.body}</p>
                <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                  {q.data.pinned === 1 && <span>Pinned</span>}
                  {q.data.answered === 1 && <span>Answered</span>}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}
