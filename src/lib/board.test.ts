import { describe, expect, it } from 'vitest'
import { findMyVote, sortBoard, tallyVotes, type QuestionData, type Row, type VoteData } from './board'

function q(id: string, createdAt: string, patch: Partial<QuestionData> = {}): Row<QuestionData> {
  return {
    recordId: id,
    createdAt,
    data: { body: `question ${id}`, status: 'approved', answered: 0, pinned: 0, ...patch },
  }
}

function v(questionId: string, voterId: string): Row<VoteData> {
  return {
    recordId: `${questionId}-${voterId}`,
    createdAt: '2026-11-20T00:00:00Z',
    data: { questionId, voterId },
  }
}

describe('tallyVotes', () => {
  it('counts votes per question', () => {
    const tallies = tallyVotes([v('a', 'u1'), v('a', 'u2'), v('b', 'u1')])
    expect(tallies.get('a')).toBe(2)
    expect(tallies.get('b')).toBe(1)
    expect(tallies.get('c')).toBeUndefined()
  })

  it('returns an empty map when there are no votes', () => {
    expect(tallyVotes([]).size).toBe(0)
  })
})

describe('sortBoard', () => {
  it('puts pinned questions first, even with fewer votes', () => {
    const questions = [q('a', '2026-01-01'), q('b', '2026-01-02', { pinned: 1 })]
    const tallies = new Map([['a', 10]])
    expect(sortBoard(questions, tallies).map((x) => x.recordId)).toEqual(['b', 'a'])
  })

  it('puts unanswered questions before answered ones', () => {
    const questions = [q('answered-popular', '2026-01-01', { answered: 1 }), q('open', '2026-01-02')]
    const tallies = new Map([['answered-popular', 50]])
    expect(sortBoard(questions, tallies).map((x) => x.recordId)).toEqual(['open', 'answered-popular'])
  })

  it('orders by votes, highest first, within the same group', () => {
    const questions = [q('low', '2026-01-01'), q('high', '2026-01-02')]
    const tallies = new Map([
      ['low', 1],
      ['high', 5],
    ])
    expect(sortBoard(questions, tallies).map((x) => x.recordId)).toEqual(['high', 'low'])
  })

  it('breaks vote ties by oldest first', () => {
    const questions = [q('newer', '2026-01-03'), q('older', '2026-01-01')]
    expect(sortBoard(questions, new Map()).map((x) => x.recordId)).toEqual(['older', 'newer'])
  })

  it('does not change the list it is given', () => {
    const questions = [q('b', '2026-01-02'), q('a', '2026-01-01')]
    sortBoard(questions, new Map())
    expect(questions.map((x) => x.recordId)).toEqual(['b', 'a'])
  })
})

describe('findMyVote', () => {
  const votes = [v('a', 'me'), v('a', 'other'), v('b', 'other')]

  it('finds the signed-in person’s vote on a question', () => {
    expect(findMyVote(votes, 'a', 'me')?.recordId).toBe('a-me')
  })

  it('returns undefined when that person has not voted on the question', () => {
    expect(findMyVote(votes, 'b', 'me')).toBeUndefined()
  })
})
