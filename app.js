/* SecCards — fun flashcard app for the CompTIA Security+ (SY0-701) decks.
   Pure vanilla JS, no build step. Progress saved in localStorage. */
(function () {
  "use strict";
  const DECKS = window.FLASHCARD_DECKS || [];
  const LS_KEY = "seccards.v1";

  // ---------- persistent state ----------
  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(state));
  const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
  const stored = load();
  const state = {
    xp: stored.xp || 0,
    streak: stored.streak || 0,
    lastDay: stored.lastDay || null,
    mastered: stored.mastered || {},   // "deckId#index" -> true
    starred: stored.starred || {},     // "deckId#index" -> true
  };

  // daily streak bookkeeping
  (function tickStreak() {
    const today = new Date().toDateString();
    if (state.lastDay !== today) {
      const yest = new Date(Date.now() - 864e5).toDateString();
      state.streak = state.lastDay === yest ? state.streak + 1 : 1;
      state.lastDay = today;
      save();
    }
  })();

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const key = (deckId, i) => deckId + "#" + i;
  const totalCards = DECKS.reduce((n, d) => n + d.cards.length, 0);
  const masteredCount = () => Object.keys(state.mastered).length;

  function show(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#" + screenId).classList.add("active");
    window.scrollTo(0, 0);
  }

  // ---------- HOME ----------
  function renderHome() {
    $("#stat-total").textContent = totalCards;
    $("#stat-mastered").textContent = masteredCount();
    $("#stat-streak").textContent = state.streak;
    $("#stat-xp").textContent = state.xp;

    const grid = $("#deck-grid");
    grid.innerHTML = "";
    DECKS.forEach((deck) => {
      const done = deck.cards.filter((_, i) => state.mastered[key(deck.id, i)]).length;
      const pct = Math.round((done / deck.cards.length) * 100);
      const el = document.createElement("button");
      el.className = "deck-card" + (pct === 100 ? " complete" : "");
      el.style.setProperty("--dc", deck.color);
      el.innerHTML = `
        <div class="glow"></div>
        <div>
          <div class="deck-emoji">${deck.emoji}</div>
          <div class="deck-num">${deck.title}</div>
          <div class="deck-name">${deck.subtitle}</div>
        </div>
        <div class="deck-meta">
          <span class="deck-count">${deck.cards.length} cards</span>
          <span class="deck-ring" style="--p:${pct}"><span>${pct}%</span></span>
        </div>`;
      el.addEventListener("click", () => startDeck(deck));
      grid.appendChild(el);
    });
  }

  // ---------- STUDY ----------
  let session = null;

  function buildQueue(deck, opts) {
    opts = opts || {};
    let idx = deck.cards.map((_, i) => i);
    if (opts.onlyStarred) idx = idx.filter((i) => state.starred[key(deck.id, i)]);
    if (opts.onlyMissed && opts.missed) idx = opts.missed.slice();
    if (opts.shuffle !== false) shuffle(idx);
    return idx;
  }

  function startDeck(deck, opts) {
    opts = opts || {};
    const queue = buildQueue(deck, opts);
    if (!queue.length) {
      alert(opts.onlyStarred ? "No starred cards in this deck yet — tap the ☆ on a card while studying!" : "No cards.");
      return;
    }
    session = {
      deck, queue, pos: 0, total: queue.length,
      flipped: false, onlyStarred: !!opts.onlyStarred,
      results: { again: 0, hard: 0, good: 0, easy: 0 },
      missed: [],
    };
    document.body.style.background =
      `linear-gradient(135deg, ${shade(deck.color, -45)}, ${shade(deck.color, -15)} 60%, #1e1b4b)`;
    $("#study-title").textContent = `${deck.emoji} ${deck.title}`;
    $("#star-filter-btn").classList.toggle("on", session.onlyStarred);
    show("study");
    renderCard();
  }

  function renderCard() {
    const s = session;
    const i = s.queue[s.pos];
    const card = s.deck.cards[i];
    s.flipped = false;
    const fc = $("#flashcard");
    fc.classList.remove("flipped");
    $("#card-question").textContent = card.q;
    $("#card-answer").textContent = card.a;
    document.documentElement.style.setProperty("--deck-color", s.deck.color);
    $("#card-deck-tag").style.background = s.deck.color;
    $("#star-toggle").classList.toggle("on", !!state.starred[key(s.deck.id, i)]);
    $("#flip-row").classList.remove("hidden");
    $("#grade-row").classList.add("hidden");
    const pct = Math.round((s.pos / s.total) * 100);
    $("#progress-fill").style.width = pct + "%";
    $("#progress-count").textContent = `${s.pos + 1} / ${s.total}`;
  }

  function flip() {
    if (!session) return;
    session.flipped = !session.flipped;
    $("#flashcard").classList.toggle("flipped", session.flipped);
    $("#flip-row").classList.toggle("hidden", session.flipped);
    $("#grade-row").classList.toggle("hidden", !session.flipped);
  }

  function grade(g) {
    const s = session;
    if (!s || !s.flipped) return;
    const i = s.queue[s.pos];
    const k = key(s.deck.id, i);
    s.results[g]++;
    const xpGain = { again: 1, hard: 2, good: 4, easy: 5 }[g];
    addXp(xpGain);

    if (g === "good" || g === "easy") {
      state.mastered[k] = true;
    } else {
      delete state.mastered[k];
      s.missed.push(i);
      // "Again" re-inserts the card a few slots later in this session
      if (g === "again") {
        const insertAt = Math.min(s.pos + 4, s.queue.length);
        s.queue.splice(insertAt, 0, i);
        s.total = s.queue.length;
      }
    }
    save();

    s.pos++;
    if (s.pos >= s.queue.length) finishDeck();
    else { popCard(); renderCard(); }
  }

  function popCard() {
    const fc = $("#flashcard");
    fc.style.transition = "none";
    fc.style.opacity = "0";
    fc.style.transform = "translateX(40px) rotateY(0)";
    requestAnimationFrame(() => {
      fc.style.transition = "";
      fc.style.opacity = "1";
      fc.style.transform = "";
    });
  }

  function toggleStar() {
    const s = session; if (!s) return;
    const k = key(s.deck.id, s.queue[s.pos]);
    if (state.starred[k]) delete state.starred[k]; else state.starred[k] = true;
    $("#star-toggle").classList.toggle("on", !!state.starred[k]);
    save();
  }

  // ---------- DONE ----------
  function finishDeck() {
    const s = session;
    const r = s.results;
    const correct = r.good + r.easy;
    const acc = Math.round((correct / (correct + r.again + r.hard || 1)) * 100);
    const perfect = r.again === 0 && r.hard === 0;
    $("#done-emoji").textContent = perfect ? "🏆" : acc >= 70 ? "🎉" : "💪";
    $("#done-title").textContent = perfect ? "Flawless!" : acc >= 70 ? "Nice work!" : "Keep grinding!";
    $("#done-summary").textContent =
      `${s.deck.emoji} ${s.deck.title} · ${acc}% on first pass`;
    $("#done-stats").innerHTML = `
      <span class="pill" style="background:var(--again)">😵‍💫 ${r.again}</span>
      <span class="pill" style="background:var(--hard)">😬 ${r.hard}</span>
      <span class="pill" style="background:var(--good)">🙂 ${r.good}</span>
      <span class="pill" style="background:var(--easy)">😎 ${r.easy}</span>`;
    const uniqMissed = [...new Set(s.missed)];
    $("#review-missed").style.display = uniqMissed.length ? "" : "none";
    show("done");
    confetti();
  }

  // ---------- XP / streak ----------
  function addXp(n) {
    state.xp += n;
    $("#stat-xp") && ($("#stat-xp").textContent = state.xp);
    save();
  }

  // ---------- confetti ----------
  function confetti() {
    const cv = $("#confetti"), ctx = cv.getContext("2d");
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ["#a855f7", "#f0abfc", "#fcd34d", "#22d3ee", "#4ade80", "#fb7185"];
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height,
      r: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
      vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4,
      rot: Math.random() * 6, vr: -.2 + Math.random() * .4,
    }));
    let t = 0;
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      bits.forEach((b) => {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 2, b.r, b.r * 1.6); ctx.restore();
      });
      if (t++ < 160) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  // ---------- utils ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + Math.round(255 * pct / 100), g = ((n >> 8) & 255) + Math.round(255 * pct / 100), b = (n & 255) + Math.round(255 * pct / 100);
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }
  const resetBg = () => { document.body.style.background = ""; };

  // ---------- events ----------
  $("#flip-btn").addEventListener("click", flip);
  $("#flashcard").addEventListener("click", flip);
  $("#star-toggle").addEventListener("click", (e) => { e.stopPropagation(); toggleStar(); });
  $("#star-filter-btn").addEventListener("click", () => {
    if (!session) return;
    startDeck(session.deck, { onlyStarred: !session.onlyStarred });
  });
  $("#shuffle-btn").addEventListener("click", () => { if (session) startDeck(session.deck, { onlyStarred: session.onlyStarred }); });
  document.querySelectorAll(".grade").forEach((b) =>
    b.addEventListener("click", () => grade(b.dataset.grade)));
  $("#back-home").addEventListener("click", () => { resetBg(); renderHome(); show("home"); });
  $("#done-home").addEventListener("click", () => { resetBg(); renderHome(); show("home"); });
  $("#again-deck").addEventListener("click", () => startDeck(session.deck, { onlyStarred: session.onlyStarred }));
  $("#review-missed").addEventListener("click", () =>
    startDeck(session.deck, { onlyMissed: true, missed: [...new Set(session.missed)] }));
  $("#reset-progress").addEventListener("click", () => {
    if (confirm("Reset ALL progress, XP, stars and streak?")) {
      localStorage.removeItem(LS_KEY);
      location.reload();
    }
  });

  // keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (!$("#study").classList.contains("active")) return;
    if (e.key === " ") { e.preventDefault(); flip(); }
    else if (e.key === "s" || e.key === "S") toggleStar();
    else if (e.key === "ArrowLeft") { resetBg(); renderHome(); show("home"); }
    else if (session && session.flipped && ["1", "2", "3", "4"].includes(e.key))
      grade({ "1": "again", "2": "hard", "3": "good", "4": "easy" }[e.key]);
  });

  // ---------- boot ----------
  if (!DECKS.length) {
    document.body.innerHTML = "<p style='padding:40px;text-align:center'>No decks found. Run <code>python3 build_data.py</code> first.</p>";
    return;
  }
  renderHome();
})();
