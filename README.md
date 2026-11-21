# Ask the Room

A live Q&A board for one session, such as a talk or workshop. Attendees ask
questions and upvote them. The host approves questions, pins the one being
discussed, and marks others answered. Built on the [DeepSpace](https://docs.deep.space)
SDK.

## What it does

- **Visitors** (not signed in) can read the session topic and approved questions, and see how many people are online.
- **Members** (signed in) can ask a question (up to 280 characters), upvote questions (one vote each), and delete their own questions.
- **Admins** (the host) can approve, hide, or restore questions, pin one, mark it answered, and set the session topic.

## How the DeepSpace features are used

| Feature | Where | What it does |
|---|---|---|
| Records and schemas | `src/schemas/questions-schema.ts`, `votes-schema.ts`, `admin-schema.ts` | Three collections: questions, votes, and settings (the topic) |
| Real-time sync | `src/pages/(app)/home.tsx`, `moderate.tsx` | Questions, votes, and the topic update in every open window |
| Permissions | Each schema's `permissions` block | Visitors, members, and admins can each do different things |
| Field protection | `writableFields` in `questions-schema.ts` | Members can only set the question text, not its status |
| Vote integrity | `uniqueOn` and `userBound` in `votes-schema.ts` | One vote per person per question, and the server sets the voter |
| Sign-in | `(protected)` route folder and `useAuthProfileReady` | The moderator page requires sign-in and an admin role |
| Presence | `usePresence` in `home.tsx` | Shows how many people are online |

## Project layout

- `src/schemas/`: the collections and their rules
- `src/lib/board.ts`: vote counting and board order. Pure functions, no SDK, so it's easy to test
- `src/lib/board.test.ts`: unit tests for `board.ts`
- `src/pages/(app)/home.tsx`: the board
- `src/pages/(app)/(protected)/moderate.tsx`: the moderator page, at `/moderate`

## Run it locally

```sh
npm install
npx deepspace auth login    # first time only
npx deepspace dev start     # opens http://localhost:5173
```

## Tests

```sh
npm run type-check   # TypeScript checks
npx vitest run       # unit tests for the board logic
```

## Live test results

Deployed at https://ask-the-room.app.space. Checked by hand with three windows:
the admin signed in, a member signed in on a second account, and a private
window that isn't signed in.

| Check | Result |
|---|---|
| Visitor view shows the topic and approved questions, with no ask form | Pass |
| Member posts a question; it appears under "Waiting for review" only | Pass |
| Admin approves a question; it appears on the board in every open window, without a refresh | Pass |
| Votes and unvotes update every open window | Pass |
| Admin pins and marks answered; both labels update in every window | Pass |
| Member opening `/moderate` sees "Only moderators can open this page." | Pass |
| Member deletes their own pending question | Pass |
| Admin hides and then deletes an answered question; it disappears from the visitor and member pages | Pass |
| Presence shows "2 online" with two signed-in accounts | Pass |
| Cancelling the delete confirmation leaves the question in place | Pass |
| Questions and votes are still there after closing all windows and signing in again | Pass |

## Tradeoffs and known gaps

- **One session per app.** The topic is a single setting, so running a second
  topic means a second deployment. A sessions table would support many topics
  in one app, but adds complexity.
- **Deleting a question leaves its votes behind.** The board ignores orphaned
  votes, but they aren't cleaned up.
- **Votes aren't limited to approved questions.** A member who knows a pending
  question's ID could vote on it. The board doesn't show it, so the effect is
  limited.
- **No rate limiting or content filter.** A signed-in person can post many
  questions. The host's moderation queue is the only filter.
- **Admin role is set by the app owner.** There's no in-app way to promote a
  member to admin yet.
