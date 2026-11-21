# Ask the Room: submission writeup

Written for: the DeepSpace reviewers, who will read this alongside the repository.

Live app: https://ask-the-room.app.space
Repository: https://github.com/siddhimuni/ask-the-room

## What I built

Ask the Room is a live Q&A board for one session, such as a talk or workshop.
Visitors can read the topic and approved questions. Signed-in members can ask
questions and upvote them. The host, who is the app owner and an admin, works
from a moderation page to approve, hide, restore, or delete questions, pin one,
mark questions answered, and set the session topic.

I chose this scope because it's small enough to finish and test in five days,
but it still has real multi-user behavior: roles, a moderation queue, live
updates across windows, and presence. The README has the feature list and the
tradeoffs in more detail.

## DeepSpace features used

- **Records and schemas:** three collections (questions, votes, and settings for
  the topic). The questions table also has a `hideReason` field.
- **Permissions:** each role has its own rules. Visitors read approved questions.
  Members can create questions and delete only their own pending ones. Only
  admins change status, pinning, answered state, and hide reasons.
- **Field protection:** members can set only the question text (`writableFields`).
- **Vote integrity:** `uniqueOn` plus `userBound` gives one vote per person per
  question, and the server sets the voter.
- **Real-time sync:** questions, votes, and the topic update in every open window
  without a refresh.
- **Presence:** the header shows how many signed-in people are online.
- **Sign-in and roles:** the moderator page sits behind sign-in and an admin check.
- **Server routes on the Worker:** the Worker checks the caller's identity and role
  before any outside call.

## Outside services (catalog integrations)

- **`email/send`:** emails an author when the host approves their question, and
  emails the host when a new question arrives. The host's address is a secret.
- **`anthropic/chat-completion`:** Claude Haiku checks whether a pending question
  repeats an approved one. The host sees the result as a suggestion.

That's two catalog integrations, plus the SDK features above. I considered Slack
for host alerts and dropped it, because email covers the same need without another
token to manage. No other catalog service fit a Q&A board, so I didn't add one just
to reach three.

## Main tradeoff

**The host stays in charge of moderation, and nothing is hidden automatically.**
New questions wait in a Pending queue. The AI duplicate check is a suggestion, and
an abuse check (planned, not built) would only flag questions. The cost is that a
bad question still needs a person to notice it, and a member can post many
questions. I accepted that because automatic hiding would make real questions
disappear with no explanation. The README lists the cost risk: each new question
triggers a host email that the owner pays for, with no rate limit yet.

## What the agent did

I used Claude Code. I directed the work and checked each step:

- **Agent:** wrote most of the code, the schema and permission rules, the tests,
  and the README drafts, following plans I approved one step at a time. It also
  proposed the duplicate-check and email designs, which I reviewed.
- **Me:** chose the idea and scope, ran the scaffold, deploy, and secret commands
  myself, tested the live app with four people on separate accounts, and decided
  what to keep or drop.
- **Mistakes the agent made, and how they were caught:** the duplicate check first
  called the browser's wrong API address, and its answers were all "no match,"
  most likely because a token limit was too small for a reasoning model. I caught
  both when testing.
  The agent also wrote a README line saying multi-user checks had been done before
  they were; I caught that and corrected it.

## What I verified myself

- **Type-check:** passes.
- **Unit tests:** 12 pass across 3 files (board logic and template tests).
- **Playwright smoke and API tests:** 8 pass.
- **Live checklist:** 31 items covering visitor, member, admin, presence,
  persistence, and the duplicate check, run by hand on the live site with four
  people on separate accounts. All passed.
- **Email:** both emails arrived on the live site.
- **Claude duplicate check:** passes on the live site.
- **Hide reasons:** pass on the local site.

## What is not verified or left out

- **Three multi-user Playwright tests are skipped.** They need two test accounts.
  The manual checklist covers the same behavior.
- **Hide reasons were not re-checked on the live site** after the latest deploy.
  They passed locally.
- **The AI duplicate check was tested on a handful of questions,** not measured
  for accuracy.
- **Known gaps:** deleting a question leaves its votes behind. Votes aren't
  limited to approved questions. Admin promotion has no in-app UI. There is no
  merge for duplicates, and no rate limit on the email alerts.

## What I would do next

1. Add a rate limit or a daily digest for host emails.
2. Store the AI flag on each question, so the host sees it in the queue.
3. Add row-level permissions, so settings can't be read by everyone.
4. Run the multi-user tests with test accounts.
5. Add an in-app way for the owner to promote admins.
