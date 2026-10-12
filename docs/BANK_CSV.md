# Question bank CSV import and export

Every bank on the **Question banks** screen can be taken out as a CSV and brought back in from
one. Imports are staged for review first — nothing reaches the bank until you confirm — and
questions without an answer key can be filled in by Google Gemini (server-side) or by you.

## The columns

A file needs a header row with these columns (extra columns are ignored):

| Column              | Required | What it holds                                                              |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `question`          | yes      | The question itself, up to 120 characters.                                 |
| `option1`–`option4` | yes      | The four options, each up to 40 characters, all different.                 |
| `answer`            | no       | The correct option: its exact text, or the letter `A`–`D`.                 |
| `explanation`       | no       | Why it’s the answer, up to 160 characters. Add one during review if blank. |
| `reference`         | no       | An optional source note, up to 60 characters.                              |

Header names are forgiving about case and spacing: `Option 1`, `option-1` and `option_1` are
one column, and `prompt`, `choice_1`–`choice_4` and `correct_answer` are accepted as aliases
for `question`, `option1`–`option4` and `answer`. A starter file lives at
[`bank-import-template.csv`](./bank-import-template.csv).

Limits: up to **1,000 rows** per file, about **1 MB** of text, and a bank can hold **1,000
questions** in total (the import checks what’s already there before it starts).

## What happens to each row

- **The answer matches an option** (its text exactly, or the letter A–D): the row is ready
  straight away, marked “from your answer key”.
- **The answer is blank, or doesn’t match an option**: the row waits for an answer — from the
  AI if it’s set up (below), or from you in the review. Every row with an `answer` that
  matches more than one option is held for you to settle.
- **A row is broken** (empty question or option, over the length caps, the same question
  twice in one file): it isn’t staged at all. The upload response lists what was wrong, by
  line number, so one bad line never costs the whole file.

Review shows counts (total, ready, from your key, from the AI, needing review) and only the
rows that need your eye. You can accept the AI’s flagged answers in one go, set many rows to
the same answer at once, or fix a row by picking its option and explanation. The bank only
changes when you confirm — and then all of the staged questions land together, in the file’s
order, or none of them do.

## AI answers for rows without a key

The server answers key-less rows with **Google Gemini**, in batches of 20 questions per call,
one call per request (the banks page loops until the import is done). The model never changes
what you uploaded: it only suggests which option is right, plus a short explanation when your
file didn’t have one. Anything it isn’t sure about, or gets back wrong, comes back flagged
for your review — an AI answer is never written into the bank without passing through review
when it’s flagged, and never replaces an answer your file already had.

**Setting it up** (Cloudflare Workers):

```sh
cd apps/server
npx wrangler secret put GEMINI_API_KEY   # a Google AI Studio API key
```

The model comes from the `GEMINI_MODEL` variable in `wrangler.jsonc` (defaults to
`gemini-2.5-flash` if unset). Without a key, everything else still works: keyed imports are
unaffected, and key-less rows are simply left for you to answer in the review.

**What you’ll see when things go wrong:** a busy key comes back as “The answer service is
busy” and the page tries again on its own; a failed or malformed answer marks those rows for
you instead of guessing; the staged import is kept either way — AI trouble never loses a row.

## Export

**Export CSV** downloads the bank in the same shape: `question,option1,option2,option3,option4,answer,explanation,reference`,
with the correct answer first among the options and repeated in the `answer` column, cells
quoted the way spreadsheets expect. Importing an exported file preserves every answer — the
round trip is safe.

Unfinished imports are drafts: one per bank, kept for 24 hours, picked up again if you close
the page. **Discard import** throws a draft away without touching the bank.
