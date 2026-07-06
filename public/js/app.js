/* ================= Football Draft — client (FUT) ================= */
(function () {
  "use strict";

  // Version affichée sur l'accueil : permet de vérifier ce qui est déployé.
  const APP_VERSION = "v39 — photo en fond de carte";

  const $ = (id) => document.getElementById(id);
  const state = { code: null, pid: null, snap: null, es: null, mode: "pick" };
  let timerInterval = null, uid = 0, teamNameTimer = null;

  const KIT_PALETTE = ["#e11d2a", "#1f6feb", "#12b886", "#f59f00", "#7048e8", "#111418", "#f1f3f5", "#e64980", "#0b7285", "#495057"];
  const PATTERNS = ["plain", "stripes", "hoops", "sash", "halves"];

  const flag = (code) => (!code || code.length !== 2) ? "🏳️"
    : String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

  // Drapeau image (net partout, contrairement à l'emoji) avec repli emoji
  // si le CDN est injoignable. Taille en em : suit la police du contexte.
  const flagHtml = (code, cls) => {
    if (!code || code.length !== 2) return `<span class="${cls || "flag"}">🏳️</span>`;
    return `<span class="${cls || "flag"} flagwrap"><img src="https://flagcdn.com/h40/${code.toLowerCase()}.png"`
      + ` alt="${code}" loading="lazy" onerror="this.parentNode.textContent='${flag(code)}'"></span>`;
  };

  const tierClass = (r) => r >= 91 ? "tier-elite" : r >= 84 ? "tier-gold" : r >= 79 ? "tier-silver" : "tier-bronze";

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  const me = () => state.snap && state.snap.players.find((p) => p.pid === state.pid);
  const isHost = () => state.snap && state.snap.hostPid === state.pid;

  // ---------- Sons synthétisés (Web Audio, aucun fichier) + vibration ----------
  const SND = {
    muted: false, ctx: null,
    ensure() {
      if (this.muted) return null;
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    env(g, t0, a, d, peak) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    },
    // Coup de sifflet (x n)
    whistle(n) {
      const c = this.ensure(); if (!c) return;
      for (let i = 0; i < (n || 1); i++) {
        const t0 = c.currentTime + i * 0.5;
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = "square"; o.frequency.value = 2450;
        lfo.frequency.value = 38; lg.gain.value = 160; lfo.connect(lg); lg.connect(o.frequency);
        this.env(g, t0, 0.02, 0.3, 0.09);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + 0.4); lfo.start(t0); lfo.stop(t0 + 0.4);
      }
    },
    // Bruit filtré (base de la foule)
    noise(dur, freq, q, peak) {
      const c = this.ensure(); if (!c) return;
      const t0 = c.currentTime;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      this.env(g, t0, dur * 0.3, dur * 0.7, peak);
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(t0); src.stop(t0 + dur + 0.05);
    },
    goal() { this.noise(2.4, 900, 0.7, 0.4); this.noise(2.4, 350, 0.8, 0.28); }, // clameur de foule
    ooh() { this.noise(0.8, 500, 0.9, 0.13); }, // occasion manquée
    ding() { // à toi de jouer
      const c = this.ensure(); if (!c) return;
      [880, 1318].forEach((fr, i) => {
        const t0 = c.currentTime + i * 0.12;
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = fr;
        this.env(g, t0, 0.01, 0.24, 0.16);
        o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.3);
      });
    },
  };
  try { SND.muted = localStorage.getItem("fd_mute") === "1"; } catch (_) {}
  const vibe = (pat) => { if (!SND.muted && navigator.vibrate) { try { navigator.vibrate(pat); } catch (_) {} } };

  // ---------- Maillot (SVG) ----------
  function kitSvg(kit) {
    kit = kit || { p: "#1f6feb", s: "#fff", pat: "plain" };
    const p = kit.p, s = kit.s, pat = kit.pat || "plain";
    const id = "k" + (++uid);
    const body = "M50 12 C57 12 61 15 66 18 L85 27 L79 45 L70 42 L70 88 L30 88 L30 42 L21 45 L15 27 L34 18 C39 15 43 12 50 12 Z";
    let ov = "";
    if (pat === "stripes") for (let x = 34; x < 70; x += 9) ov += `<rect x="${x}" y="14" width="4.5" height="76" fill="${s}"/>`;
    else if (pat === "hoops") for (let y = 26; y < 90; y += 11) ov += `<rect x="14" y="${y}" width="72" height="5.5" fill="${s}"/>`;
    else if (pat === "sash") ov += `<polygon points="28,28 40,28 74,88 62,88" fill="${s}"/>`;
    else if (pat === "halves") ov += `<rect x="50" y="10" width="45" height="82" fill="${s}"/>`;
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>
      <path d="${body}" fill="${p}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
      <g clip-path="url(#${id})">${ov}</g>
      <path d="M43 15 L50 23 L57 15" fill="none" stroke="${s}" stroke-width="3"/></svg>`;
  }

  // ---------- Carte joueur (épurée) ----------
  function futCard(pl, opts) {
    opts = opts || {};
    const stats = MODEL.computeStats(pl); // PAC/SHO/PAS/DRI/DEF/PHY (ou stats GK)
    const statsHtml = stats.map((s) => `<span class="cell"><b>${s.value}</b><i>${s.label}</i></span>`).join("");
    const price = pl.price != null ? pl.price : MODEL.marketValue(pl);
    const stateClass = pl.taken ? "taken" : pl.expensive ? "expensive" : opts.disabled ? "disabled" : "";
    return `<div class="fut ${tierClass(pl.r)} ${stateClass} ${opts.chemLink ? "linked" : ""}" data-id="${pl.id}">
      <div class="fut-bg"><img data-face="${esc(pl.n)}" data-country="${esc(pl.c)}" alt="" loading="lazy"><i></i></div>
      ${pl.taken ? '<span class="taken-badge">PRIS</span>' : ""}
      ${pl.expensive ? '<span class="taken-badge expensive-badge">TROP CHER</span>' : ""}
      <div class="fut-inner">
        <div class="fut-top">
          <div class="fut-rating"><span class="r">${pl.r}</span><span class="p">${pl.pos}</span></div>
          <div class="fut-badges">${flagHtml(pl.code)}<span class="price">${fmtM(price)}</span></div>
        </div>
        <div class="fut-name">${esc(pl.n)}</div>
        <div class="fut-sub">${esc(pl.c)} · ${esc(pl.d)}${opts.chemLink ? ` · <span class="linktag">🔗 ${opts.linkLabel || "lien"}</span>` : ""}</div>
        <div class="fut-stats">${statsHtml}</div>
      </div></div>`;
  }

  // ---------- Draft aux enchères ----------
  function renderAuction(s, d) {
    $("draft-pick").textContent = d.pickNum;
    $("draft-total").textContent = d.totalPicks;
    $("draft-team").style.display = "none";
    $("btn-reroll").style.display = "none";
    $("cards-grid").style.display = "none";
    $("auction-box").style.display = "";
    startTimer(d.deadline);
    $("draft-timer").style.display = "";

    const m0 = me();
    let panel = "";
    if (m0) {
      const spent = (m0.squad || []).reduce((t, p) => t + MODEL.marketValue(p), 0);
      const left = Math.max(0, Math.round((MODEL.BUDGET - spent) * 10) / 10);
      const counts = MODEL.positionCounts(m0.formationKey);
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      m0.squad.forEach((p) => have[p.pos]++);
      const needChips = ["GK", "DEF", "MID", "FWD"].filter((pos) => counts[pos] - have[pos] > 0)
        .map((pos) => `<span class="ms-chip">${pos} <b>×${counts[pos] - have[pos]}</b></span>`).join("");
      panel = `<div class="my-status mine"><div>
          <div class="ms-label">💰 Ton budget restant</div>
          <div class="ms-value ${left < 40 ? "low" : ""}">${fmtM(left)}</div>
          <div class="ms-bar"><i style="width:${Math.max(2, (left / MODEL.BUDGET) * 100).toFixed(0)}%"></i></div>
        </div><div>
          <div class="ms-label">Tes postes à pourvoir</div>
          <div class="ms-chips">${needChips || (m0.squad.length < 13 ? `<span class="ms-chip">🪑 Banc <b>${Math.max(0, m0.squad.length - 11)}/2</b></span>` : '<span class="ms-chip done">✓ Complet</span>')}</div>
        </div></div>`;
    }
    $("need-bar").innerHTML = panel;

    const iAmBest = d.bestPid === state.pid;
    setHtml($("auction-box"), `
      <div class="auction-card">
        <div class="auction-title">🔨 ENCHÈRE EN COURS</div>
        <div class="auction-fut">${futCard(d.player)}</div>
        <div class="auction-price">${fmtM(d.price)}${d.bestName ? ` — <b class="${iAmBest ? "me" : ""}">${esc(d.bestName)}</b>` : " — mise à prix"}</div>
        <button class="btn ${iAmBest ? "btn-ghost" : "btn-primary"}" id="btn-bid" ${iAmBest ? "disabled" : ""}>
          ${iAmBest ? "✓ Meilleure offre" : `Enchérir ${fmtM(d.nextPrice)}`}</button>
        <p class="hint" id="auction-hint"></p>
      </div>`);
    const bidBtn = document.getElementById("btn-bid");
    if (bidBtn && !bidBtn.__wired) {
      bidBtn.__wired = true;
      bidBtn.addEventListener("click", async () => {
        const r = await api("bid");
        if (r && !r.ok && r.error) { const hint = document.getElementById("auction-hint"); if (hint) hint.textContent = r.error; }
        else { SND.ding(); }
      });
    }
    show("screen-draft");
  }

  // ---------- Réseau ----------
  async function api(type, extra) {
    if (local.active) return localApi(type, extra || {});
    try {
      const res = await fetch("api", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ type, code: state.code, pid: state.pid }, extra || {})) });
      if (!res.ok) {
        return { ok: false, error: res.status === 404 || res.status === 405
          ? "Cet hébergement est statique (pas de serveur de jeu) : le multijoueur par code/QR nécessite `node server.js`. Utilise le mode « 1 téléphone » ci-dessous 👇"
          : "Erreur serveur (" + res.status + ")." };
      }
      return await res.json();
    } catch (e) {
      return { ok: false, error: "Serveur injoignable — lance `node server.js` et ouvre l'adresse qu'il affiche, ou joue en mode « 1 téléphone » 👇" };
    }
  }

  // ---------- Mode « 1 téléphone » (pass & play, 100 % local) ----------
  const local = { active: false, players: [], nextPid: 1, phase: "lobby", draft: null, tournament: null };
  const LPLAYERS = (typeof PLAYERS !== "undefined" ? PLAYERS : []).map((p, i) => Object.assign({ id: i }, p));

  function localAddPlayer(name) {
    if (local.players.length >= 8) return;
    const i = local.players.length;
    local.players.push({
      pid: local.nextPid++, name: String(name || "Joueur " + (i + 1)).slice(0, 16),
      squad: [], spent: 0, formationKey: "4-3-3",
      kit: { p: KIT_PALETTE[i % KIT_PALETTE.length], s: "#ffffff", pat: PATTERNS[i % PATTERNS.length] },
    });
  }

  const localDrafted = () => { const s = new Set(); local.players.forEach((p) => p.squad.forEach((x) => s.add(x.id))); return s; };
  function localNeeded(p) {
    const counts = MODEL.positionCounts(p.formationKey);
    const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    p.squad.forEach((x) => have[x.pos]++);
    const need = {};
    for (const pos of ["GK", "DEF", "MID", "FWD"]) { const r = counts[pos] - have[pos]; if (r > 0) need[pos] = r; }
    return need;
  }

  function localSnapshot() {
    const players = local.players.map((p) => {
      const t0 = local.tstate;
      const sq = p.squad.map((pl) => Object.assign({}, pl, {
        fat: t0 ? (t0.fatigue[pl.id] || 0) : 0,
        susp: t0 ? (t0.suspended[pl.id] || 0) > 0 : false,
      }));
      const chem = MODEL.chemistry(sq, p.formationKey);
      return { pid: p.pid, name: p.name, connected: true, isHost: p.pid === 1, formationKey: p.formationKey,
        teamName: p.name, kit: p.kit, squad: sq, squadCount: sq.length,
        strength: ENGINE.teamStrength(MODEL.placeInSlots(sq, p.formationKey).filter((x) => x.player).map((x) => x.player)),
        chem: chem.teamChem, chemBonus: chem.bonus };
    });
    const snap = { code: "LOCAL", phase: local.phase, hostPid: 1, squadSize: 11, players };
    if (local.phase === "draft" && local.draft) {
      const d = local.draft;
      const cur = local.players.find((p) => p.pid === d.currentPid);
      snap.draft = { pickNum: d.pickNum + 1, totalPicks: d.order.length, currentPid: d.currentPid,
        currentName: cur.name, round: Math.floor(d.pickNum / local.players.length) + 1,
        team: d.currentTeam, needed: localNeeded(cur), deadline: 0,
        budget: MODEL.BUDGET, budgetLeft: MODEL.BUDGET - cur.spent, rerollsLeft: cur.rerolls || 0, order: d.order.slice(0, local.players.length) };
    }
    if (local.phase === "playing" && local.reveal && local.reveal.current) {
      const cur = local.reveal.current;
      snap.playing = { round: local.reveal.idx + 1, totalRounds: local.tstate.totalRounds, stage: cur.stage, type: cur.type,
        matches: cur.matches.map(ENGINE.publicMatch), startedAt: local.roundStartedAt, clockMs: 44000, goalHoldMs: 3500,
        playedMatches: local.tstate.playedLeague.filter((m) => cur.matches.indexOf(m) < 0)
          .map((m) => ({ a: m.a, b: m.b, ga: m.ga, gb: m.gb })) };
    }
    if (local.phase === "results") snap.tournament = local.tournament;
    return snap;
  }

  function localRender() {
    state.snap = localSnapshot();
    state.pid = local.phase === "draft" && local.draft ? local.draft.currentPid : 1;
    render();
  }

  function localPrepareTurn() {
    const d = local.draft;
    d.currentPid = d.order[d.pickNum];
    const cur = local.players.find((p) => p.pid === d.currentPid);
    const budget = { left: MODEL.BUDGET - cur.spent, needCounts: localNeeded(cur) };
    d.currentTeam = ENGINE.drawTeamForTurn(LPLAYERS, localDrafted(), new Set(Object.keys(localNeeded(cur))), budget);
  }

  function localStart() {
    local.players.forEach((p) => { p.squad = []; p.spent = 0; p.rerolls = 2; });
    const pids = local.players.map((p) => p.pid);
    for (let i = pids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pids[i], pids[j]] = [pids[j], pids[i]]; }
    const order = [];
    for (let r = 0; r < 13; r++) order.push(...(r % 2 === 0 ? pids : pids.slice().reverse()));
    local.draft = { order, pickNum: 0, currentPid: order[0], currentTeam: null };
    local.phase = "draft";
    localPrepareTurn();
    localRender();
  }

  function localPick(playerId) {
    const d = local.draft;
    if (!d) return;
    const opt = d.currentTeam.options.find((o) => o.id === playerId);
    if (!opt || !opt.eligible || localDrafted().has(playerId)) return;
    const cur = local.players.find((p) => p.pid === d.currentPid);
    cur.squad.push(LPLAYERS[playerId]);
    cur.spent += MODEL.marketValue(LPLAYERS[playerId]);
    d.pickNum++;
    if (d.pickNum >= d.order.length) {
      const teams = local.players.map((p) => ({ id: p.pid, name: p.name, players: p.squad, formationKey: p.formationKey }));
      // Tournoi progressif : forme, rotation et suspensions comptent.
      local.tstate = ENGINE.createTournament(teams);
      local.phase = "playing";
      local.reveal = { idx: 0, current: ENGINE.playNextRound(local.tstate) };
      local.roundStartedAt = Date.now();
    } else {
      localPrepareTurn();
    }
    localRender();
  }

  function localApi(type, extra) {
    if (type === "startGame") { if (local.players.length >= 2) localStart(); }
    else if (type === "pick") localPick(extra.playerId);
    else if (type === "rerollTeam") {
      const d = local.draft;
      if (local.phase === "draft" && d) {
        const cur = local.players.find((x) => x.pid === d.currentPid);
        if (cur && cur.rerolls > 0) { cur.rerolls--; localPrepareTurn(); localRender(); }
      }
    }
    else if (type === "nextMatch") {
      if (local.phase === "playing" && local.reveal && local.reveal.current) {
        ENGINE.settleRound(local.tstate, local.reveal.current);
        if (local.tstate.done) { local.tournament = ENGINE.finalizeTournament(local.tstate); local.phase = "results"; }
        else {
          local.reveal.current = ENGINE.playNextRound(local.tstate);
          local.reveal.idx++;
          local.roundStartedAt = Date.now();
          if (!local.reveal.current) { local.tournament = ENGINE.finalizeTournament(local.tstate); local.phase = "results"; }
        }
        localRender();
      }
    }
    else if (type === "playAgain" || type === "resetGame") { local.phase = "lobby"; local.draft = null; local.tournament = null; local.tstate = null; local.reveal = null; local.players.forEach((p) => { p.squad = []; p.spent = 0; }); localRender(); }
    else if (type === "setFormation") { const p = local.players.find((x) => x.pid === state.pid); if (p && MODEL.FORMATIONS[extra.formationKey]) { p.formationKey = extra.formationKey; localRender(); } }
    return Promise.resolve({ ok: true });
  }

  function connect() {
    if (state.es) state.es.close();
    const es = new EventSource(`events?code=${state.code}&pid=${state.pid}`);
    state.es = es;
    es.addEventListener("state", (e) => {
      state.snap = JSON.parse(e.data);
      // écart horloge client/serveur (les téléphones dérivent facilement)
      state.clockOffset = state.snap && state.snap.now ? state.snap.now - Date.now() : 0;
      render();
      // Mode capture : fermer le flux après le premier rendu pour les screenshots.
      if (new URLSearchParams(location.search).has("shot")) setTimeout(() => es.close(), 300);
    });
    es.addEventListener("pick", (e) => {
      const p = JSON.parse(e.data);
      const who = (state.snap && state.snap.players.find((x) => x.pid === p.pid)) || {};
      toast(`${flag(p.player.code)} ${who.teamName || who.name || "?"} → ${p.player.n}${p.auto ? " (auto)" : ""}`);
    });
  }

  const saveSession = () => { try { localStorage.setItem("fd_session", JSON.stringify({ code: state.code, pid: state.pid })); } catch (_) {} };

  // ---------- Accueil ----------
  $("btn-create").addEventListener("click", async () => {
    const r = await api("createRoom", { name: $("home-name").value.trim() || "Hôte" });
    if (r.ok) { state.code = r.code; state.pid = r.pid; saveSession(); connect(); } else $("home-error").textContent = r.error || "Erreur";
  });
  $("btn-join").addEventListener("click", async () => {
    const code = $("home-code").value.trim().toUpperCase();
    if (code.length !== 4) { $("home-error").textContent = "Code à 4 caractères."; return; }
    const r = await api("joinRoom", { code, name: $("home-name").value.trim() || "Joueur" });
    if (r.ok) { state.code = r.code; state.pid = r.pid; saveSession(); connect(); } else $("home-error").textContent = r.error || "Erreur";
  });
  $("home-code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });

  // Mode 1 téléphone : activation + ajout de joueurs
  $("btn-local").addEventListener("click", () => {
    local.active = true;
    const first = $("home-name").value.trim();
    if (first) localAddPlayer(first);
    localRender();
  });
  $("btn-local-add").addEventListener("click", () => {
    const name = $("local-name").value.trim();
    if (!name) return;
    localAddPlayer(name);
    $("local-name").value = "";
    localRender();
  });
  $("local-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-local-add").click(); });
  document.querySelectorAll("#mode-picker button").forEach((b) => b.addEventListener("click", () => api("setMode", { mode: b.dataset.mode })));
  document.querySelectorAll("#theme-picker button").forEach((b) => b.addEventListener("click", () => api("setTheme", { theme: b.dataset.theme })));

  // ---------- Lobby : club / maillot / formation ----------
  $("team-name").addEventListener("input", (e) => {
    clearTimeout(teamNameTimer);
    const v = e.target.value;
    teamNameTimer = setTimeout(() => api("setTeam", { teamName: v }), 350);
  });
  $("kit-primary").addEventListener("click", (e) => pickSwatch(e, "p"));
  $("kit-secondary").addEventListener("click", (e) => pickSwatch(e, "s"));
  $("kit-pattern").addEventListener("click", (e) => {
    const b = e.target.closest(".pat-btn"); if (!b) return;
    const kit = Object.assign({}, myKit(), { pat: b.dataset.pat }); api("setTeam", { kit });
  });
  function pickSwatch(e, key) {
    const sw = e.target.closest(".swatch"); if (!sw) return;
    const kit = Object.assign({}, myKit(), { [key]: sw.dataset.color }); api("setTeam", { kit });
  }
  const myKit = () => { const m = me(); return m ? m.kit : { p: "#1f6feb", s: "#ffffff", pat: "plain" }; };

  $("formation-picker").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    api("setFormation", { formationKey: b.dataset.f });
  });
  $("btn-start").addEventListener("click", () => api("startGame"));
  $("btn-again").addEventListener("click", () => api("playAgain"));
  $("btn-next-match").addEventListener("click", () => api("nextMatch"));
  $("shootout").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-dir]");
    if (!b) return;
    const role = b.parentElement.dataset.role;
    const pms = (state.snap && state.snap.playing && state.snap.playing.matches) || [];
    const mlp = pms.find((m) => m.livePen && m.livePen.phase === "await");
    const so = (pms.find((m) => m.shootout && !m.shootout.done) || {}).shootout;
    if (mlp) state.penPicked = "lp:" + mlp.a + ":" + mlp.b + ":" + mlp.livePen.m + ":" + state.pid;
    else if (so) state.penPicked = so.turn + ":" + state.pid;
    const r = await api(role === "kick" ? "penKick" : "penDive", { dir: b.dataset.dir });
    if (r && r.ok) { SND.ding(); vibe(60); }
  });
  document.querySelectorAll(".instr-btn").forEach((b) => b.addEventListener("click", async () => {
    const r = await api("setInstruction", { stance: b.dataset.st });
    if (r && r.ok) { SND.ding(); vibe(80); }
  }));
  $("btn-skip").addEventListener("click", () => api("skipReveal"));

  // Relancer l'équipe tirée au sort (2 max).
  $("btn-reroll").addEventListener("click", () => api("rerollTeam"));

  // Dock bas : ma compo (terrain) + toutes les compos.
  const CLOSE_X = '<button class="modal-close" aria-label="Fermer">✕</button>';
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".modal-close");
    if (b) { const m = b.closest(".modal"); if (m) m.classList.remove("on"); }
  });

  function openCompo() {
    const m = me();
    if (!m) return;
    let takerHtml = "";
    if (!local.active && m.squad.length) {
      const cands = m.squad.filter((p) => p.pos !== "GK");
      const cur = cands.find((p) => p.id === m.penTaker) || cands.slice().sort((u, v) => v.r - u.r)[0];
      takerHtml = cur ? `<div class="bench-row">🎯 Tireur de penalty : <b>${esc(cur.n)}</b>
        <button class="btn btn-ghost taker-btn" id="btn-taker">Changer</button></div>` : "";
    }
    $("compo-sheet").innerHTML = CLOSE_X + renderPitch(m) + takerHtml;
    const tb = document.getElementById("btn-taker");
    if (tb) tb.addEventListener("click", () => {
      const mm = me();
      const cands = mm.squad.filter((p) => p.pos !== "GK").sort((u, v) => v.r - u.r);
      const curIdx = Math.max(0, cands.findIndex((p) => p.id === mm.penTaker));
      const next = cands[(curIdx + 1) % cands.length];
      api("setPenTaker", { playerId: next.id }).then(() => setTimeout(openCompo, 150));
    });
    $("compo-modal").classList.add("on");
  }
  function openSquads() {
    if (!state.snap) return;
    $("squads-sheet").innerHTML = CLOSE_X + `<div class="round-title" style="margin-top:0">Toutes les compos</div>` + squadsHtml(state.snap.players);
    $("squads-modal").classList.add("on");
  }
  function openLiveTable() {
    const s0 = state.snap; if (!s0 || !s0.playing) return;
    const p = s0.playing;
    const elapsed = liveElapsed(p);
    const hold = p.goalHoldMs || 3500;
    const current = p.type === "league" ? p.matches.map((m) => {
      const mc = matchClock(elapsed, frzOf(m, p), p.clockMs, m.dur);
      const sc = scoreAt(m, mc.minute);
      return { a: m.a, b: m.b, ga: sc.ga, gb: sc.gb };
    }) : [];
    const teams = s0.players.map((pl) => ({ id: pl.pid }));
    const table = ENGINE.computeStandings(teams, (p.playedMatches || []).concat(current));
    const nameOf = (id) => { const pl = s0.players.find((x) => x.pid === id); return pl ? pl.teamName : "?"; };
    const K = teams.length >= 8 ? 8 : teams.length >= 4 ? 4 : 2;
    $("table-sheet").innerHTML = CLOSE_X + `
      <div class="round-title" style="margin-top:0">📊 Classement live${p.type === "league" ? " · " + esc(p.stage) : " · championnat terminé"}</div>
      <table class="ltable">
        <tr><th>#</th><th style="text-align:left">Équipe</th><th>J</th><th>DIFF</th><th>PTS</th></tr>
        ${table.map((r, i) => `<tr class="${i < K ? "qualif" : ""} ${r.id === state.pid ? "meline" : ""}">
          <td class="rk">${i + 1}</td>
          <td class="tname">${esc(nameOf(r.id))}${r.id === state.pid ? ' <span class="you-tag">TOI</span>' : ""}</td>
          <td>${r.played}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.pts}</td></tr>`).join("")}
      </table>
      <p class="hint">Mis à jour en direct avec les buts · les ${K} premiers vont en phases finales</p>`;
    $("table-modal").classList.add("on");
  }
  document.querySelectorAll(".js-table").forEach((b) => b.addEventListener("click", openLiveTable));
  document.querySelectorAll(".js-bracket").forEach((b) => b.addEventListener("click", openBracket));
  $("bracket-modal").addEventListener("click", (e) => { if (e.target.id === "bracket-modal") $("bracket-modal").classList.remove("on"); });
  $("table-modal").addEventListener("click", (e) => { if (e.target.id === "table-modal") $("table-modal").classList.remove("on"); });

  // Tableau du tournoi : progression de la poule + arbre à élimination directe.
  function openBracket() {
    const s0 = state.snap; if (!s0 || !s0.playing || !s0.playing.bracket) return;
    const p = s0.playing, bk = p.bracket;
    const nameOf = (id) => { const pl = s0.players.find((x) => x.pid === id); return pl ? pl.teamName : "?"; };
    const meCls = (id) => (id === state.pid ? " me" : "");
    const stages = Math.round(Math.log2(bk.koSize));
    const labelOf = (left) => ({ 1: "Finale", 2: "Demi-finales", 3: "Quarts" })[left] || "Tour";

    // — Poule : classement live (matchs passés + minute courante des matchs du jour)
    const elapsed = liveElapsed(p);
    const current = p.type === "league" ? p.matches.map((m) => {
      const mc = matchClock(elapsed, frzOf(m, p), p.clockMs, m.dur);
      const sc = scoreAt(m, mc.minute);
      return { a: m.a, b: m.b, ga: sc.ga, gb: sc.gb };
    }) : [];
    const teams = s0.players.map((pl) => ({ id: pl.pid }));
    const table = ENGINE.computeStandings(teams, (p.playedMatches || []).concat(current));
    const pouleRows = table.map((r, i) =>
      `<div class="bk-poule-row${i < bk.koSize ? " q" : ""}${meCls(r.id)}"><span>${i + 1}. ${esc(nameOf(r.id))}</span><span>${r.pts} pts</span></div>`).join("");
    const pouleTitle = bk.leaguePlayed >= bk.leagueRounds
      ? `✅ Poule terminée — top ${bk.koSize} qualifiés`
      : `Poule — journée ${bk.leaguePlayed}/${bk.leagueRounds} · top ${bk.koSize} qualifiés`;

    // — Arbre KO : tours joués (scores), tour en cours (LIVE), à venir (paires ou ?)
    const cell = (top, bottom, cls) => `<div class="bk-match ${cls || ""}">${top}${bottom}</div>`;
    const teamLine = (id, g, win, live) =>
      `<div class="bk-team${win ? " win" : ""}${meCls(id)}"><span>${esc(nameOf(id))}</span><b>${live ? "🔴" : (g != null ? g : "")}</b></div>`;
    const cols = [];
    for (let i = 0; i < stages; i++) {
      const label = labelOf(stages - i);
      const nSlots = Math.pow(2, stages - 1 - i);
      let cells = "";
      const played = bk.rounds[i];
      if (played) {
        cells = played.map((m) => m.live
          ? cell(teamLine(m.a, null, false, true), teamLine(m.b, null, false, true), "live")
          : cell(teamLine(m.a, m.ga + (m.pens ? ` (${m.pens.pa})` : ""), m.winner === m.a),
                 teamLine(m.b, m.gb + (m.pens ? ` (${m.pens.pb})` : ""), m.winner === m.b), "done")).join("");
      } else if (i === bk.rounds.length && bk.next) {
        cells = bk.next.map((pr) => cell(teamLine(pr[0], null, false, false), teamLine(pr[1], null, false, false), "next")).join("");
      } else {
        cells = Array.from({ length: nSlots }, () =>
          cell('<div class="bk-team tbd"><span>À déterminer</span></div>', '<div class="bk-team tbd"><span>—</span></div>', "tbd")).join("");
      }
      cols.push(`<div class="bk-col"><div class="bk-stage">${label}</div>${cells}</div>`);
    }
    const champHtml = bk.champion != null
      ? `<div class="bk-champ">🏆 Champion : <b>${esc(nameOf(bk.champion))}</b></div>` : "";

    $("bracket-sheet").innerHTML = CLOSE_X + `
      <div class="round-title" style="margin-top:0">🏆 Tableau du tournoi</div>
      <div class="bk-poule"><div class="bk-poule-title">${pouleTitle}</div>${pouleRows}</div>
      <div class="bk-wrap">${cols.join("")}</div>${champHtml}`;
    $("bracket-modal").classList.add("on");
  }

  function updateSndIcons() { document.querySelectorAll(".snd-ico").forEach((el) => { el.textContent = SND.muted ? "🔇" : "🔊"; }); }
  document.querySelectorAll(".js-sound").forEach((b) => b.addEventListener("click", () => {
    SND.muted = !SND.muted;
    try { localStorage.setItem("fd_mute", SND.muted ? "1" : "0"); } catch (_) {}
    updateSndIcons();
    if (!SND.muted) SND.ding();
  }));
  updateSndIcons();
  document.addEventListener("pointerdown", () => SND.ensure(), { once: true });

  document.querySelectorAll(".js-compo").forEach((b) => b.addEventListener("click", openCompo));
  document.querySelectorAll(".js-squads").forEach((b) => b.addEventListener("click", openSquads));
  $("compo-modal").addEventListener("click", (e) => { if (e.target.id === "compo-modal") $("compo-modal").classList.remove("on"); });
  // suivre un autre match du multiplex d'un tap
  $("live-prev").addEventListener("click", (e) => {
    const row = e.target.closest(".clickable-mx");
    if (row && state.snap && state.snap.phase === "playing") {
      state.watchKey = row.dataset.w;
      renderPlaying(state.snap);
    }
  });
  $("squads-modal").addEventListener("click", (e) => { if (e.target.id === "squads-modal") $("squads-modal").classList.remove("on"); });

  // Lien d'invitation : partage natif du téléphone, sinon copie.
  $("btn-share").addEventListener("click", async () => {
    if (!state.snap) return;
    const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "?room=" + state.snap.code;
    const btn = $("btn-share");
    if (navigator.share) {
      try { await navigator.share({ title: "Football Draft", text: "Rejoins ma session Football Draft ⚽", url }); return; } catch (_) {}
    }
    try { await navigator.clipboard.writeText(url); btn.textContent = "✓ Lien copié !"; }
    catch (_) { prompt("Copie ce lien :", url); }
    setTimeout(() => { btn.textContent = "🔗 Partager le lien d'invitation"; }, 2500);
  });

  // Au retour au premier plan (téléphone déverrouillé), rétablir le flux.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.code && state.pid && !local.active) {
      if (!state.es || state.es.readyState === 2) connect();
    }
  });

  // Réinitialisation d'urgence (confirmée) — accessible à tous les joueurs.
  const confirmReset = () => { if (confirm("Réinitialiser la partie pour tout le monde et revenir au salon ?")) api("resetGame"); };
  ["btn-reset-lobby", "btn-reset-results"].forEach((id) => $(id).addEventListener("click", confirmReset));
  document.querySelectorAll(".js-reset").forEach((b) => b.addEventListener("click", confirmReset));

  // Quitter la session : retour à l'accueil (et libère sa place au salon).
  $("btn-leave").addEventListener("click", () => {
    if (!confirm("Quitter cette session ?")) return;
    api("leaveRoom");
    if (state.es) state.es.close();
    try { localStorage.removeItem("fd_session"); } catch (_) {}
    if (local.active) { local.active = false; local.players = []; local.phase = "lobby"; local.draft = null; local.tournament = null; local.reveal = null; }
    state.code = null; state.pid = null; state.snap = null;
    show("screen-home");
  });

  // ---------- Onglets ----------
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
    document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("on"));
    t.classList.add("on"); $("tab-" + t.dataset.tab).classList.add("on");
  });

  // ---------- Rendu principal ----------
  function render() {
    const s = state.snap; if (!s) return;
    if (s.phase !== "playing") { clearInterval(liveInterval); cancelAnimationFrame(state.simRaf); state.sim = null; state.liveRoundKey = null; }
    if (s.phase === "lobby") { renderLobby(s); show("screen-lobby"); }
    else if (s.phase === "draft") { renderDraft(s); show("screen-draft"); }
    else if (s.phase === "playing") { renderPlaying(s); show("screen-playing"); }
    else if (s.phase === "results") { renderResults(s); show("screen-results"); }
  }

  // ---------- Diffusion en direct façon FM (journée par journée) ----------
  const fmtM = (v) => (v >= 10 ? String(Math.round(v)) : String(v).replace(".", ",")) + " M€";
  let liveInterval = null;

  // Ne réécrit le DOM que si le contenu a changé (évite tout clignotement).
  function setHtml(el, html) { if (el && el.__html !== html) { el.__html = html; el.innerHTML = html; } }
  function setText(el, txt) { if (el && el.__txt !== txt) { el.__txt = txt; el.textContent = txt; } }

  // Horloge d'un match : linéaire 0'->90', figée sur chaque gel (célébration
  // de but `hold` ms, fenêtre de penalty `penHold` ms).
  // minuteF (continue) pilote la simulation ; holdT = avancement du gel.
  function matchClock(elapsed, freezes, clockMs, dur) {
    const D = dur || 90;
    let holds = 0;
    for (const f of freezes) {
      const tg = (f.m / 90) * clockMs + holds;
      if (elapsed < tg) break;
      if (elapsed < tg + f.len) return { minute: f.m, minuteF: f.m, holding: f.ev, holdT: (elapsed - tg) / f.len, ft: false };
      holds += f.len;
    }
    const mf = Math.max(0, Math.min(D, ((elapsed - holds) / clockMs) * 90));
    return { minute: Math.floor(mf), minuteF: mf, holding: null, holdT: 0, ft: elapsed - holds >= (clockMs * D) / 90 };
  }
  // Gels d'un match (p = snap.playing) : penHold serveur, 0 en mode local.
  const frzOf = (m, p) => ENGINE.freezesOf(m, p.goalHoldMs || 3500, p.penHoldMs || 0);
  const goalsOf = (m) => (m.events || []).filter((e) => e.type === "goal").sort((a, b) => a.m - b.m);

  // Horloge alignée sur le serveur : les téléphones ont souvent quelques
  // secondes (voire minutes) de décalage — sans correction, le direct peut
  // démarrer figé ou afficher « TERMINÉ » d'entrée. snap.now donne l'heure
  // du serveur à chaque diffusion ; on en déduit l'écart local.
  const srvNow = () => Date.now() + (state.clockOffset || 0);
  const liveElapsed = (p) => srvNow() - p.startedAt;

  function renderPlaying(s) {
    clearInterval(timerInterval);
    const p = s.playing; if (!p) return;
    const isLocal = s.code === "LOCAL";
    $("play-stage").textContent = `${p.stage} · ${p.round}/${p.totalRounds}`;
    // Chacun suit SON match ; en mode 1 téléphone, le premier match en vedette.
    const mine = isLocal ? null : p.matches.find((m) => m.a === state.pid || m.b === state.pid);
    let featured = mine || (isLocal ? p.matches[0] : null);
    // choix multiplex : suivre un autre match de la journée
    if (state.watchKey) {
      const w = p.matches.find((m) => m.a + ":" + m.b === state.watchKey);
      if (w) featured = w;
    }

    // Squelette construit une seule fois par journée : ensuite on ne met à
    // jour que les chiffres/fils, pas de reconstruction -> pas de clignotement.
    const roundKey = s.code + "|" + p.stage + "|" + p.round;
    if (state.liveRoundKey !== roundKey) { state.watchKey = null; if (mine || isLocal) featured = mine || p.matches[0]; }
    const evSig = featured ? (featured.events || []).length + ":" + featured.ga + "-" + featured.gb + ":" + (featured.stanceA || "") + (featured.stanceB || "") + ":" + (featured.events || []).filter((e) => e.pending).length + ":" + (featured.dur || 90) : "-";
    const simKey = roundKey + "|" + (featured ? featured.a + ":" + featured.b : "-") + "|" + evSig;
    if (state.liveSimKey !== simKey) {
      state.liveRoundKey = roundKey;
      state.liveSimKey = simKey;
      buildLiveSkeleton(p, featured, mine === featured ? mine : null, isLocal);
      state.ambient = featured
        ? buildAmbient(featured, mulberry(((featured.a * 2654435761) ^ (featured.b * 40503)) >>> 0)) : [];
      state.sim = featured ? mountSim(featured, p) : null;
    }

    clearInterval(liveInterval);
    const tick = () => drawLive(p, featured, isLocal);
    tick();
    liveInterval = setInterval(tick, 300);

    // Boucle fluide (60 fps) : positions des joueurs et du ballon.
    cancelAnimationFrame(state.simRaf);
    if (featured && state.sim) {
      const loop = () => {
        if (!state.snap || state.snap.phase !== "playing" || !state.sim) return;
        state.sim.draw(matchClock(liveElapsed(p), frzOf(featured, p), p.clockMs, featured.dur), Date.now(), featured.livePen);
        state.simRaf = requestAnimationFrame(loop);
      };
      state.simRaf = requestAnimationFrame(loop);
    }
  }

  function buildLiveSkeleton(p, featured, mine, isLocal) {
    const kitOf = (pid) => { const pl = (state.snap.players || []).find((x) => x.pid === pid); return pl && pl.kit; };
    if (featured) {
      $("live-card").innerHTML = `
        <div class="lc-stage">${esc(p.stage)} · ${mine ? "TON MATCH" : "MATCH VEDETTE"} <span class="live-min" id="live-min">0'</span></div>
        <div class="lc-row">
          <span class="lc-team ${featured.a === state.pid ? "me" : ""}"><span class="lc-kit">${kitSvg(kitOf(featured.a))}</span><span class="lc-tname">${esc(featured.an)}</span></span>
          <span class="lc-score"><span id="live-ga">0</span> - <span id="live-gb">0</span></span>
          <span class="lc-team ${featured.b === state.pid ? "me" : ""}"><span class="lc-kit">${kitSvg(kitOf(featured.b))}</span><span class="lc-tname">${esc(featured.bn)}</span></span>
        </div>
        <div class="lc-cards"><span id="live-cards-a"></span><span id="live-cards-b"></span></div>
        <div class="lc-pens" id="live-pens" style="display:none"></div>`;
    } else {
      $("live-card").innerHTML = `<div class="lc-stage">${esc(p.stage)} · MULTIPLEX <span class="live-min" id="live-min">0'</span></div>`;
      $("live-stage").innerHTML = "";
    }
    $("live-summary").innerHTML = '<div class="live-feed" id="live-feed"></div><p class="hint" id="live-hint"></p>';
    $("live-prev").innerHTML = "";
    ["live-card", "live-summary", "live-prev"].forEach((id) => { const el = $(id); if (el) el.__html = undefined; });
  }

  // ---------- Replay d'action : 11 contre 11 sur terrain complet ----------

  // Tracé du terrain complet (partagé avec la feuille de match).
  function fmLinesSvg() {
    return `<g fill="none" stroke="rgba(255,255,255,.38)" stroke-width="0.45">
      <rect x="1.5" y="1.5" width="97" height="61"/>
      <line x1="50" y1="1.5" x2="50" y2="62.5"/><circle cx="50" cy="32" r="9.5"/>
      <rect x="1.5" y="16" width="13" height="32"/><rect x="1.5" y="25" width="5" height="14"/>
      <path d="M 14.5 26 A 8 8 0 0 1 14.5 38"/>
      <rect x="85.5" y="16" width="13" height="32"/><rect x="93.5" y="25" width="5" height="14"/>
      <path d="M 85.5 38 A 8 8 0 0 1 85.5 26"/>
      <path d="M 1.5 5 A 3.5 3.5 0 0 0 5 1.5"/><path d="M 95 1.5 A 3.5 3.5 0 0 0 98.5 5"/>
      <path d="M 1.5 59 A 3.5 3.5 0 0 1 5 62.5"/><path d="M 95 62.5 A 3.5 3.5 0 0 1 98.5 59"/>
    </g>
    <g fill="rgba(255,255,255,.5)"><circle cx="50" cy="32" r="0.8"/><circle cx="10" cy="32" r="0.8"/><circle cx="90" cy="32" r="0.8"/></g>`;
  }

  // Position d'un slot de formation sur le terrain horizontal.
  // side "a" = moitié gauche (attaque vers la droite), "b" = miroir.
  function slotPoint(slot, side) {
    const d = 100 - slot.y; // profondeur depuis son propre but
    return { x: side === "a" ? 3.5 + d * 0.44 : 96.5 - d * 0.44, y: 4.5 + slot.x * 0.55 };
  }

  // Les onze d'une équipe placés dans SA formation réelle.
  function teamSetup(pid, side) {
    const pl = (state.snap.players || []).find((x) => x.pid === pid) || {};
    const placement = MODEL.placeInSlots(pl.squad || [], pl.formationKey || "4-3-3");
    const dots = placement.filter((s) => s.player).map((s) => ({
      n: s.player.n, pos: s.slot.pos, p: slotPoint(s.slot, side),
    }));
    const kitFull = pl.kit || { p: side === "a" ? "#e11d2a" : "#1f6feb", s: "#ffffff", pat: "plain" };
    return { dots, kit: kitFull.p, kitFull };
  }

  // ---------- Simulation du terrain ----------
  // Le moteur (timeline de possession + rendu 60 fps + scènes de penalty et
  // de célébration) vit dans sim.js — réécrit de zéro en v31. Ici, on ne
  // garde que le montage (mountSim) et les commentaires d'ambiance du fil.
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Commentaires d'ambiance (déterministes) pour habiller le fil du match.
  function buildAmbient(match, rng) {
    const an = match.an, bn = match.bn;
    const sc45 = { ga: 0, gb: 0 };
    (match.events || []).forEach((e) => { if (e.type === "goal" && e.m <= 45) { if (e.side === "a") sc45.ga++; else sc45.gb++; } });
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const list = [
      { m: 1, text: `🟢 Coup d'envoi ! ${pick([an, bn])} engage.` },
      { m: 16 + Math.floor(rng() * 16), text: pick([
        `⚔️ Le milieu de ${an} prend le contrôle du jeu.`,
        `🔥 Quel rythme ! Ça se rend coup pour coup.`,
        `🧱 ${bn} défend bas et guette le contre.`,
        `🎯 ${an} fait circuler patiemment, ${bn} coulisse bien.`,
      ]) },
      { m: 45, text: `⏸️ Mi-temps : ${an} ${sc45.ga} - ${sc45.gb} ${bn}.` },
      { m: 56 + Math.floor(rng() * 16), text: pick([
        `📣 Le public pousse, l'intensité monte d'un cran !`,
        `🔁 Ça s'organise sur les bancs, les consignes pleuvent.`,
        `💨 ${bn} accélère sur les ailes, ça sent l'occasion.`,
        `🥵 Les organismes fatiguent, des espaces s'ouvrent.`,
      ]) },
      { m: 83 + Math.floor(rng() * 5), text: `⏱️ Dernières minutes… tout peut encore arriver !` },
    ];
    if ((match.dur || 90) > 90) list.push({ m: 90, text: "🔥 PROLONGATION ! 30 minutes pour se départager." });
    return list;
  }

  // Construit la scène (22 joueurs + ballon) et l'état de simulation.
  // Monte la simulation du match vedette dans #live-stage (module SIM).
  function mountSim(match, p) {
    const A = teamSetup(match.a, "a"), B = teamSetup(match.b, "b");
    if (A.kit.toLowerCase() === B.kit.toLowerCase()) { B.kit = "#f1f3f5"; B.kitFull = { p: "#f1f3f5", s: "#20342a", pat: B.kitFull.pat }; }
    return SIM.mount($("live-stage"), {
      a: A, b: B, events: match.events || [], dur: match.dur || 90,
      seed: ((match.a * 73856093) ^ (match.b * 19349663)) >>> 0,
      penLive: (p.penHoldMs || 0) > 0,
      linesSvg: fmLinesSvg(),
      prev: state.sim && state.sim.dots,
      // révélation du penalty : le son part quand le ballon arrive
      onPenReveal: (type) => { if (type === "goal") { SND.goal(); vibe(160); } else { SND.ooh(); vibe(70); } },
    });
  }

  // Homme du match : meilleur buteur, sinon gardien décisif, sinon plus remuant.
  function motmOf(events) {
    const evs = events || [];
    const goals = {}, saves = {}, tries = {};
    evs.forEach((e) => {
      if (e.type === "yellow" || e.type === "red") return;
      if (e.type === "goal") goals[e.scorer] = (goals[e.scorer] || 0) + 1;
      if (e.type === "saved") saves[e.gkName] = (saves[e.gkName] || 0) + 1;
      tries[e.scorer] = (tries[e.scorer] || 0) + 1;
    });
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    const g = top(goals);
    if (g) return { name: g[0], why: g[1] > 1 ? g[1] + " buts" : "buteur décisif" };
    const sv = top(saves);
    if (sv && sv[1] >= 2) return { name: sv[0], why: sv[1] + " arrêts" };
    const tr = top(tries);
    if (tr) return { name: tr[0], why: "le plus dangereux" };
    return null;
  }

  // Score d'un match à la minute donnée.
  function scoreAt(m, minute) {
    if (minute >= 90) return { ga: m.ga, gb: m.gb };
    let ga = 0, gb = 0;
    (m.events || []).forEach((e) => { if (e.type === "goal" && e.m <= minute) { if (e.side === "a") ga++; else gb++; } });
    return { ga, gb };
  }

  function drawLive(p, featured, isLocal) {
    const elapsed = liveElapsed(p);
    const hold = p.goalHoldMs || 3500;
    const endOf = (m) => (p.clockMs * (m.dur || 90)) / 90 + frzOf(m, p).reduce((t, f) => t + f.len, 0);
    const anyShootout = p.matches.some((m) => m.shootout && !m.shootout.done);
    const ftAll = !anyShootout && p.matches.every((m) => elapsed >= endOf(m));

    if (featured) {
      const mc = matchClock(elapsed, frzOf(featured, p), p.clockMs, featured.dur);
      // Ambiance : sifflet d'engagement, clameur sur but (+ vibration),
      // "ooh" sur occasion, triple sifflet au coup de sifflet final.
      const snd = state.snd || (state.snd = {});
      if (snd.round !== state.liveRoundKey) { snd.round = state.liveRoundKey; snd.holdKey = null; snd.ft = false; snd.seen = 0; SND.whistle(1); }
      // Pendant une fenêtre de penalty, sons et révélations attendent que le
      // ballon arrive (penScene pose sim.penDone) — pas de spoiler.
      const isPenHold = !!(mc.holding && mc.holding.pen && state.sim && state.sim.penLive);
      if (mc.holding) {
        const hk = mc.holding.m + "|" + mc.holding.scorer + "|" + (mc.holding.pending ? "?" : mc.holding.type);
        if (snd.holdKey !== hk) {
          snd.holdKey = hk;
          const mySide = featured.a === state.pid ? "a" : featured.b === state.pid ? "b" : null;
          if (mc.holding.pending) { SND.whistle(1); vibe(120); } // faute sifflée !
          else if (!isPenHold && mc.holding.type === "goal") {
            SND.goal();
            vibe(mc.holding.side === mySide ? [90, 50, 90, 50, 280] : 160);
          }
        }
      }
      if (mc.ft && !snd.ft) { snd.ft = true; SND.whistle(3); }
      setText($("live-min"), mc.ft ? "TERMINÉ" : mc.minute + "'");
      $("live-min").classList.toggle("ft", mc.ft);
      const sc = scoreAt(featured, mc.minute);
      setText($("live-ga"), String(sc.ga));
      setText($("live-gb"), String(sc.gb));
      // cartons reçus jusqu'à la minute courante, illustrés sous le score
      const cardsOf = (side) => {
        const evs = (featured.events || []).filter((e) => e.m <= mc.minute && e.side === side);
        const y = evs.filter((e) => e.type === "yellow").length, r = evs.filter((e) => e.type === "red").length;
        return (y ? "🟨" + (y > 1 ? "×" + y : "") : "") + (r ? (y ? " " : "") + "🟥" + (r > 1 ? "×" + r : "") : "");
      };
      setText($("live-cards-a"), cardsOf("a"));
      setText($("live-cards-b"), cardsOf("b"));
      const pensEl = $("live-pens");
      if (mc.ft && featured.pens) { pensEl.style.display = ""; setText(pensEl, `Tirs au but : ${featured.pens.pa} - ${featured.pens.pb}`); }

      const seen = (featured.events || []).filter((e) => e.m <= mc.minute);
      if (seen.length > (state.snd.seen || 0)) {
        const newest = seen[seen.length - 1];
        if (newest && newest.type !== "goal") {
          if (newest.type === "yellow" || newest.type === "red") SND.whistle(1);
          else SND.ooh();
        }
        state.snd.seen = seen.length;
      }
      // Célébration : l'horloge est figée sur le but -> grande animation.
      // (deux buts à la même minute enchaînent deux célébrations distinctes)
      let ovEl = document.getElementById("goal-overlay");
      // L'overlay n'apparaît que pour un VRAI but : jamais pendant qu'un
      // penalty se prépare, et pour un penalty transformé seulement une fois
      // le ballon au fond (la scène du terrain reste visible avant ça).
      const showOv = mc.holding && mc.holding.type === "goal" && !mc.holding.pending
        && (!isPenHold || (state.sim && state.sim.penDone));
      if (showOv) {
        const okey = mc.holding.m + "|" + mc.holding.scorer;
        if (ovEl && ovEl.dataset.k !== okey) { ovEl.remove(); ovEl = null; }
        if (!ovEl) {
          const pitch = $("live-stage").querySelector(".fm-pitch");
          if (pitch) pitch.insertAdjacentHTML("beforeend",
            `<div id="goal-overlay" class="goal-overlay" data-k="${esc(okey)}"><span>⚽ BUUUT !</span><b>${esc(mc.holding.scorer)}</b><i>${esc(mc.holding.teamName)}</i></div>`);
        }
      } else if (ovEl) { ovEl.remove(); }

      const amb = (state.ambient || []).filter((c) => c.m <= mc.minute);
      const lines = seen.map((e) => ({ m: e.m, cls: e.type === "goal" ? "goal" : "", text: e.text }))
        .concat(amb.map((c) => ({ m: c.m, cls: "amb", text: c.text })));
      if (mc.ft) {
        const motm = motmOf(featured.events);
        if (motm) lines.push({ m: 90, cls: "goal", text: `⭐ Homme du match : ${motm.name} (${motm.why})` });
        (featured.injured || []).forEach((inj) => lines.push({ m: 90, cls: "amb", text: `🚑 ${inj.n} touché — forfait pour le prochain match.` }));
      }
      if (ftAll) {
        // flash des autres terrains
        p.matches.filter((m) => m !== featured).forEach((m) => {
          const mo = motmOf(m.events);
          lines.push({ m: 91, cls: "amb", text: `🏟️ ${m.an} ${m.ga}-${m.gb}${m.pens ? ` (${m.pens.pa}-${m.pens.pb} tab)` : ""} ${m.bn}${mo ? ` — ⭐ ${mo.name}` : ""}` });
        });
      }
      lines.sort((a, b) => b.m - a.m);
      setHtml($("live-feed"),
        lines.map((l) => `<div class="evline ${l.cls}"><span class="min">${l.m}'</span><span class="etxt">${esc(l.text)}</span></div>`).join("")
        || `<div class="evline"><span class="min">1'</span><span class="etxt">🟢 Coup d'envoi !</span></div>`);

      // Instructions tactiques : uniquement sur MON match, avant la 85e.
      const isMyMatch = featured.a === state.pid || featured.b === state.pid;
      const uses = (featured.instr && featured.instr[state.pid]) || 0;
      const showInstr = isMyMatch && !isLocal && !mc.ft && mc.minute < 85;
      $("instr-row").style.display = showInstr ? "" : "none";
      $("instr-hint").style.display = showInstr ? "" : "none";
      if (showInstr) {
        const myStance = featured.a === state.pid ? featured.stanceA : featured.stanceB;
        document.querySelectorAll(".instr-btn").forEach((b) => {
          b.classList.toggle("on", b.dataset.st === (myStance || "bal"));
          b.disabled = uses >= 3;
        });
        setText($("instr-hint"), uses >= 3
          ? "Plus de changement tactique disponible (3 max)."
          : `Consigne pour ton équipe · ${3 - uses} changement${3 - uses > 1 ? "s" : ""} restant${3 - uses > 1 ? "s" : ""}`);
      }
    } else {
      const raw = Math.max(0, Math.min(90, Math.floor((elapsed / p.clockMs) * 90)));
      setText($("live-min"), ftAll ? "TERMINÉ" : raw + "'");
      $("live-min").classList.toggle("ft", ftAll);
      $("instr-row").style.display = "none";
      $("instr-hint").style.display = "none";
    }

    // Mini-cage 3 zones : où le tireur a frappé (⚽/❌) et où le gardien a plongé (🧤).
    const penCage = (dir, dive, out) => {
      const cell = (z) => `<i class="${dive === z ? "gk" : ""}${dir === z ? " shot" : ""}">${dive === z ? "🧤" : ""}${dir === z ? (out === "goal" ? "⚽" : dive === z ? "" : "❌") : ""}</i>`;
      return `<div class="pen-goal">${cell("L")}${cell("C")}${cell("R")}</div>`;
    };
    const penBtns = (role) => `
      <div class="pen-btns" data-role="${role}">
        <button data-dir="L">⬅️ Gauche</button>
        <button data-dir="C">⏺ Centre</button>
        <button data-dir="R">➡️ Droite</button>
      </div>`;

    // Penalty en cours de match : la partie adverse choisit le plongeon.
    const lp = featured && featured.livePen;
    const so = featured && featured.shootout;
    if (lp) {
      const secs = Math.max(0, Math.ceil((lp.deadline - srvNow()) / 1000));
      const iKick = (lp.side === "a" ? featured.a : featured.b) === state.pid;
      const iDive = (lp.side === "a" ? featured.b : featured.a) === state.pid;
      const pickedKey = "lp:" + featured.a + ":" + featured.b + ":" + lp.m + ":" + state.pid;
      const canPick = lp.phase === "await" && state.penPicked !== pickedKey && (iKick || iDive);
      // Le panneau ne révèle l'issue qu'une fois le ballon arrivé dans la
      // scène du terrain (sim.penDone) — l'élan et le vol restent du suspense.
      const revealed = lp.phase !== "await" && (!state.sim || !state.sim.penLive || state.sim.penDone);
      const outLine = lp.out === "goal" ? `✅ BUT ! ${esc(lp.scorer)} transforme !`
        : lp.out === "saved" ? `🧤 ARRÊTÉ ! ${esc(lp.gkName)} était du bon côté !`
        : `❌ À CÔTÉ ! ${esc(lp.scorer)} manque le cadre !`;
      setHtml($("shootout"), `
        <div class="pen-panel">
          <div class="pen-title">🎯 PENALTY À LA ${lp.m}ᵉ !</div>
          ${!revealed
            ? `<div class="pen-now">⚽ <b>${esc(lp.scorer)}</b> face à <b>${esc(lp.gkName)}</b>… ${lp.phase === "await" ? `<span class="pen-timer">${secs}s</span>` : "🥁"}</div>`
            : `${penCage(lp.dir, lp.dive, lp.out)}<div class="pen-now ${lp.out === "goal" ? "ok" : "ko"}">${outLine}</div>`}
          ${canPick ? `<div class="pen-q">${iKick ? "Où tires-tu ?" : "Où plonge ton gardien ?"}</div>${penBtns(iKick ? "kick" : "dive")}`
            : (lp.phase === "await" && (iKick || iDive) ? '<p class="hint">✓ Choix enregistré — suspense…</p>' : "")}
        </div>`);
      // son de révélation (une seule fois par penalty) — la scène du terrain
      // s'en charge quand elle tourne, ceci n'est qu'un filet de sécurité
      const snd2 = state.snd || (state.snd = {});
      const lpKey = featured.a + ":" + featured.b + ":" + lp.m + ":" + lp.phase;
      if (lp.phase === "reveal" && snd2.lpKey !== lpKey && (!state.sim || !state.sim.penLive)) {
        snd2.lpKey = lpKey;
        if (lp.out === "goal") SND.goal(); else SND.ooh();
      }
    } else if (so) {
      // Séance de tirs au but : panneau interactif
      const secs = Math.max(0, Math.ceil((so.deadline - srvNow()) / 1000));
      const iKick = featured && ((so.kicker && so.kicker.side === "a" ? featured.a : featured.b) === state.pid);
      const iDive = featured && ((so.kicker && so.kicker.side === "a" ? featured.b : featured.a) === state.pid);
      const row = (side) => so.kicks.filter((k) => k.side === side).map((k) => k.scored ? "🟢" : "🔴").join(" ") || "—";
      const last = so.kicks[so.kicks.length - 1];
      const pickedKey = so.turn + ":" + state.pid;
      const canPick = so.phase === "await" && state.penPicked !== pickedKey && (iKick || iDive);
      setHtml($("shootout"), `
        <div class="pen-panel">
          <div class="pen-title">⚔️ TIRS AU BUT</div>
          <div class="pen-score"><span>${esc(featured.an)}</span><b>${so.pa} - ${so.pb}</b><span>${esc(featured.bn)}</span></div>
          <div class="pen-rows"><div>${row("a")}</div><div>${row("b")}</div></div>
          ${so.done
            ? `<div class="pen-now">🏁 ${so.pa > so.pb ? esc(featured.an) : esc(featured.bn)} l'emporte aux tirs au but !</div>`
            : so.phase === "await"
              ? `<div class="pen-now">🎯 <b>${esc(so.kicker.name)}</b> s'élance… <span class="pen-timer">${secs}s</span></div>`
              : `${last ? penCage(last.dir, last.dive, last.scored ? "goal" : (last.dir === last.dive ? "saved" : "off")) : ""}
                 <div class="pen-now ${last && last.scored ? "ok" : "ko"}">${last ? (last.scored ? `✅ BUT de ${esc(last.name)} !` : last.dir === last.dive ? `🧤 ARRÊTÉ ! Le gardien était du bon côté` : `❌ MANQUÉ ! ${esc(last.name)} tire à côté !`) : ""}</div>`}
          ${canPick ? `<div class="pen-q">${iKick ? "Où tires-tu ?" : "Où plonge ton gardien ?"}</div>${penBtns(iKick ? "kick" : "dive")}`
            : (so.phase === "await" && (iKick || iDive) ? '<p class="hint">✓ Choix enregistré — suspense…</p>' : "")}
        </div>`);
    } else {
      setHtml($("shootout"), "");
    }

    const others = p.matches.filter((m) => m !== featured);
    setText($("live-prev-title"), featured ? "Multiplex — touche un match pour le suivre" : "Tous les matchs");
    $("live-prev-title").style.display = others.length ? "" : "none";
    const kitOf2 = (pid) => { const pl = (state.snap.players || []).find((x) => x.pid === pid); return pl && pl.kit; };
    setHtml($("live-prev"), others.map((m) => {
      const omc = matchClock(elapsed, frzOf(m, p), p.clockMs, m.dur);
      const sc = scoreAt(m, omc.minute);
      const lastGoal = goalsOf(m).filter((e) => e.m <= omc.minute).pop();
      const isMine = m.a === state.pid || m.b === state.pid;
      return `<div class="match clickable-mx ${isMine ? "mymatch" : ""}" data-w="${m.a}:${m.b}">
        <span class="side"><span class="kit-tag">${kitSvg(kitOf2(m.a))}</span><span class="${m.a === state.pid ? "me" : ""}">${esc(m.an)}</span></span>
        <span class="score">${sc.ga}-${sc.gb}${omc.ft && m.pens ? `<span class="pens"> (${m.pens.pa}-${m.pens.pb})</span>` : ""}</span>
        <span class="side" style="justify-content:flex-end"><span class="${m.b === state.pid ? "me" : ""}">${esc(m.bn)}</span><span class="kit-tag">${kitSvg(kitOf2(m.b))}</span></span>
      </div>${lastGoal && !omc.ft ? `<div class="mplex-last">⚽ ${lastGoal.m}' ${esc(lastGoal.scorer)}</div>` : ""}`;
    }).join(""));

    // Journée suivante : en local un bouton quand TOUS les matchs sont finis,
    // en ligne le serveur avance seul.
    const nextBtn = $("btn-next-match");
    nextBtn.style.display = isLocal && ftAll ? "" : "none";
    nextBtn.textContent = p.round >= p.totalRounds ? "Voir les résultats 🏆" : "Journée suivante ▶";
    $("btn-skip").style.display = !isLocal && isHost() ? "" : "none";
    setText($("live-hint"), !isLocal && ftAll ? "Tous les matchs sont terminés — journée suivante dans un instant…" : "");
  }

  // ---------- Lobby ----------
  let qrDrawn = null;
  function renderLobby(s) {
    state.tkToasted = false;
    const isLocal = s.code === "LOCAL";
    $("lobby-code").textContent = isLocal ? "📱" : s.code;
    $("lobby-code-big").textContent = s.code;
    $("lobby-count").textContent = s.players.length;

    // Mode 1 téléphone : pas de QR ni de personnalisation individuelle.
    $("qr-card").style.display = isLocal ? "none" : "";
    $("club-config").style.display = isLocal ? "none" : "";
    $("formation-config").style.display = isLocal ? "none" : "";
    $("local-setup").style.display = isLocal ? "" : "none";
    if (isLocal) {
      $("lobby-players").innerHTML = s.players.map((p) => `
        <li><div class="kit-mini">${kitSvg(p.kit)}</div>
          <div class="pinfo"><div class="pteam">${esc(p.name)}</div><div class="pmgr">${p.formationKey}</div></div></li>`).join("");
      const startBtn = $("btn-start");
      startBtn.style.display = "";
      startBtn.disabled = s.players.length < 2;
      $("lobby-hint").textContent = s.players.length < 2
        ? "Ajoute au moins 2 joueurs pour lancer le draft."
        : `${s.players.length} joueurs — on se passe le téléphone à chaque tour.`;
      return;
    }

    // options de partie : l'hôte choisit, les autres voient
    $("game-options").style.display = isLocal ? "none" : "";
    document.querySelectorAll("#mode-picker button").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === (s.mode || "snake"));
      b.disabled = !isHost();
    });
    document.querySelectorAll("#theme-picker button").forEach((b) => {
      b.classList.toggle("on", b.dataset.theme === (s.theme || "all"));
      b.disabled = !isHost();
    });
    const pal = s.palmares || [];
    $("palmares-box").style.display = pal.length ? "" : "none";
    if (pal.length) setHtml($("palmares-list"), pal.map((r) =>
      `<div class="pal-row"><span>${esc(r.name)}</span><span>${r.titles ? `🏆 ×${r.titles}` : ""}${r.titles && r.finals ? " · " : ""}${r.finals ? `🥈 ×${r.finals}` : ""}</span></div>`).join(""));

    if (qrDrawn !== s.code) {
      // Le QR est limité à ~106 octets : si l'URL est trop longue, on affiche
      // seulement le code au lieu de faire échouer tout le rendu du lobby.
      try {
        const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "?room=" + s.code;
        $("qr-holder").innerHTML = renderQR(url);
      } catch (_) {
        $("qr-holder").innerHTML = '<p class="hint">QR indisponible — partage le code ci-dessous.</p>';
      }
      qrDrawn = s.code;
    }

    const m = me();
    const kit = myKit();
    $("kit-preview").innerHTML = kitSvg(kit);
    const tn = $("team-name");
    if (document.activeElement !== tn) tn.value = (m && m.teamName && m.teamName !== m.name) ? m.teamName : "";

    $("kit-primary").innerHTML = KIT_PALETTE.map((c) =>
      `<div class="swatch ${c === kit.p ? "on" : ""}" data-color="${c}" style="background:${c}"></div>`).join("");
    $("kit-secondary").innerHTML = KIT_PALETTE.map((c) =>
      `<div class="swatch ${c === kit.s ? "on" : ""}" data-color="${c}" style="background:${c}"></div>`).join("");
    $("kit-pattern").innerHTML = PATTERNS.map((pt) =>
      `<div class="pat-btn ${pt === kit.pat ? "on" : ""}" data-pat="${pt}">${kitSvg({ p: kit.p, s: kit.s, pat: pt })}</div>`).join("");

    $("formation-picker").innerHTML = MODEL.formationsForSize(11).map((f) =>
      `<button class="${m && m.formationKey === f ? "on" : ""}" data-f="${f}">${f}</button>`).join("");

    $("lobby-players").innerHTML = s.players.map((p) => `
      <li>
        <div class="kit-mini">${kitSvg(p.kit)}</div>
        <div class="pinfo">
          <div class="pteam">${esc(p.teamName)}${p.pid === state.pid ? '<span class="you-tag">TOI</span>' : ""}</div>
          <div class="pmgr">${esc(p.name)} · ${p.formationKey}</div>
        </div>
        ${p.isHost ? '<span class="badge-host">HÔTE</span>' : ""}
        <span class="dot ${p.connected ? "" : "off"}"></span>
      </li>`).join("");

    const startBtn = $("btn-start");
    if (isHost()) {
      startBtn.style.display = ""; startBtn.disabled = s.players.length < 2;
      $("lobby-hint").textContent = s.players.length < 2 ? "Il faut au moins 2 managers." : "Prêt à drafter !";
    } else { startBtn.style.display = "none"; $("lobby-hint").textContent = "En attente que l'hôte lance la partie…"; }
  }

  // ---------- Draft ----------
  function renderDraft(s) {
    const d = s.draft;
    // mon effectif est complet : un rappel pour désigner le tireur de penalty
    if (!state.tkToasted) {
      const m0 = me();
      if (m0 && m0.squad && m0.squad.length >= 13) {
        state.tkToasted = true;
        toast("🎯 Pense à choisir ton tireur de penalty dans « Ma compo » !");
      }
    } if (!d) return;
    if (d.auction) return renderAuction(s, d);
    $("auction-box").style.display = "none";
    $("cards-grid").style.display = "";
    $("draft-team").style.display = "";
    state.mode = "pick";
    const myTurn = d.currentPid === state.pid;
    $("draft-pick").textContent = d.pickNum;
    $("draft-total").textContent = d.totalPicks;

    const isLocal = s.code === "LOCAL";
    if (myTurn && !isLocal && state.dingKey !== s.code + ":" + d.pickNum) {
      state.dingKey = s.code + ":" + d.pickNum;
      SND.ding(); vibe(150);
    }
    $("turn-banner").classList.toggle("mine", myTurn);
    $("turn-text").innerHTML = isLocal
      ? `📱 Au tour de <b>${esc(d.currentName)}</b> — passe-lui le téléphone !`
      : (myTurn ? "🎯 <b>À toi de jouer</b> — choisis un joueur" : `Au tour de <b>${esc(d.currentName)}</b>…`);
    $("team-flag").innerHTML = flagHtml(d.team.code, "");
    $("draft-team-name").textContent = d.team.country;

    // Ordre de passage (tiré au sort au début) : les équipes en haut,
    // celle qui picke est surlignée.
    setHtml($("draft-order"), (d.order || []).map((pid) => {
      const pl = s.players.find((x) => x.pid === pid);
      return `<span class="order-chip ${pid === d.currentPid ? "on" : ""}">${esc(pl ? pl.teamName : "?")}</span>`;
    }).join('<span class="order-sep">›</span>'));

    // Budget et postes restants : TOUJOURS les siens, bien mis en avant.
    const m0 = me();
    let panel = "";
    if (m0) {
      const spent = (m0.squad || []).reduce((t, p) => t + MODEL.marketValue(p), 0);
      const left = Math.max(0, Math.round((MODEL.BUDGET - spent) * 10) / 10);
      const counts = MODEL.positionCounts(m0.formationKey);
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      m0.squad.forEach((p) => have[p.pos]++);
      const needChips = ["GK", "DEF", "MID", "FWD"]
        .filter((pos) => counts[pos] - have[pos] > 0)
        .map((pos) => `<span class="ms-chip">${pos} <b>×${counts[pos] - have[pos]}</b></span>`).join("");
      panel = `<div class="my-status ${myTurn ? "mine" : ""}">
        <div>
          <div class="ms-label">💰 Ton budget restant</div>
          <div class="ms-value ${left < 40 ? "low" : ""}">${fmtM(left)}</div>
          <div class="ms-bar"><i style="width:${Math.max(2, (left / MODEL.BUDGET) * 100).toFixed(0)}%"></i></div>
          <div class="ms-chem">🔗 Alchimie ${MODEL.chemistry(m0.squad, m0.formationKey).teamChem}</div>
        </div>
        <div>
          <div class="ms-label">Tes postes à pourvoir</div>
          <div class="ms-chips">${needChips || (m0.squad.length < 13
            ? `<span class="ms-chip">🪑 Banc <b>${Math.max(0, m0.squad.length - 11)}/2</b> — poste libre</span>`
            : '<span class="ms-chip done">✓ Effectif complet</span>')}</div>
        </div>
      </div>`;
    }
    $("need-bar").innerHTML = panel;

    // Relance d'équipe : visible seulement à son tour, avec le compteur.
    const rerollBtn = $("btn-reroll");
    rerollBtn.style.display = myTurn && d.rerollsLeft > 0 ? "" : "none";
    rerollBtn.textContent = `🎲 Relancer l'équipe (${d.rerollsLeft})`;

    const myCountries = new Set((m0 ? m0.squad : []).map((p) => p.c));
    const myClubs = new Set((m0 ? m0.squad : []).filter((p) => p.cl).map((p) => p.cl));
    const grid = $("cards-grid");
    grid.classList.toggle("locked", !myTurn);
    grid.innerHTML = d.team.options.map((o) => {
      const lc = myCountries.has(o.c), lk = o.cl && myClubs.has(o.cl);
      return futCard(o, { disabled: !o.eligible, chemLink: o.eligible && (lc || lk),
        linkLabel: lc && lk ? "pays+club" : lk ? "club" : "pays" });
    }).join("");

    const m = me();
    $("my-squad-mini").innerHTML = (m ? m.squad : []).map((p) =>
      `<span class="mini-chip">${p.pos} ${esc(p.n.split(" ").slice(-1)[0])} <span class="mr">${p.r}</span></span>`).join("")
      || '<span class="mini-chip">Ton effectif se remplira ici</span>';

    // Pas de chrono en mode 1 téléphone : chacun prend son temps.
    $("draft-timer").style.display = d.deadline ? "" : "none";
    if (d.deadline) startTimer(d.deadline); else clearInterval(timerInterval);
  }

  $("cards-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".fut"); if (!card || card.classList.contains("disabled")) return;
    const s = state.snap; if (!s || !s.draft || s.draft.currentPid !== state.pid) return;
    card.style.pointerEvents = "none";
    api("pick", { playerId: parseInt(card.dataset.id, 10) });
  });

  function startTimer(deadline) {
    clearInterval(timerInterval);
    const el = $("draft-timer");
    const tick = () => { const rem = Math.max(0, Math.ceil((deadline - srvNow()) / 1000)); el.textContent = rem; el.classList.toggle("warn", rem <= 10); };
    tick(); timerInterval = setInterval(tick, 250);
  }

  // ---------- Terrain ----------
  function renderPitch(pl) {
    const chem = MODEL.chemistry(pl.squad, pl.formationKey);
    const linksSvg = chem.links.map((l) => {
      const a = chem.placement[l.i].slot, b = chem.placement[l.j].slot;
      return `<line x1="${a.x}" y1="${a.y * 1.5}" x2="${b.x}" y2="${b.y * 1.5}"
        stroke="${l.super ? "rgba(248,231,154,.95)" : l.strong ? "rgba(47,227,138,.8)" : "rgba(255,255,255,.14)"}" stroke-width="${l.super ? 1.6 : l.strong ? 1.1 : 0.7}"/>`;
    }).join("");

    const tokens = chem.placement.map((slot, idx) => {
      const p = slot.player; if (!p) return "";
      const c = chem.perChem[idx];
      return `<div class="token" style="left:${slot.slot.x}%;top:${slot.slot.y}%">
        <span class="t-rating">${p.r}</span>
        ${flagHtml(p.code, "t-flag")}
        <div class="jersey" data-id="${p.id}">${kitSvg(pl.kit)}</div>
        <span class="t-chem chem-${c}"></span>
        <span class="t-name">${esc(p.n.split(" ").slice(-1)[0])}</span>
      </div>`;
    }).join("");

    return `
      <div class="pitch-head">
        <div><div class="ph-team">${esc(pl.teamName)}</div><div class="ph-mgr">${esc(pl.name)} · ${pl.formationKey}</div></div>
        <div class="ph-stats">
          <div class="pill-stat ovr"><b>${pl.strength.overall}</b><span>Note</span></div>
          <div class="pill-stat chem"><b>${pl.chem}</b><span>Alchimie</span></div>
        </div>
      </div>
      <div class="pitch">
        <svg class="lines" viewBox="0 0 100 150" preserveAspectRatio="none">
          <g fill="none" stroke="rgba(255,255,255,.38)" stroke-width="0.55">
            <rect x="2" y="2" width="96" height="146"/>
            <line x1="2" y1="75" x2="98" y2="75"/>
            <circle cx="50" cy="75" r="12.5"/>
            <!-- Surfaces + arcs de réparation -->
            <rect x="22" y="2" width="56" height="22"/><rect x="35" y="2" width="30" height="9"/>
            <path d="M 39 24 A 12 12 0 0 0 61 24"/>
            <rect x="22" y="126" width="56" height="22"/><rect x="35" y="139" width="30" height="9"/>
            <path d="M 39 126 A 12 12 0 0 1 61 126"/>
            <!-- Buts -->
            <rect x="42.5" y="0.4" width="15" height="1.6"/>
            <rect x="42.5" y="148" width="15" height="1.6"/>
            <!-- Corners -->
            <path d="M 2 6 A 4 4 0 0 0 6 2"/><path d="M 94 2 A 4 4 0 0 0 98 6"/>
            <path d="M 2 144 A 4 4 0 0 1 6 148"/><path d="M 94 148 A 4 4 0 0 1 98 144"/>
          </g>
          <g fill="rgba(255,255,255,.5)">
            <circle cx="50" cy="75" r="0.9"/><circle cx="50" cy="17" r="0.9"/><circle cx="50" cy="133" r="0.9"/>
          </g>
        </svg>
        <svg class="chem" viewBox="0 0 100 150" preserveAspectRatio="none">${linksSvg}</svg>
        ${tokens}
      </div>
      ${(() => {
        const placed = new Set(chem.placement.filter((x) => x.player).map((x) => x.player));
        const bench = pl.squad.filter((x) => !placed.has(x));
        if (!bench.length) return "";
        return `<div class="bench-row">🪑 Banc : ${bench.map((b) =>
          `${flagHtml(b.code)} ${esc(b.n)}${b.susp ? ' <span class="fat-tag">🟥 susp.</span>' : (b.fat >= 2 ? ` <span class="fat-tag">😓 −${Math.min(6, (b.fat - 1) * 2)}</span>` : "")}`).join(" · ")}</div>`;
      })()}
      <p class="hint">Alchimie : même pays ou même club à des postes proches. Les joueurs qui enchaînent perdent de la forme — le banc fait tourner.</p>`;
  }

  // ---------- Résultats ----------
  function renderResults(s) {
    clearInterval(timerInterval);
    state.mode = "view";
    const t = s.tournament; if (!t) return;
    state.matchMap = new Map();

    const champ = t.champion;
    const champTeam = champ && s.players.find((p) => p.pid === champ.id);
    const confetti = '<div class="confetti">' + Array.from({ length: 26 }, (_, i) =>
      `<i style="left:${(i * 37) % 100}%;background:${["#00ff87", "#f8e79a", "#ff5470", "#7ec8ff", "#fff"][i % 5]};animation-delay:${(i % 9) * 0.35}s;animation-duration:${2.4 + (i % 5) * 0.5}s"></i>`).join("") + "</div>";
    $("champion-card").innerHTML = champ ? confetti + `
      <div class="trophy">🏆</div><div class="c-label">Champion</div>
      <div class="c-name">${esc(champ.name)}${champ.id === state.pid ? " 🎉" : ""}</div>
      <div class="c-ovr">Note ${champTeam ? champTeam.strength.overall : "—"} · Alchimie ${champTeam ? champTeam.chem : "—"}</div>` : "";

    const m = me();
    $("tab-pitch").innerHTML = m ? renderPitch(m) :
      `<p class="hint">Tu observes cette partie — sélectionne une équipe dans l'onglet « Équipes ».</p>`;

    const roundNames = (n) => ({ 1: "Finale", 2: "Demi-finales", 3: "Quarts de finale" }[n] || "Tour");
    let bracket = "";
    if (t.knockout) {
      t.knockout.rounds.forEach((round, i) => {
        bracket += `<div class="round-title">${roundNames(t.knockout.rounds.length - i)}</div>`;
        round.forEach((mm, j) => {
          const mk = `k${i}_${j}`; state.matchMap.set(mk, mm);
          const aw = mm.winner === mm.a, bw = mm.winner === mm.b;
          bracket += `<div class="match clickable" data-mk="${mk}">
            <span class="side ${aw ? "win" : "lose"}"><span>${esc(mm.an)}</span></span>
            <span class="score">${mm.ga}-${mm.gb}${mm.pens ? `<span class="pens"> (${mm.pens.pa}-${mm.pens.pb} tab)</span>` : ""}</span>
            <span class="side ${bw ? "win" : "lose"}" style="justify-content:flex-end"><span>${esc(mm.bn)}</span></span>
          </div>`;
        });
      });
      bracket += '<p class="ms-note">Touche un match pour voir les temps forts ⚽</p>';
    } else bracket = '<p class="hint">Pas assez d\'équipes pour des phases finales.</p>';
    $("tab-bracket").innerHTML = bracket;

    const K = t.standings.length >= 8 ? 8 : t.standings.length >= 4 ? 4 : 2;
    $("tab-table").innerHTML = `<table class="ltable">
      <tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th><th>Diff</th><th>Pts</th></tr>
      ${t.standings.map((r, i) => `<tr class="${i < K ? "qualif" : ""} ${r.id === state.pid ? "meline" : ""}">
        <td class="rk">${i + 1}</td><td class="tname">${esc(r.name)}${r.id === state.pid ? '<span class="you-tag">TOI</span>' : ""}</td>
        <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.pts}</td></tr>`).join("")}</table>
      ${(t.scorers && t.scorers.length) ? `
      <div class="round-title">🥇 Meilleurs buteurs</div>
      <table class="ltable scorers">
        <tr><th>#</th><th style="text-align:left">Joueur</th><th style="text-align:left">Équipe</th><th>Buts</th></tr>
        ${t.scorers.map((sc, i) => `<tr class="${i === 0 ? "qualif" : ""}">
          <td class="rk">${i + 1}</td>
          <td class="tname">${flagHtml(sc.code)} ${esc(sc.n)}</td>
          <td class="tname" style="color:var(--muted)">${esc(sc.team)}</td>
          <td class="pts">${sc.goals}</td></tr>`).join("")}
      </table>` : ""}
      <div class="round-title">Matchs de poule</div>
      ${(t.matches || []).map((mm, idx) => { const mk = `l${idx}`; state.matchMap.set(mk, mm);
        return `<div class="match clickable" data-mk="${mk}">
          <span class="side"><span>${esc(mm.an)}</span></span>
          <span class="score">${mm.ga}-${mm.gb}</span>
          <span class="side" style="justify-content:flex-end"><span>${esc(mm.bn)}</span></span></div>`; }).join("")}`;

    $("tab-squads").innerHTML = squadsHtml(s.players);

    $("btn-again").style.display = isHost() ? "" : "none";
    // Sans l'hôte, chacun peut quand même relancer via la réinitialisation.
    $("btn-reset-results").style.display = isHost() ? "none" : "";
  }
  const ord = (pos) => ({ GK: 0, DEF: 1, MID: 2, FWD: 3 }[pos] ?? 4);

  // Blocs "effectif" : réutilisés par l'onglet Équipes et le modal Compos.
  function squadsHtml(players) {
    return players.map((p) => {
      const sorted = p.squad.slice().sort((a, b) => ord(a.pos) - ord(b.pos) || b.r - a.r);
      return `<div class="squad-block">
        <div class="squad-head">
          <div class="sh-left"><div class="kit-mini">${kitSvg(p.kit)}</div>
            <span class="sname">${esc(p.teamName)}${p.pid === state.pid ? '<span class="you-tag">TOI</span>' : ""}</span></div>
          <span class="sovr">${p.strength.overall}</span>
        </div>
        <div class="squad-players">${sorted.map((pl) => `<div class="sp" data-id="${pl.id}"><span class="spos">${pl.pos}</span>
          <span class="spn">${flagHtml(pl.code)} ${esc(pl.n)}${pl.susp ? " 🟥" : pl.fat >= 2 ? " 😓" : ""}</span><span class="spr">${pl.r}</span></div>`).join("")}
          ${!sorted.length ? '<p class="hint">Aucun joueur drafté pour l\'instant.</p>' : ""}</div>
      </div>`;
    }).join("");
  }

  // ---------- Modal carte (clic sur un joueur en vue résultats) ----------
  function openCardModal(player) {
    $("card-modal-inner").innerHTML = CLOSE_X + futCard(player);
    $("card-modal").classList.add("on");
  }
  $("card-modal").addEventListener("click", () => $("card-modal").classList.remove("on"));
  document.addEventListener("click", (e) => {
    if (state.mode !== "view") return;
    const tok = e.target.closest(".token .jersey, .sp");
    if (!tok) return;
    const id = parseInt(tok.dataset.id, 10);
    if (!isNaN(id) && typeof PLAYERS !== "undefined") { const pl = PLAYERS[id]; if (pl) openCardModal(Object.assign({ id }, pl)); }
  });

  // ---------- Feuille de match (temps forts + visuel FM) ----------
  const EV_COLOR = { goal: "#2fe38a", saved: "#14a0ff", off: "#8aa3ba", post: "#f0b429" };
  const EV_LABEL = { goal: "But", saved: "Arrêt", off: "Tir manqué", post: "Poteau" };

  // Terrain FM horizontal avec la carte des actions (feuille de match).
  function fmPitchHtml(events, minuteLimit) {
    const dots = (events || []).filter((e) => e.m <= minuteLimit && e.type !== "yellow" && e.type !== "red").map((ev) =>
      `<circle class="fm-dot" cx="${ev.x}" cy="${ev.y * 0.64}" r="${ev.type === "goal" ? 3 : 2.1}" fill="${EV_COLOR[ev.type]}"/>`).join("");
    return `<div class="fm-pitch"><svg viewBox="0 0 100 64" preserveAspectRatio="none">${fmLinesSvg()}${dots}</svg></div>`;
  }

  function matchModal(mm) {
    const evs = mm.events || [];
    // confrontations précédentes du tournoi entre ces deux équipes
    let h2h = "";
    const t = state.snap && state.snap.tournament;
    if (t) {
      const prev = (t.matches || []).concat((t.knockout ? t.knockout.rounds.flat() : []))
        .filter((x) => x !== mm && ((x.a === mm.a && x.b === mm.b) || (x.a === mm.b && x.b === mm.a)) && !(x.ga === mm.ga && x.gb === mm.gb && x.an === mm.an));
      if (prev.length) h2h = `<div class="ms-h2h">Déjà croisés : ${prev.map((x) => `${x.ga}-${x.gb}`).join(", ")}</div>`;
    }
    const legend = Object.keys(EV_LABEL).map((k) => `<span><i style="background:${EV_COLOR[k]}"></i>${EV_LABEL[k]}</span>`).join("");
    // Stats du match : tirs / cadrés / possession estimée
    const st = { a: { sh: 0, on: 0 }, b: { sh: 0, on: 0 } };
    evs.forEach((e) => { if (e.type === "yellow" || e.type === "red") return; const t = st[e.side]; if (!t) return; t.sh++; if (e.type === "goal" || e.type === "saved") t.on++; });
    const possA = Math.max(32, Math.min(68, 50 + (st.a.sh - st.b.sh) * 4));
    const statsHtml = `<div class="ms-stats">
      <span>${st.a.sh} tirs (${st.a.on} cadrés)</span>
      <span class="ms-poss">${possA}% – ${100 - possA}%</span>
      <span>${st.b.sh} tirs (${st.b.on} cadrés)</span>
    </div>`;
    const lines = evs.length ? evs.map((ev) =>
      `<div class="evline ${ev.type === "goal" ? "goal" : ""}"><span class="min">${ev.m}'</span><span class="etxt">${esc(ev.text)}</span></div>`).join("")
      : '<p class="hint">Match sans occasion notable.</p>';

    $("match-sheet").innerHTML = CLOSE_X + `
      <div class="ms-head">
        <span class="ms-team a">${esc(mm.an)}</span>
        <span class="ms-score">${mm.ga} - ${mm.gb}</span>
        <span class="ms-team b">${esc(mm.bn)}</span>
      </div>
      ${mm.pens ? `<div class="ms-pens">Tirs au but : ${mm.pens.pa} - ${mm.pens.pb}</div>` : ""}
      ${statsHtml}
      ${h2h}
      ${(() => { const mo = motmOf(evs); return mo ? `<div class="ms-motm">⭐ Homme du match : ${esc(mo.name)} (${esc(mo.why)})</div>` : ""; })()}
      <div class="fm-legend">${legend}</div>
      ${fmPitchHtml(evs, 999)}
      <div class="fm-events">${lines}</div>
      <p class="ms-note">Les frappes citent la note de tir du joueur et la défense adverse : c'est ainsi que l'algorithme départage les équipes.</p>`;
    $("match-modal").classList.add("on");
  }
  $("match-modal").addEventListener("click", (e) => { if (e.target.id === "match-modal") $("match-modal").classList.remove("on"); });
  document.addEventListener("click", (e) => {
    const row = e.target.closest(".match.clickable");
    if (!row || !state.matchMap) return;
    const mm = state.matchMap.get(row.dataset.mk);
    if (mm) matchModal(mm);
  });

  // ---------- QR ----------
  function renderQR(text) {
    const m = QRCode.matrix(text), n = m.length, q = 2, size = n + q * 2;
    let rects = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) rects += `<rect x="${c + q}" y="${r + q}" width="1.02" height="1.02"/>`;
    return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#04121f">${rects}</g></svg>`;
  }

  // ---------- Utilitaires ----------
  function esc(str) { return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  let toastTimer = null;
  function toast(msg) {
    let el = $("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast";
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(4,18,31,.95);border:1px solid rgba(255,255,255,.15);color:#eaf6ff;padding:10px 16px;border-radius:24px;font-size:13px;font-weight:700;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90%;text-align:center;transition:opacity .3s;";
      document.body.appendChild(el); }
    el.textContent = msg; el.style.opacity = "1"; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2600);
  }

  // ---------- Démarrage ----------
  function boot() {
    const foot = document.querySelector(".home-foot");
    if (foot) foot.textContent = "Multijoueur temps réel · " + APP_VERSION;

    const params = new URLSearchParams(location.search);
    const mock = params.get("mock");
    if (mock) {
      document.body.classList.add("no-anim");
      fetch("_mock/" + mock + ".json").then((r) => r.json()).then((d) => {
        state.code = d.snap.code; state.pid = d.viewPid; state.snap = d.snap;
        // En démo, rejoue le direct depuis le coup d'envoi.
        if (d.snap.playing) { d.snap.playing.startedAt = Date.now(); d.snap.playing.clockMs = parseInt(params.get("clock"), 10) || 52000; d.snap.playing.goalHoldMs = parseInt(params.get("hold"), 10) || d.snap.playing.goalHoldMs || 3500; }
        render();
        if (params.get("open") === "compo") openCompo();
        else if (params.get("open") === "squads") openSquads();
        else if (params.get("open") === "table") openLiveTable();
        else if (params.get("open") === "bracket") openBracket();
        else if (params.get("open") && state.matchMap && state.matchMap.size) matchModal(state.matchMap.values().next().value);
        const tb = params.get("tab");
        if (tb) { const el = document.querySelector(`.tab[data-tab="${tb}"]`); if (el) el.click(); }
      });
      return;
    }
    // Hook de test : simule un clic réel sur « Créer une session ».
    if (params.has("autocreate")) { document.body.classList.add("no-anim"); setTimeout(() => $("btn-create").click(), 200); return; }
    // Hook de test : mode 1 téléphone (lobby | draft | full).
    const autolocal = params.get("autolocal");
    if (autolocal) {
      document.body.classList.add("no-anim");
      local.active = true;
      ["Théo", "Bob", "Carol"].forEach((n) => localAddPlayer(n));
      if (autolocal === "lobby") { localRender(); return; }
      localStart();
      if (autolocal === "full" || autolocal === "playing") {
        const iv = setInterval(() => {
          if (local.phase === "draft") {
            const opt = local.draft.currentTeam.options.find((o) => o.eligible);
            if (opt) localPick(opt.id);
          } else if (local.phase === "playing" && autolocal === "full") {
            localApi("nextMatch", {});
          } else if (local.phase === "results" || (local.phase === "playing" && autolocal === "playing")) {
            clearInterval(iv);
          }
        }, 25);
      }
      return;
    }

    const roomParam = (params.get("room") || params.get("code") || "").toUpperCase();
    if (roomParam) $("home-code").value = roomParam;
    const pidParam = parseInt(params.get("pid"), 10);
    if (roomParam && pidParam) { state.code = roomParam; state.pid = pidParam; saveSession(); connect(); setTimeout(() => { if (!state.snap && state.es) state.es.close(); }, 3500); return; }

    let saved = null; try { saved = JSON.parse(localStorage.getItem("fd_session") || "null"); } catch (_) {}
    if (saved && saved.code && saved.pid) { state.code = saved.code; state.pid = saved.pid; connect();
      setTimeout(() => { if (!state.snap) { localStorage.removeItem("fd_session"); if (state.es) state.es.close(); } }, 3500); }
  }
  boot();
})();
