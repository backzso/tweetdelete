# X (Twitter) Bulk Delete

A single browser-console script that deletes your **tweets, replies (mentions), and retweets** on X.
It calls X's internal GraphQL API using your existing session — no login credentials, no third-party
service, nothing leaves your browser.

> ⚠️ Deletion is **permanent and irreversible**. Download your archive first (see below) so you keep a backup.

## How it works

The script authenticates with the `ct0` CSRF cookie already present in your logged-in session and calls
X's own GraphQL mutations — `DeleteTweet` and `DeleteRetweet` — the same endpoints the website uses.
This is much faster than clicking through the UI and doesn't depend on scraping the page layout.

It offers two modes:

| Mode | Pick | What it does |
|---|---|---|
| **Timeline** | Cancel | Scrolls your profile page and deletes every visible tweet / reply / retweet. Quick to start, but X only renders a limited number of tweets at a time, so refresh (F5) and re-run until the profile is empty. |
| **Archive** | OK | You select your data archive's `tweets.js` file and **every** tweet in it is deleted — oldest tweets included. This is the only way to guarantee a complete wipe, since the timeline never renders your full history. |

## Usage

1. Log in to **x.com** in your browser.
2. Go to `https://x.com/YOUR_USERNAME/with_replies`.
3. Open the DevTools console (macOS: `Cmd+Option+J`, Windows/Linux: `F12` → Console).
   Chrome may ask you to type `allow pasting` the first time.
4. Copy the entire contents of [`delete-tweets.js`](delete-tweets.js), paste into the console, press Enter.
5. Choose a mode in the dialog.

Stop at any time by typing `STOP_DELETE = true` in the console.

## Getting your archive (for Archive mode)

X → **Settings → Your account → Download an archive of your data**. It can take a few hours to prepare;
when the email arrives, download and unzip it, then select `data/tweets.js` when the script asks.

## Rate limits

X enforces deletion limits **server-side, per account** — they can't be bypassed by any client-side trick
(headers, session rotation, VPN, etc.), and manual deletion draws from the same quota. When the limit is
hit, the script reads X's `x-rate-limit-reset` header and waits exactly until the window resets, then
resumes on its own. Just leave the tab open.

Two pacing strategies are available via the `SMOOTH_PACING` flag in the script:

- **`false` (default)** — delete at full speed, then wait for the window to reset. Fastest to complete.
- **`true`** — spread deletes evenly across each window so you never see a `429`. Same total throughput,
  gentler on X's anti-abuse heuristics.

## Configuration

All options live at the top of [`delete-tweets.js`](delete-tweets.js):

| Option | Default | Purpose |
|---|---|---|
| `DELETE_DELAY_MS` | `400` | Minimum delay between delete calls. |
| `SMOOTH_PACING` | `false` | Pace deletions to avoid `429`s (see above). |
| `SCROLL_DELAY_MS` | `1500` | Wait after each scroll for new tweets to load (timeline mode). |
| `MAX_IDLE_SCROLLS` | `12` | Stop after this many scrolls with no new tweets. |
| `X_CLIENT_TRANSACTION_ID` / `X_CLIENT_UUID` | `''` | Only needed if the API returns `404/403`; grab them from a request's headers in the Network tab. |

## Notes

- Re-running is safe: already-deleted tweets are detected and skipped.
- Retweets in the archive are stored under their own id and removed via `DeleteTweet`; if any remain,
  a single timeline-mode pass cleans them up.
- **Likes** are out of scope — happy to add a likes pass if needed.
- This relies on X's current internal API. If X changes it, the query IDs or headers may need updating.

## Disclaimer

For managing **your own** account only. Use at your own risk; the author is not responsible for data loss.
