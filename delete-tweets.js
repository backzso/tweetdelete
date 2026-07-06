/**
 * ============================================================================
 *  X (Twitter) BULK DELETE SCRIPT
 *  Deletes your tweets + replies (mentions) + retweets.
 * ============================================================================
 *
 *  Runs in the browser console and calls X's internal GraphQL API using your
 *  existing session, so it is far faster than clicking through the UI. It works
 *  only on your own account and cannot touch anyone else's posts.
 *
 *  HOW TO USE:
 *  1. Log in to x.com in your browser.
 *  2. Go to https://x.com/YOUR_USERNAME/with_replies
 *  3. Open DevTools (Cmd+Option+J on macOS / F12 -> Console).
 *     Note: the first time you paste code, Chrome may ask you to type
 *     "allow pasting" — type it and press Enter.
 *  4. Copy the ENTIRE contents of this file, paste it into the console, Enter.
 *  5. In the dialog that appears:
 *     - "Cancel" = TIMELINE MODE: scrolls this page and deletes what is visible.
 *     - "OK"     = ARCHIVE MODE: you pick your archive's tweets.js file and
 *                  EVERY tweet in it is deleted (old tweets included, complete).
 *
 *  To stop early, type this in the console:  STOP_DELETE = true
 *
 *  ARCHIVE MODE (recommended for a full wipe):
 *  X -> Settings -> Your account -> Download an archive of your data.
 *  Preparing the archive can take a few hours. Once ready, download and unzip
 *  it, then select the data/tweets.js file when this script asks for it.
 *
 *  Rate limits are enforced server-side per account and cannot be bypassed.
 *  When the limit is hit the script reads X's x-rate-limit-reset header and
 *  waits exactly until the window resets, then resumes automatically.
 *
 *  If the internal API returns 404/403, you may need to fill in the two values
 *  below. Get them from DevTools -> Network -> Fetch/XHR: perform any action on
 *  the page (e.g. like a tweet), click the request, and copy
 *  "x-client-transaction-id" and "x-client-uuid" from the Request Headers.
 * ============================================================================
 */

(async () => {
  // ============================ SETTINGS ============================
  const DELETE_DELAY_MS = 400;   // minimum wait between delete calls (ms)
  const SMOOTH_PACING = false;   // false: delete at full speed, then wait for the window to reset (fastest)
                                 // true:  spread deletes evenly across the window so you never see a 429
  const SCROLL_DELAY_MS = 1500;  // wait after each scroll for new tweets to load (ms)
  const MAX_IDLE_SCROLLS = 12;   // stop after this many scrolls with no new tweets
  const X_CLIENT_TRANSACTION_ID = ''; // fill in only if you get 404/403 (see note above)
  const X_CLIENT_UUID = '';           // fill in only if you get 404/403
  // =================================================================

  window.STOP_DELETE = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getCookie = (name) =>
    document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))?.[2];

  if (!location.hostname.endsWith('x.com') && !location.hostname.endsWith('twitter.com')) {
    alert('Run this script on x.com.');
    return;
  }

  const csrf = getCookie('ct0');
  if (!csrf) {
    alert('No session found (ct0 cookie missing). Make sure you are logged in to x.com.');
    return;
  }

  // Public, hardcoded bearer token of X's own web client.
  const HEADERS = {
    authorization:
      'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'x-csrf-token': csrf,
    'content-type': 'application/json',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
  };
  if (X_CLIENT_TRANSACTION_ID) HEADERS['x-client-transaction-id'] = X_CLIENT_TRANSACTION_ID;
  if (X_CLIENT_UUID) HEADERS['x-client-uuid'] = X_CLIENT_UUID;

  const stats = { deleted: 0, unretweeted: 0, alreadyGone: 0, failed: 0 };
  let adaptiveDelay = DELETE_DELAY_MS; // updated from response headers when SMOOTH_PACING is on

  async function gqlPost(queryId, opName, variables) {
    let netErrors = 0;
    while (true) {
      if (window.STOP_DELETE) return { stopped: true };
      let res;
      try {
        res = await fetch(`https://x.com/i/api/graphql/${queryId}/${opName}`, {
          method: 'POST',
          headers: HEADERS,
          credentials: 'include',
          body: JSON.stringify({ variables, queryId }),
        });
      } catch (e) {
        if (++netErrors > 8) return { failed: true };
        console.warn(`Network error (attempt ${netErrors}), waiting ${10 * netErrors}s...`, e);
        await sleep(10000 * netErrors);
        continue;
      }

      const remaining = res.headers.get('x-rate-limit-remaining');

      if (res.status === 429) {
        // Wait until the exact reset time X reports, instead of guessing.
        const reset = Number(res.headers.get('x-rate-limit-reset'));
        let waitMs = reset ? reset * 1000 - Date.now() + 5000 : 15 * 60 * 1000;
        waitMs = Math.min(Math.max(waitMs, 5000), 16 * 60 * 1000);
        const until = new Date(Date.now() + waitMs).toLocaleTimeString();
        console.log(`⏳ Rate limit reached. Waiting ~${Math.ceil(waitMs / 60000)} min (until ${until})...`);
        await sleep(waitMs);
        continue;
      }

      if (remaining !== null && Number(remaining) <= 5 && Number(remaining) % 5 === 0) {
        console.log(`⚠️ ${remaining} deletions left in this window.`);
      }

      // Spread remaining deletions evenly across the window so a 429 never happens.
      if (SMOOTH_PACING && remaining !== null) {
        const rem = Number(remaining);
        const reset = Number(res.headers.get('x-rate-limit-reset'));
        const msLeft = reset ? reset * 1000 - Date.now() : 0;
        adaptiveDelay = msLeft > 0 && rem >= 0
          ? Math.min(Math.max(DELETE_DELAY_MS, msLeft / (rem + 1)), 90000)
          : DELETE_DELAY_MS;
      }

      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.errors) return { ok: true };

      const msg = JSON.stringify(body.errors ?? body);
      // Already deleted / no longer exists -> treat as success.
      if (/not found|no status found|already|deleted/i.test(msg)) return { gone: true };
      if (res.status === 404 || res.status === 403) {
        console.error(
          `❌ ${opName} returned ${res.status}. Fill in X_CLIENT_TRANSACTION_ID and ` +
          `X_CLIENT_UUID as described in the header comment, then retry. Details: ${msg}`
        );
        return { fatal: true };
      }
      console.warn(`${opName} failed (HTTP ${res.status}): ${msg}`);
      return { failed: true };
    }
  }

  const deleteTweet = (id) =>
    gqlPost('VaenaVgh5q5ih7kvyVjgtg', 'DeleteTweet', { tweet_id: id, dark_request: false });
  const deleteRetweet = (id) =>
    gqlPost('iQtK4dl5hBmXewYZuEOKVw', 'DeleteRetweet', { source_tweet_id: id, dark_request: false });

  function logStats() {
    console.log(
      `📊 Deleted: ${stats.deleted} | Unretweeted: ${stats.unretweeted} | ` +
      `Already gone: ${stats.alreadyGone} | Failed: ${stats.failed}`
    );
  }

  // Returns false when the caller should stop the whole run (fatal error / user stop).
  function handleResult(r, kind) {
    if (r.ok) { kind === 'rt' ? stats.unretweeted++ : stats.deleted++; return true; }
    if (r.gone) { stats.alreadyGone++; return true; }
    if (r.failed) stats.failed++;
    return !r.fatal && !r.stopped;
  }

  // ============================ ARCHIVE MODE ============================
  async function archiveMode() {
    console.log('📂 Select your archive\'s data/tweets.js file...');
    const file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.js,.json,.txt';
      input.onchange = () => resolve(input.files[0]);
      input.click();
    });
    if (!file) { console.log('No file selected, cancelled.'); return; }

    const text = await file.text();
    // tweets.js is a JS assignment (window.YTD... = [...]); slice off everything before the array.
    const jsonStart = text.indexOf('[');
    if (jsonStart === -1) { alert('Unexpected file format (make sure you picked tweets.js).'); return; }
    let entries;
    try {
      entries = JSON.parse(text.slice(jsonStart));
    } catch (e) {
      alert('Could not parse the file: ' + e.message);
      return;
    }

    const tweets = entries.map((e) => e.tweet ?? e).filter((t) => t.id_str);
    console.log(`🗑️ Found ${tweets.length} entries in the archive. Starting deletion...`);
    console.log('To stop: STOP_DELETE = true');

    for (let i = 0; i < tweets.length; i++) {
      if (window.STOP_DELETE) { console.log('⏹️ Stopped.'); break; }
      // Retweets also appear in the archive under their own id and are removed via DeleteTweet.
      const r = await deleteTweet(tweets[i].id_str);
      if (!handleResult(r, 'tweet')) break;
      if ((i + 1) % 50 === 0) {
        console.log(`... ${i + 1}/${tweets.length} processed`);
        logStats();
      }
      await sleep(adaptiveDelay);
    }
    console.log('✅ Archive mode finished.');
    logStats();
  }

  // ============================ TIMELINE MODE ============================
  async function timelineMode() {
    const myHandle = location.pathname.split('/')[1]?.toLowerCase();
    if (!myHandle || ['home', 'search', 'explore', 'notifications', 'i'].includes(myHandle)) {
      alert('Run this mode on your own profile page: x.com/YOUR_USERNAME/with_replies');
      return;
    }
    console.log(`👤 Account: @${myHandle} — visible tweets/replies/retweets will be deleted.`);
    console.log('To stop: STOP_DELETE = true');

    const processed = new Set();
    let idleScrolls = 0;

    while (idleScrolls < MAX_IDLE_SCROLLS && !window.STOP_DELETE) {
      const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
      let actedThisPass = false;

      for (const article of articles) {
        if (window.STOP_DELETE) break;
        // The permalink carrying a <time> element belongs to this article's main tweet
        // (a quote tweet's own link comes first).
        const link = article.querySelector('a[href*="/status/"] time')?.closest('a');
        if (!link) continue;
        const m = link.getAttribute('href').match(/^\/([^/]+)\/status\/(\d+)/);
        if (!m) continue;
        const [, author, id] = m;
        if (processed.has(id)) continue;
        processed.add(id);

        const isMyRetweet = !!article.querySelector('[data-testid="unretweet"]');
        const isMyTweet = author.toLowerCase() === myHandle;
        if (!isMyRetweet && !isMyTweet) continue; // someone else's tweet (reply context) — skip

        const r = isMyRetweet ? await deleteRetweet(id) : await deleteTweet(id);
        actedThisPass = true;
        if (!handleResult(r, isMyRetweet ? 'rt' : 'tweet') && (r.fatal || r.stopped)) {
          logStats();
          return;
        }
        // Remove the deleted item from the DOM so scrolling can advance.
        article.closest('div[data-testid="cellInnerDiv"]')?.remove();
        await sleep(adaptiveDelay);
      }

      if (actedThisPass) {
        idleScrolls = 0;
        logStats();
      } else {
        idleScrolls++;
      }
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(SCROLL_DELAY_MS);
    }

    console.log(window.STOP_DELETE ? '⏹️ Stopped.' : '✅ Processed everything currently visible.');
    logStats();
    console.log(
      '💡 Refresh the page (F5) and run the script again — the timeline only loads a limited ' +
      'number of tweets at a time. Repeat until the profile is empty. If old tweets never appear, ' +
      'use ARCHIVE MODE instead.'
    );
  }

  // ============================ START ============================
  const useArchive = confirm(
    'Delete using ARCHIVE MODE?\n\n' +
    'OK     = Archive mode: pick your tweets.js file, ALL tweets are deleted (complete).\n' +
    'Cancel = Timeline mode: scroll this page and delete what is visible.'
  );
  if (useArchive) await archiveMode();
  else await timelineMode();
})();
