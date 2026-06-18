/* SecCards extras — Acronym rapid-fire drill (per-chapter decks + an All deck).
   Separate IIFE from app.js; its own localStorage key for best-accuracy. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const ACRO = window.ACRONYMS || [];
  const DECKS = window.FLASHCARD_DECKS || [];
  const CHMETA = {};
  DECKS.forEach((d) => { CHMETA[d.num] = d; });

  const LS_KEY = "seccards.extras.v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
  const store = load();
  store.acro = store.acro || {};      // best accuracy per deck key ("all" or chapter #)
  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(store));

  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.body.classList.remove("lock-scroll");
    document.body.style.background = "";   // clear any deck-study gradient app.js left
    $("#" + id).classList.add("active");
    window.scrollTo(0, 0);
  }

  // ---------- mode switching (Flashcards / Acronyms pills) ----------
  function setMode(mode) {
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    if (mode === "cards") show("home");
    else if (mode === "acronyms") { renderAcronymHome(); show("acronyms-home"); }
  }
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // ---------- deck helpers ----------
  const deckIndices = (key) => {
    const all = ACRO.map((_, i) => i);
    return key === "all" ? all : all.filter((i) => ACRO[i].ch === key);
  };
  const bestKey = (key) => String(key);

  function renderAcronymHome() {
    const grid = $("#acro-grid");
    grid.innerHTML = "";
    const chapters = [...new Set(ACRO.map((a) => a.ch))].sort((a, b) => a - b);
    const makeCard = (key, emoji, color, name, count) => {
      const best = store.acro[bestKey(key)] || 0;
      const el = document.createElement("button");
      el.className = "deck-card";
      el.style.setProperty("--dc", color);
      el.innerHTML = `
        <div class="glow"></div>
        <div>
          <div class="deck-emoji">${emoji}</div>
          <div class="deck-num">${key === "all" ? "All Chapters" : "Chapter " + key}</div>
          <div class="deck-name">${name}</div>
        </div>
        <div class="deck-meta">
          <span class="deck-count">${count} acronyms</span>
          <span class="deck-ring" style="--p:${best}"><span>${best}%</span></span>
        </div>`;
      el.addEventListener("click", () => startAcronyms(key));
      grid.appendChild(el);
    };
    chapters.forEach((ch) => {
      const m = CHMETA[ch] || {};
      makeCard(ch, m.emoji || "🔤", m.color || "#6366f1", m.subtitle || ("Chapter " + ch), deckIndices(ch).length);
    });
    makeCard("all", "🏆", "#a855f7", "Everything — prove your mastery", ACRO.length);
  }

  // ---------- drill ----------
  let ac = null;

  function buildAcSession(indices) { ac.order = shuffle(indices.slice()); ac.pos = 0; ac.missed = []; }

  function startAcronyms(key) {
    ac = { key, known: 0, seen: 0, streak: 0, order: [], pos: 0, missed: [] };
    buildAcSession(deckIndices(key));
    $("#ac-deck-title").textContent = key === "all"
      ? "🏆 All Acronyms"
      : `${(CHMETA[key] || {}).emoji || "🔤"} Chapter ${key}`;
    show("acronyms");
    renderAc();
  }

  const curIdx = () => ac.order[ac.pos];

  function renderAc() {
    const a = ACRO[curIdx()];
    $("#ac-acronym").textContent = a.a;
    $("#ac-full").textContent = a.full;
    $("#ac-note").textContent = a.note || "";
    $("#ac-answer").classList.add("hidden");
    $("#ac-reveal-row").classList.remove("hidden");
    $("#ac-grade-row").classList.add("hidden");
    $("#ac-streak").textContent = ac.streak;
    $("#ac-known").textContent = ac.known;
    $("#ac-seen").textContent = ac.seen;
    const acc = ac.seen ? Math.round((ac.known / ac.seen) * 100) : null;
    $("#ac-acc").textContent = acc == null ? "—" : acc + "%";
    $("#ac-acc-top").textContent = acc == null ? "—" : acc + "%";
    const pct = Math.round((ac.pos / ac.order.length) * 100);
    $("#ac-progress").style.width = pct + "%";
    $("#ac-count").textContent = `${ac.pos + 1} / ${ac.order.length}`;
  }

  function revealAc() {
    $("#ac-answer").classList.remove("hidden");
    $("#ac-reveal-row").classList.add("hidden");
    $("#ac-grade-row").classList.remove("hidden");
  }

  function saveBest() {
    if (!ac || !ac.seen) return;
    const acc = Math.round((ac.known / ac.seen) * 100);
    if (acc > (store.acro[bestKey(ac.key)] || 0)) { store.acro[bestKey(ac.key)] = acc; save(); }
  }

  function gradeAc(knew) {
    if (!ac) return;
    ac.seen++;
    if (knew) { ac.known++; ac.streak++; }
    else { ac.streak = 0; ac.missed.push(curIdx()); }
    ac.pos++;
    if (ac.pos >= ac.order.length) {
      saveBest();
      // replay just the missed ones, else loop the whole deck again
      if (ac.missed.length) buildAcSession(ac.missed.slice());
      else buildAcSession(deckIndices(ac.key));
    }
    renderAc();
  }

  // ---------- events ----------
  $("#ac-reveal").addEventListener("click", revealAc);
  $("#ac-know").addEventListener("click", () => gradeAc(true));
  $("#ac-miss").addEventListener("click", () => gradeAc(false));
  $("#ac-back").addEventListener("click", () => { saveBest(); renderAcronymHome(); show("acronyms-home"); });
  $("#ac-shuffle").addEventListener("click", () => { if (ac) { buildAcSession(deckIndices(ac.key)); renderAc(); } });
  $("#ac-restart").addEventListener("click", () => { if (ac) { ac.known = 0; ac.seen = 0; ac.streak = 0; buildAcSession(deckIndices(ac.key)); renderAc(); } });

  document.addEventListener("keydown", (e) => {
    if (!$("#acronyms").classList.contains("active")) return;
    const revealed = !$("#ac-answer").classList.contains("hidden");
    if (e.key === " ") { e.preventDefault(); if (!revealed) revealAc(); }
    else if (revealed && e.key === "1") gradeAc(false);
    else if (revealed && e.key === "2") gradeAc(true);
  });
})();
