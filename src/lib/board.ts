/**
 * Pure board logic: vote counts and ordering. No SDK imports, so it can be
 * unit tested in Node without a running app.
 */

export type QuestionStatus = 'pending' | 'approved' | 'hidden'

export interface QuestionData {
  body: string
  status: QuestionStatus
  /** 0 or 1 */
  answered: number
  /** 0 or 1 */
  pinned: number
}

export interface VoteData {
  questionId: string
  voterId: string
}

/** A key/value row in the settings table. The session topic uses key "topic". */
export interface SettingData {
  key: string
  value: string
}

/** The shape the SDK returns for each row. */
export interface Row<T> {
  recordId: string
  createdAt: string
  data: T
}

/** Count votes per question ID. */
export function tallyVotes(votes: ReadonlyArray<Pick<Row<VoteData>, 'data'>>): Map<string, number> {
  const tallies = new Map<string, number>()
  for (const v of votes) {
    tallies.set(v.data.questionId, (tallies.get(v.data.questionId) ?? 0) + 1)
  }
  return tallies
}

/**
 * Board order: pinned first, then unanswered before answered, then most
 * votes, then oldest first. Returns a new array and leaves the input alone.
 */
export function sortBoard<T extends Row<QuestionData>>(
  questions: ReadonlyArray<T>,
  tallies: ReadonlyMap<string, number>,
): T[] {
  return [...questions].sort((a, b) => {
    const pinned = Number(b.data.pinned) - Number(a.data.pinned)
    if (pinned !== 0) return pinned

    const answered = Number(a.data.answered) - Number(b.data.answered)
    if (answered !== 0) return answered

    const votes = (tallies.get(b.recordId) ?? 0) - (tallies.get(a.recordId) ?? 0)
    if (votes !== 0) return votes

    return a.createdAt.localeCompare(b.createdAt)
  })
}

/** The vote this person cast on this question, if any. */
export function findMyVote<T extends Row<VoteData>>(
  votes: ReadonlyArray<T>,
  questionId: string,
  voterId: string,
): T | undefined {
  return votes.find((v) => v.data.questionId === questionId && v.data.voterId === voterId)
}
