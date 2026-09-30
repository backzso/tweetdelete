# Delete All Your Tweets on X (Twitter) — Free Browser Script

**Bulk-delete all your tweets, replies, mentions, and retweets on X (formerly Twitter) for free.**
No app to install, no API key, no paid service — just one script you copy and paste into your browser's
developer console. It runs entirely in your browser using your own logged-in session, so nothing ever
leaves your machine.

> ⚠️ Deletion is **permanent and irreversible**. Download your archive first (see below) so you keep a backup.

## Features

- 🗑️ **Delete all tweets, replies, and retweets** in one run
- 🆓 **Completely free** — no subscription, no third-party service like TweetDelete or Circleboom
- 🔒 **Private** — no login/password required, nothing leaves your browser
- 📦 **Archive mode** to wipe your *entire* history, including tweets too old to load in the timeline
- ⏱️ **Smart rate-limit handling** — waits out X's limits automatically and resumes
- 🔁 **Safe to re-run** — already-deleted tweets are skipped

## How it works

The script authenticates with the `ct0` CSRF cookie already present in your logged-in session and calls
X's own GraphQL mutations — `DeleteTweet` and `DeleteRetweet` — the same endpoints the website uses.
This is much faster than clicking through the UI and doesn't depend on scraping the page layout.

It offers two modes:

| Mode | Pick | What it does |
|---|---|---|
| **Timeline** | Cancel | Deletes everything on the profile tab you're on — your tweets, replies or retweets. Quick to start, but X only renders a limited number of tweets at a time, so refresh (F5) and re-run until the tab is empty. |
| **Archive** | OK | You select your data archive's `tweets.js` file and **every** tweet in it is deleted — oldest tweets included. This is the only way to guarantee a complete wipe, since the timeline never renders your full history. |

## Usage

1. Log in to **x.com** in your browser.
2. Open your profile and pick the tab you want to clean — the script deletes whatever that tab shows:
   - **Posts** → your tweets
   - **Replies** → your replies
   - **Reposts** → your retweets (unretweeted)
3. Open the DevTools console (macOS: `Cmd+Option+J`, Windows/Linux: `F12` → Console).
   Chrome may ask you to type `allow pasting` the first time.
4. Copy the entire contents of [`delete-tweets.js`](delete-tweets.js), paste into the console, press Enter.
5. Choose a mode in the dialog.

Stop at any time by typing `STOP_DELETE = true` in the console. To clean another tab, switch to it and
run the script again.

## Automatic mode (userscript)

Prefer a "set it and forget it" cleanup? Install [`tweetdelete.user.js`](tweetdelete.user.js) with
[Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey. Whenever you open your own profile on
x.com, it reads your tweet count and — once it crosses a threshold (default **1000**) — asks whether to
delete your tweets, replies, and retweets. **It never deletes silently; you always confirm first.**

- Runs entirely in your browser session — no stored cookies, no API key, no server.
- It only runs while you have x.com open (there is no unattended/headless mode by design: that would
  require storing your login token, which is a security risk and trips X's bot detection).
- Configure `THRESHOLD`, `ONLY_HANDLES`, and pacing at the top of the file.

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
| `SCROLL_DELAY_MS` | `1500` | Wait at the end of the list for X to load more tweets (timeline mode). |
| `MAX_IDLE_SCROLLS` | `12` | Stop after this many scrolls with no new tweets. |
| `X_CLIENT_TRANSACTION_ID` / `X_CLIENT_UUID` | `''` | Only needed if the API returns `404/403`; grab them from a request's headers in the Network tab. |

## Notes

- Re-running is safe: already-deleted tweets are detected and skipped.
- Retweets in the archive are stored under their own id and removed via `DeleteTweet`; if any remain,
  a single timeline-mode pass cleans them up.
- **Likes** are out of scope — happy to add a likes pass if needed.
- This relies on X's current internal API. If X changes it, the query IDs or headers may need updating.

## FAQ

**How do I delete all my tweets at once for free?**
Open your profile on x.com, paste [`delete-tweets.js`](delete-tweets.js) into the browser console, and pick
timeline or archive mode. In timeline mode, run it once on each tab (Posts, Replies, Reposts). No paid tool required.

**How do I delete old tweets that no longer show up?**
X's timeline only loads recent tweets. Use **archive mode** with your downloaded `tweets.js` file to
delete your complete history, including years-old tweets.

**Can I mass-delete retweets and replies too?**
Yes. Run timeline mode on the **Replies** tab for replies and on the **Reposts** tab for retweets, or use
archive mode to remove all of them in one run.

**Is it safe / will I get banned?**
It uses X's own internal endpoints with your existing session and respects rate limits, so it behaves like
normal usage. It only ever touches your own account. Still, use at your own risk.

**Do I need the Twitter/X API or a developer account?**
No. The official `DELETE /2/tweets` endpoint is far more rate-limited; this script is faster and needs no
API key.

## Keywords

delete all tweets · mass delete tweets · bulk delete tweets · delete tweets free · how to delete all
tweets on X · delete old tweets · Twitter cleanup · X cleanup · unretweet all · delete retweets · delete
replies · TweetDelete alternative · Circleboom alternative · browser console tweet deleter

## Disclaimer

For managing **your own** account only. Use at your own risk; the author is not responsible for data loss.
