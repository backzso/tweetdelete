// ==UserScript==
// @name         X (Twitter) Auto Bulk Delete
// @namespace    https://github.com/backzso/tweetdelete
// @version      1.1.0
// @description  Watches your tweet count on X and, once it crosses a threshold, offers to bulk-delete your tweets, replies, and retweets. Runs in your own browser session — no API key, nothing stored server-side.
// @author       backzso
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/backzso/tweetdelete
// @supportURL   https://github.com/backzso/tweetdelete/issues
// @updateURL    https://raw.githubusercontent.com/backzso/tweetdelete/main/tweetdelete.user.js
// @downloadURL  https://raw.githubusercontent.com/backzso/tweetdelete/main/tweetdelete.user.js
// ==/UserScript==

/*
 * Automation wrapper around the console deleter (delete-tweets.js).
 *
 * When you open your own profile on x.com, this script reads your public tweet
 * count. If it is at or above THRESHOLD, it asks for confirmation and then runs
 * the same delete routine (timeline mode). Deletion is NEVER silent — you always
 * confirm first, so a miscount can't wipe your account by surprise.
 *
 * Install: add the Tampermonkey/Violentmonkey extension, then open this file's
 * raw URL (or paste its contents into a new userscript). Done.
 */

(function () {
  'use strict';

  // ============================ SETTINGS ============================
  const THRESHOLD = 1000;        // trigger once your tweet count reaches this
  const CHECK_EVERY_MS = 60000;  // how often to re-check the count while on your profile
  const AUTO_CONFIRM = false;    // false: always ask before deleting (recommended)
  const DELETE_DELAY_MS = 400;   // wait between delete calls (ms)
  const SCROLL_DELAY_MS = 1500;  // wait at the end of the list for X to load more tweets (ms)
  const MAX_IDLE_SCROLLS = 12;   // stop after this many scrolls with no new tweets
  // Only act on these accounts (lowercase handles). Leave empty to allow any
  // profile you own that you happen to open — but pinning it is safer.
  const ONLY_HANDLES = [];       // e.g. ['backzso']
  // =================================================================

  const LS_KEY = 'tweetdelete_last_prompt';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getCookie = (name) =>
    document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))?.[2];

  window.STOP_DELETE = window.STOP_DELETE ?? false;

  // ---------- toast so the user sees the script is alive ----------
  function toast(msg, ms = 4000) {
    let el = document.getElementById('td-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'td-toast';
      el.style.cssText =
        'position:fixed;z-index:99999;bottom:20px;right:20px;max-width:320px;' +
        'background:#15202b;color:#fff;border:1px solid #38444d;border-radius:12px;' +
        'padding:12px 16px;font:14px/1.4 system-ui;box-shadow:0 4px 16px rgba(0,0,0,.4)';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    if (ms) el._t = setTimeout(() => (el.style.display = 'none'), ms);
  }

  // ---------- read the tweet count from the profile header ----------
  // The header shows e.g. "733 posts" / "1.2K posts" under the display name.
  function readTweetCount() {
    // The header renders a subtitle like "733 posts" / "1.2K posts" / "733 gönderi".
    for (const n of document.querySelectorAll('div, span')) {
      const t = n.textContent?.trim();
      if (!t) continue;
      const sub = t.match(/^([\d.,]+)([KMB])?\s*(posts|gönderi|tweets)$/i);
      if (sub) return parseCompact(sub[1] + (sub[2] || ''));
    }
    return null;
  }

  function parseCompact(s) {
    s = s.replace(/,/g, '');
    const mult = /K$/i.test(s) ? 1e3 : /M$/i.test(s) ? 1e6 : /B$/i.test(s) ? 1e9 : 1;
    return Math.round(parseFloat(s) * mult);
  }

  function myHandleFromPath() {
    const h = location.pathname.split('/')[1]?.toLowerCase();
    if (!h || ['home', 'search', 'explore', 'notifications', 'i', 'messages', 'settings'].includes(h)) return null;
    // Never act on someone else's profile: the "unretweet" button would still match posts YOU reposted.
    const loggedIn = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')
      ?.getAttribute('href')?.split('/')[1]?.toLowerCase();
    if (loggedIn && loggedIn !== h) return null;
    return h;
  }

  // ============================ DELETE CORE ============================
  // (Same GraphQL approach as delete-tweets.js, timeline mode.)
  function buildHeaders() {
    const csrf = getCookie('ct0');
    if (!csrf) return null;
    return {
      authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'x-csrf-token': csrf,
      'content-type': 'application/json',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
    };
  }

  async function gqlPost(headers, queryId, opName, variables) {
    let netErrors = 0;
    while (true) {
      if (window.STOP_DELETE) return { stopped: true };
      let res;
      try {
        res = await fetch(`https://x.com/i/api/graphql/${queryId}/${opName}`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ variables, queryId }),
        });
      } catch (e) {
        if (++netErrors > 8) return { failed: true };
        await sleep(10000 * netErrors);
        continue;
      }
      if (res.status === 429) {
        const reset = Number(res.headers.get('x-rate-limit-reset'));
        let waitMs = reset ? reset * 1000 - Date.now() + 5000 : 15 * 60 * 1000;
        waitMs = Math.min(Math.max(waitMs, 5000), 16 * 60 * 1000);
        toast(`Rate limit — waiting ${Math.ceil(waitMs / 60000)} min, then resuming...`, waitMs);
        await sleep(waitMs);
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.errors) return { ok: true };
      const msg = JSON.stringify(body.errors ?? body);
      if (/not found|no status found|already|deleted/i.test(msg)) return { gone: true };
      if (res.status === 404 || res.status === 403) {
        console.error(`[tweetdelete] ${opName} returned ${res.status}: ${msg}`);
        return { fatal: true };
      }
      return { failed: true };
    }
  }

  async function runDelete(myHandle) {
    const headers = buildHeaders();
    if (!headers) { toast('No session (ct0 cookie missing). Log in first.'); return; }

    window.STOP_DELETE = false;
    const stats = { deleted: 0, unretweeted: 0, gone: 0, failed: 0 };
    const MAX_ATTEMPTS = 3;
    const processed = new Set(); // ids that are done (deleted, gone, not ours, or given up on)
    const attempts = new Map();  // id -> failed attempts, so transient errors are retried
    let idleScrolls = 0;

    toast('Deleting… type STOP_DELETE = true in the console to stop.', 6000);

    while (idleScrolls < MAX_IDLE_SCROLLS && !window.STOP_DELETE) {
      const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
      let acted = false;
      let sawNew = false;

      for (const article of articles) {
        if (window.STOP_DELETE) break;
        const link = article.querySelector('a[href*="/status/"] time')?.closest('a');
        if (!link) continue;
        const m = link.getAttribute('href').match(/^\/([^/]+)\/status\/(\d+)/);
        if (!m) continue;
        const [, author, id] = m;
        if (processed.has(id)) continue;

        const isMyTweet = author.toLowerCase() === myHandle;
        // Until the action bar renders, a retweet looks like someone else's tweet; retry next pass.
        if (!isMyTweet && !article.querySelector('[data-testid="retweet"], [data-testid="unretweet"]')) continue;
        processed.add(id);
        sawNew = true;

        // Your own tweet you also retweeted: deleting the tweet removes the retweet too.
        const isMyRetweet = !isMyTweet && !!article.querySelector('[data-testid="unretweet"]');
        if (!isMyRetweet && !isMyTweet) continue;

        const r = isMyRetweet
          ? await gqlPost(headers, 'iQtK4dl5hBmXewYZuEOKVw', 'DeleteRetweet', { source_tweet_id: id, dark_request: false })
          : await gqlPost(headers, 'VaenaVgh5q5ih7kvyVjgtg', 'DeleteTweet', { tweet_id: id, dark_request: false });
        acted = true;
        if (r.failed) {
          const n = (attempts.get(id) ?? 0) + 1;
          attempts.set(id, n);
          if (n < MAX_ATTEMPTS) { processed.delete(id); await sleep(DELETE_DELAY_MS); continue; }
        }
        if (r.ok) isMyRetweet ? stats.unretweeted++ : stats.deleted++;
        else if (r.gone) stats.gone++;
        else if (r.stopped) { toast('Stopped.'); return finish(stats); }
        else if (r.fatal) { toast('X rejected the request (403/404). See the console.', 12000); return finish(stats); }
        else stats.failed++;

        await sleep(DELETE_DELAY_MS);
      }

      if (acted) toast(`Deleted ${stats.deleted}, unretweeted ${stats.unretweeted}…`, 3000);
      idleScrolls = sawNew ? 0 : idleScrolls + 1;
      // Scroll less than one screen at a time. X's timeline is virtualized and only renders
      // tweets near the viewport, so jumping straight to the bottom skips everything in between.
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      // Only the end of the list needs X to fetch more tweets; mid-list they are already loaded
      // and just need a moment to render.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100;
      await sleep(atBottom ? SCROLL_DELAY_MS : 300);
    }
    finish(stats);
  }

  function finish(stats) {
    toast(
      `Done. Deleted ${stats.deleted}, unretweeted ${stats.unretweeted}, ` +
      `already gone ${stats.gone}, failed ${stats.failed}. Refresh & reopen your profile to continue.`,
      12000
    );
    console.log('[tweetdelete] finished', stats);
  }

  // ============================ WATCH LOOP ============================
  let running = false; // the interval keeps firing during a long run; don't start a second one

  async function tick() {
    if (running) return;
    const myHandle = myHandleFromPath();
    if (!myHandle) return;
    if (ONLY_HANDLES.length && !ONLY_HANDLES.includes(myHandle)) return;

    const count = readTweetCount();
    if (count == null) return; // header not rendered yet
    console.log(`[tweetdelete] @${myHandle} has ~${count} posts (threshold ${THRESHOLD})`);

    if (count < THRESHOLD) return;

    // Don't nag repeatedly in the same session/day for the same count.
    const last = localStorage.getItem(LS_KEY);
    const stamp = new Date().toISOString().slice(0, 10) + ':' + count;
    if (last === stamp) return;

    if (AUTO_CONFIRM ||
        confirm(`@${myHandle} has reached ~${count} posts (threshold ${THRESHOLD}).\n\n` +
                `Delete your tweets, replies and retweets now?\n\n` +
                `This is permanent. Click Cancel to skip.`)) {
      localStorage.setItem(LS_KEY, stamp);
      running = true;
      try { await runDelete(myHandle); } finally { running = false; }
    } else {
      localStorage.setItem(LS_KEY, stamp); // remember the decline so it won't re-ask this count today
      toast('Skipped. Will ask again when the count changes.');
    }
  }

  // Kick off: check now and then on an interval while the tab is open.
  setTimeout(tick, 4000);
  setInterval(tick, CHECK_EVERY_MS);
  // Re-check on client-side navigation (X is a SPA).
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; setTimeout(tick, 2500); }
  }, 1500);

  console.log('[tweetdelete] userscript loaded. Threshold:', THRESHOLD);
})();
