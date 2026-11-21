# Ask the Room

A live Q&A board for one session, such as a talk or workshop. Attendees ask
questions and upvote them. The host approves questions, pins the one being
discussed, and marks others answered. Built on the [DeepSpace](https://docs.deep.space)
SDK.

## What it does

- **Visitors** (not signed in) can read the session topic and approved questions, and see how many people are online.
- **Members** (signed in) can ask a question (up to 280 characters), upvote questions (one vote each), and delete their own questions.
- **Admins** (the host) can approve, hide, restore, or delete questions, pin one, mark it answered, and set the session topic. When hiding, the host picks a reason (duplicate, abusive, off-topic, or other), which the Hidden list shows.
- **Duplicate check** (admins only): on a pending question, Claude Haiku compares it with the approved questions and suggests a match. The host decides whether to hide it.
- **Email notifications:** when the host approves a question, its author gets an email. When a new question is posted, the host gets an email with a link to the moderator page.

## How the DeepSpace features are used

| Feature | Where | What it does |
|---|---|---|
| Records and schemas | `src/schemas/questions-schema.ts`, `votes-schema.ts`, `admin-schema.ts` | Three collections: questions, votes, and settings (the topic) |
| Real-time sync | `src/pages/(app)/home.tsx`, `moderate.tsx` | Questions, votes, and the topic update in every open window |
| Permissions | Each schema's `permissions` block | Visitors, members, and admins can each do different things |
| Field protection | `writableFields` in `questions-schema.ts` | Members can only set the question text, not its status or hide reason |
| Vote integrity | `uniqueOn` and `userBound` in `votes-schema.ts` | One vote per person per question, and the server sets the voter |
| Sign-in | `(protected)` route folder and `useAuthProfileReady` | The moderator page requires sign-in and an admin role |
| Presence | `usePresence` in `home.tsx` | Shows how many people are online |
| Hide reasons | `hideReason` in `questions-schema.ts`, `moderate.tsx` | The host records why a question was hidden. Only admins can write it |

## Outside services (catalog integrations)

These are services from the DeepSpace integrations catalog. Each call is billed to the app owner's account.

| Integration | Where | What it does |
|---|---|---|
| `email/send` | `src/server/notify-route.ts` | Emails the author when a question is approved, and emails the host when a question arrives. The host's address is the `ADMIN_NOTIFY_EMAIL` secret. About $0.013 per email |
| `anthropic/chat-completion` | `src/server/duplicates-route.ts` | Claude Haiku checks whether a pending question repeats an approved one. A fraction of a cent per check |

That's two catalog integrations. We considered Slack for host alerts, but dropped it in favor of email. No other catalog service fit a Q&A board, so we didn't add one just to reach three.

## Project layout

- `src/schemas/`: the collections and their rules
- `src/lib/board.ts`: vote counting and board order. Pure functions, no SDK, so it's easy to test
- `src/lib/board.test.ts`: unit tests for `board.ts`
- `src/pages/(app)/home.tsx`: the board
- `src/pages/(app)/(protected)/moderate.tsx`: the moderator page, at `/moderate`
- `src/server/duplicates-route.ts`: the admin-only duplicate check route, `POST /api/duplicates`
- `src/server/notify-route.ts`: the email routes, `POST /api/notify/approved` and `POST /api/notify/new-question`

## Run it locally

```sh
npm install
npx deepspace auth login    # first time only
npx deepspace dev start     # opens http://localhost:5173
```

## Tests

```sh
npm run type-check      # TypeScript checks
npx vitest run          # unit tests for the board logic (12 tests)
npx deepspace test run  # smoke and API tests against a local server (8 tests)
```

The three multi-user tests in `tests/collab.spec.ts` need two test accounts and
are skipped by default. The manual checks below cover the same behavior.

## Live test results

Deployed at https://ask-the-room.app.space. Checked by hand with four people
on separate accounts and windows: a visitor (signed out), the admin, and two
members. The checklist covered every feature below, and all items passed.

| Area | What was checked | Result |
|---|---|---|
| Visitor view | Topic and approved questions show; no ask form; votes prompt sign-in; `/moderate` is blocked | Pass |
| Member view | Form and 280-character counter; empty post is disabled; new questions go to "Waiting for review" only; a member can delete only their own pending question; votes update live | Pass |
| Approval and real-time sync | An approved question reaches every open window without a refresh; votes update everywhere | Pass |
| Admin moderation | Topic save; approve, hide, restore; pin and unpin; mark and unmark answered; hide then delete, with a confirm step that can be cancelled | Pass |
| Member restrictions | Members can't moderate, can't see another member's pending question, and can't delete approved questions | Pass |
| Persistence and presence | Questions and votes survive closing all windows and signing in again; "2 online" with two accounts; count drops on sign-out | Pass |
| Email notifications | Author gets the approval email; host gets the new-question email (both received on the live site) | Pass |
| Duplicate check (Claude Haiku) | Flags a repeat of an approved question; "No duplicate found" for an unrelated one | Pass on the local site; live re-test pending deploy |
| Hide reasons | Hidden list shows the reason chosen when hiding | Pass on the local site; live re-test pending deploy |

## Tradeoffs and known gaps

- **One session per app.** The topic is a single setting, so running a second
  topic means a second deployment. A sessions table would support many topics
  in one app, but adds complexity.
- **Deleting a question leaves its votes behind.** The board ignores orphaned
  votes, but they aren't cleaned up.
- **Votes aren't limited to approved questions.** A member who knows a pending
  question's ID could vote on it. The board doesn't show it, so the effect is
  limited.
- **No rate limiting or automatic content filter.** A signed-in person can post
  many questions. The host's moderation queue is the only filter. An AI content
  check would only flag questions for the host, not hide them.
- **Admin role is set by the app owner.** There's no in-app way to promote a
  member to admin yet.
- **The duplicate check costs a little money.** Each click is one small call to
  Claude Haiku, billed to the app owner's account. A test call cost $0.0000044.
  It runs only when the admin clicks, so the cost stays small and predictable.
- **The duplicate check is a suggestion.** The model can miss a match or flag a
  question that is only close, so the host always decides. Questions that
  overlap but ask different things can go either way.
- **The duplicate check trusts the approved list from the browser.** Only
  admins can call the route, so the risk is limited to the admin's own view. If
  members could call it, the server would need to load the approved questions
  itself.
- **No merge.** When a duplicate is hidden, its votes don't move to the
  original question.
- **Any signed-in member can trigger the host email.** Each new question costs
  the owner about $0.013, and there's no rate limit yet. A daily digest or a
  per-user limit would fix this.
- **Restoring a hidden question doesn't email its author.** Only approval
  sends the author an email, so the author doesn't get repeat emails.
- **Hide reasons are chosen by the host, not verified.** They record the host's
  judgment, so an AI flag would need to be stored by the admin's own action to
  be saved.
