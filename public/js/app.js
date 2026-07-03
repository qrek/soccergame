/* ================= Football Draft — client (FUT) ================= */
(function () {
  "use strict";

  // Version affichée sur l'accueil : permet de vérifier ce qui est déployé.
  const APP_VERSION = "v20 — moteur façon FM";

  const $ = (id) => document.getElementById(id);
  const state = { code: null, pid: null, snap: null, es: null, mode: "pick" };
  let timerInterval = null, uid = 0, teamNameTimer = null;

  const KIT_PALETTE = ["#e11d2a", "#1f6feb", "#12b886", "#f59f00", "#7048e8", "#111418", "#f1f3f5", "#e64980", "#0b7285", "#495057"];
  const PATTERNS = ["plain", "stripes", "hoops", "sash", "halves"];

  const flag = (code) => (!code || code.length !== 2) ? "🏳️"
    : String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

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
      ${pl.taken ? '<span class="taken-badge">PRIS</span>' : ""}
      ${pl.expensive ? '<span class="taken-badge expensive-badge">TROP CHER</span>' : ""}
      <div class="fut-inner">
        <div class="fut-top">
          <div class="fut-rating"><span class="r">${pl.r}</span><span class="p">${pl.pos}</span></div>
          <div class="fut-badges"><span class="flag">${flag(pl.code)}</span><span class="price">${fmtM(price)}</span></div>
        </div>
        <div class="fut-name">${esc(pl.n)}</div>
        <div class="fut-sub">${esc(pl.c)} · ${esc(pl.d)}${opts.chemLink ? ' · <span class="linktag">🔗 lien</span>' : ""}</div>
        <div class="fut-stats">${statsHtml}</div>
      </div></div>`;
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
      const chem = MODEL.chemistry(p.squad, p.formationKey);
      return { pid: p.pid, name: p.name, connected: true, isHost: p.pid === 1, formationKey: p.formationKey,
        teamName: p.name, kit: p.kit, squad: p.squad, squadCount: p.squad.length,
        strength: ENGINE.teamStrength(p.squad), chem: chem.teamChem, chemBonus: chem.bonus };
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
    if (local.phase === "playing" && local.reveal) {
      const { roundIdx, rounds } = local.reveal;
      const cur = rounds[Math.min(roundIdx, rounds.length - 1)];
      snap.playing = { round: roundIdx + 1, totalRounds: rounds.length, stage: cur.stage, type: cur.type,
        matches: cur.matches, startedAt: local.roundStartedAt, clockMs: 52000, goalHoldMs: 3500,
        playedMatches: rounds.slice(0, roundIdx).filter((r) => r.type === "league")
          .flatMap((r) => r.matches.map((m) => ({ a: m.a, b: m.b, ga: m.ga, gb: m.gb }))) };
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
    for (let r = 0; r < 11; r++) order.push(...(r % 2 === 0 ? pids : pids.slice().reverse()));
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
      const teams = local.players.map((p) => {
        const chem = MODEL.chemistry(p.squad, p.formationKey);
        return { id: p.pid, name: p.name, players: p.squad, bonus: chem.bonus, chem: chem.teamChem };
      });
      local.tournament = ENGINE.runTournament(teams);
      // Diffusion : chaque journée se joue en direct, bouton pour enchaîner.
      local.phase = "playing";
      local.reveal = { roundIdx: 0, rounds: ENGINE.buildRounds(local.tournament) };
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
      if (local.phase === "playing" && local.reveal) {
        local.reveal.roundIdx++;
        local.roundStartedAt = Date.now();
        if (local.reveal.roundIdx >= local.reveal.rounds.length) local.phase = "results";
        localRender();
      }
    }
    else if (type === "playAgain" || type === "resetGame") { local.phase = "lobby"; local.draft = null; local.tournament = null; local.reveal = null; local.players.forEach((p) => { p.squad = []; p.spent = 0; }); localRender(); }
    else if (type === "setFormation") { const p = local.players.find((x) => x.pid === state.pid); if (p && MODEL.FORMATIONS[extra.formationKey]) { p.formationKey = extra.formationKey; localRender(); } }
    return Promise.resolve({ ok: true });
  }

  function connect() {
    if (state.es) state.es.close();
    const es = new EventSource(`events?code=${state.code}&pid=${state.pid}`);
    state.es = es;
    es.addEventListener("state", (e) => {
      state.snap = JSON.parse(e.data); render();
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
  $("btn-skip").addEventListener("click", () => api("skipReveal"));

  // Relancer l'équipe tirée au sort (2 max).
  $("btn-reroll").addEventListener("click", () => api("rerollTeam"));

  // Dock bas : ma compo (terrain) + toutes les compos.
  function openCompo() {
    const m = me();
    if (!m) return;
    $("compo-sheet").innerHTML = renderPitch(m);
    $("compo-modal").classList.add("on");
  }
  function openSquads() {
    if (!state.snap) return;
    $("squads-sheet").innerHTML = `<div class="round-title" style="margin-top:0">Toutes les compos</div>` + squadsHtml(state.snap.players);
    $("squads-modal").classList.add("on");
  }
  function openLiveTable() {
    const s0 = state.snap; if (!s0 || !s0.playing) return;
    const p = s0.playing;
    const elapsed = Date.now() - p.startedAt;
    const hold = p.goalHoldMs || 3500;
    const current = p.type === "league" ? p.matches.map((m) => {
      const mc = matchClock(elapsed, goalsOf(m), p.clockMs, hold);
      const sc = scoreAt(m, mc.minute);
      return { a: m.a, b: m.b, ga: sc.ga, gb: sc.gb };
    }) : [];
    const teams = s0.players.map((pl) => ({ id: pl.pid }));
    const table = ENGINE.computeStandings(teams, (p.playedMatches || []).concat(current));
    const nameOf = (id) => { const pl = s0.players.find((x) => x.pid === id); return pl ? pl.teamName : "?"; };
    const K = teams.length >= 8 ? 8 : teams.length >= 4 ? 4 : 2;
    $("table-sheet").innerHTML = `
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
  $("table-modal").addEventListener("click", (e) => { if (e.target.id === "table-modal") $("table-modal").classList.remove("on"); });

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

  // Horloge d'un match : linéaire 0'->90', figée `hold` ms sur chaque but.
  // minuteF (continue) pilote la simulation ; holdT = avancement célébration.
  function matchClock(elapsed, goals, clockMs, hold) {
    let holds = 0;
    for (const g of goals) {
      const tg = (g.m / 90) * clockMs + holds;
      if (elapsed < tg) break;
      if (elapsed < tg + hold) return { minute: g.m, minuteF: g.m, holding: g, holdT: (elapsed - tg) / hold, ft: false };
      holds += hold;
    }
    const mf = Math.max(0, Math.min(90, ((elapsed - holds) / clockMs) * 90));
    return { minute: Math.floor(mf), minuteF: mf, holding: null, holdT: 0, ft: elapsed - holds >= clockMs };
  }
  const goalsOf = (m) => (m.events || []).filter((e) => e.type === "goal").sort((a, b) => a.m - b.m);

  function renderPlaying(s) {
    clearInterval(timerInterval);
    const p = s.playing; if (!p) return;
    const isLocal = s.code === "LOCAL";
    $("play-stage").textContent = `${p.stage} · ${p.round}/${p.totalRounds}`;
    // Chacun suit SON match ; en mode 1 téléphone, le premier match en vedette.
    const mine = isLocal ? null : p.matches.find((m) => m.a === state.pid || m.b === state.pid);
    const featured = mine || (isLocal ? p.matches[0] : null);

    // Squelette construit une seule fois par journée : ensuite on ne met à
    // jour que les chiffres/fils, pas de reconstruction -> pas de clignotement.
    const roundKey = s.code + "|" + p.stage + "|" + p.round;
    if (state.liveRoundKey !== roundKey) {
      state.liveRoundKey = roundKey;
      buildLiveSkeleton(p, featured, mine, isLocal);
      state.sim = featured ? buildSim(featured) : null;
    }

    clearInterval(liveInterval);
    const tick = () => drawLive(p, featured, isLocal);
    tick();
    liveInterval = setInterval(tick, 300);

    // Boucle fluide (60 fps) : positions des joueurs et du ballon.
    cancelAnimationFrame(state.simRaf);
    if (featured && state.sim) {
      const hold = p.goalHoldMs || 3500;
      const loop = () => {
        if (!state.snap || state.snap.phase !== "playing" || !state.sim) return;
        simTick(state.sim, matchClock(Date.now() - p.startedAt, goalsOf(featured), p.clockMs, hold), Date.now());
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
    return { dots, kit: (pl.kit && pl.kit.p) || (side === "a" ? "#e11d2a" : "#1f6feb") };
  }

  // ---------- Simulation continue du match (11v11 fluide) ----------
  // Le ballon suit une trajectoire déterministe (circulation, montées vers
  // chaque action, relances) ; les 22 joueurs gravitent autour : maintien de
  // la formation, pressing du plus proche, course du tireur, gardiens qui
  // suivent. Le tout est piloté par l'horloge du match : pendant la pause
  // célébration d'un but, TOUT est figé, puis engagement au centre.
  const clampV = (v, a, b) => Math.max(a, Math.min(b, v));
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- Script de possession façon FM ----------
  // Le ballon est TOUJOURS au pied d'un porteur ou en passe rectiligne vers
  // un receveur précis. Conduites, passes, interceptions, dernière passe au
  // tireur, relances du gardien : tout est scripté de façon déterministe,
  // puis rendu avec des vitesses de course plafonnées (rien ne "flotte").
  function buildScript(match, dots, events, rng) {
    const outfield = (side) => dots.filter((d) => d.side === side && d.pos !== "GK");
    const gkOf = (side) => dots.find((d) => d.side === side && d.pos === "GK") || dots[0];
    const nearestTo = (list, pt) => list.slice().sort((u, v) => Math.hypot(u.home.x - pt.x, u.home.y - pt.y) - Math.hypot(v.home.x - pt.x, v.home.y - pt.y))[0];
    const centerMost = (list) => nearestTo(list, { x: 50, y: 32 });
    const dirOf = (side) => (side === "a" ? 1 : -1);

    const segs = [];
    let t = 0.2;
    let poss = events.length ? events[0].side : "a";
    let sb = { x: 50, y: 32 };
    let carrier = centerMost(outfield(poss));

    const spotFor = (d, target) => ({
      x: clampV(d.home.x + (target.x - d.home.x) * 0.35 + (rng() - 0.5) * 5, 3, 97),
      y: clampV(d.home.y + (target.y - d.home.y) * 0.35 + (rng() - 0.5) * 5, 4, 60),
    });

    function chainTo(endT, ev) {
      while (t < endT - 0.05 && segs.length < 1600) {
        const steer = ev && t > ev.m - 6;
        if (steer && poss !== ev.side) { poss = ev.side; carrier = nearestTo(outfield(poss), sb); }
        // conduite de balle
        const hd = Math.min(endT - t, 0.7 + rng() * 1.4);
        const adv = { x: clampV(sb.x + dirOf(poss) * (2 + rng() * 6), 4, 96), y: clampV(sb.y + (rng() - 0.5) * 8, 5, 59) };
        segs.push({ type: "hold", t0: t, t1: t + hd, c: carrier.idx, to: adv });
        sb = adv; t += hd;
        if (t >= endT - 0.05) break;
        // passe (parfois interceptée)
        let rec, final = false;
        if (steer && ev.shooter && t >= ev.m - 1.7) { rec = ev.shooter; final = true; }
        else if (!steer && rng() < 0.2) { poss = poss === "a" ? "b" : "a"; rec = nearestTo(outfield(poss), sb); }
        else {
          const mates = outfield(poss).filter((d) => d !== carrier);
          const tgt = steer ? ev : { x: clampV(sb.x + dirOf(poss) * 18, 4, 96), y: sb.y };
          mates.sort((u, v) => Math.hypot(u.home.x - tgt.x, u.home.y - tgt.y) - Math.hypot(v.home.x - tgt.x, v.home.y - tgt.y));
          rec = mates[Math.floor(rng() * Math.min(3, mates.length))] || carrier;
        }
        const spot = final ? { x: ev.x, y: ev.y } : spotFor(rec, steer && ev ? ev : sb);
        const pd = clampV(Math.hypot(spot.x - sb.x, spot.y - sb.y) / 55, 0.18, 0.5);
        segs.push({ type: "pass", t0: t, t1: t + pd, c: rec.idx, from: sb, to: spot });
        sb = spot; t += pd; carrier = rec;
        if (final) {
          if (t < ev.m - 0.06) segs.push({ type: "hold", t0: t, t1: ev.m - 0.06, c: rec.idx, to: { x: ev.x, y: ev.y } });
          t = ev.m - 0.06; sb = { x: ev.x, y: ev.y };
          return;
        }
      }
    }

    for (const ev of events) {
      chainTo(ev.m - 0.06, ev);
      const right = ev.side === "a";
      let end;
      if (ev.type === "goal") end = { x: right ? 99.4 : 0.6, y: 29 + rng() * 6 };
      else if (ev.type === "saved") end = { x: right ? 96.6 : 3.4, y: 29.5 + rng() * 5 };
      else if (ev.type === "post") end = { x: right ? 98.6 : 1.4, y: rng() < 0.5 ? 26.4 : 37.6 };
      else end = { x: right ? 99.6 : 0.4, y: rng() < 0.5 ? 17 : 45 };
      segs.push({ type: "shot", t0: Math.max(0, ev.m - 0.06), t1: ev.m, c: ev.shooter ? ev.shooter.idx : -1, from: sb, to: end, ev });
      sb = end; t = ev.m;
      const defSide = right ? "b" : "a";
      poss = defSide;
      if (ev.type === "goal") {
        carrier = centerMost(outfield(poss));
        segs.push({ type: "hold", t0: t, t1: t + 1.1, c: carrier.idx, to: { x: 50, y: 32 } });
        sb = { x: 50, y: 32 }; t += 1.1;
      } else {
        carrier = ev.type === "post" ? nearestTo(outfield(poss), sb) : gkOf(poss);
        const cs = { x: carrier.home.x, y: carrier.home.y };
        segs.push({ type: "pass", t0: t, t1: t + 0.35, c: carrier.idx, from: sb, to: cs });
        sb = cs; t += 0.35;
        segs.push({ type: "hold", t0: t, t1: t + 0.8, c: carrier.idx, to: cs });
        t += 0.8;
      }
    }
    chainTo(89.6, null);
    segs.push({ type: "hold", t0: t, t1: 91, c: carrier.idx, to: sb });
    return segs;
  }

  // Construit la scène (22 joueurs + ballon) et l'état de simulation.
  function buildSim(match) {
    const A = teamSetup(match.a, "a"), B = teamSetup(match.b, "b");
    if (A.kit.toLowerCase() === B.kit.toLowerCase()) B.kit = "#f1f3f5";
    const rng = mulberry(((match.a * 73856093) ^ (match.b * 19349663)) >>> 0);
    const mk = (team, side) => team.dots.map((d) => ({
      name: d.n, pos: d.pos, side, home: d.p, x: d.p.x, y: d.p.y,
      w1: 0.4 + rng() * 0.6, w2: 0.4 + rng() * 0.6, ph1: rng() * 6.28, ph2: rng() * 6.28,
    }));
    const dots = mk(A, "a").concat(mk(B, "b"));
    dots.forEach((d, i) => { d.idx = i; });
    const events = (match.events || []).slice().sort((x, y) => x.m - y.m).map((ev) => ({
      m: ev.m, type: ev.type, side: ev.side,
      x: clampV(ev.x, 4, 96), y: clampV(ev.y * 0.64, 6, 58),
      shooter: dots.find((d) => d.side === ev.side && d.name === ev.scorer) || null,
    }));
    const svgDots = dots.map((d, i) =>
      `<circle id="sd${i}" cx="${d.home.x.toFixed(1)}" cy="${d.home.y.toFixed(1)}" r="1.7" fill="${d.side === "a" ? A.kit : B.kit}" stroke="${d.pos === "GK" ? "#ffd54a" : "rgba(255,255,255,.55)"}" stroke-width="${d.pos === "GK" ? 0.6 : 0.35}"/>`).join("");
    $("live-stage").innerHTML = `<div class="fm-pitch replay"><svg viewBox="0 0 100 64" preserveAspectRatio="none">
      ${fmLinesSvg()}${svgDots}
      <circle id="sim-ball" cx="50" cy="32" r="1.15" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width="0.3"/>
    </svg></div>`;
    dots.forEach((d, i) => { d.el = document.getElementById("sd" + i); });
    return { dots, ballEl: document.getElementById("sim-ball"), segs: buildScript(match, dots, events, rng), events, segIdx: 0, lastNow: 0 };
  }

  // Une frame : segment actif, ballon au pied/en vol, courses plafonnées.
  function simTick(sim, mc, now) {
    const mf = mc.minuteF;
    let seg = sim.segs[sim.segIdx];
    if (!seg || mf < seg.t0 || mf >= seg.t1) {
      let idx = sim.segs.findIndex((g) => mf >= g.t0 && mf < g.t1);
      if (idx < 0) idx = mf >= 89 ? sim.segs.length - 1 : 0;
      sim.segIdx = idx; seg = sim.segs[idx];
    }
    const dt = Math.min(0.08, Math.max(0, (now - (sim.lastNow || now)) / 1000));
    sim.lastNow = now;

    // Célébration : TOUT est figé, seul le buteur exulte.
    if (mc.holding) {
      const ge = sim.events.find((e) => e.type === "goal" && e.m === mc.holding.m && e.side === mc.holding.side);
      if (ge && ge.shooter && ge.shooter.el) ge.shooter.el.setAttribute("r", (1.7 + Math.abs(Math.sin(mc.holdT * Math.PI * 3)) * 0.9).toFixed(2));
      return;
    }

    const holder = seg && seg.c >= 0 ? sim.dots[seg.c] : null;
    // ballon : au pied du porteur, ou en vol vers le receveur / la cible du tir
    let bx, by;
    if (seg.type === "hold" && holder) { bx = holder.x + (holder.side === "a" ? 1 : -1); by = holder.y; }
    else {
      const u = clampV((mf - seg.t0) / (seg.t1 - seg.t0 || 0.01), 0, 1);
      const tx = seg.type === "pass" && holder ? holder.x : seg.to.x;
      const ty = seg.type === "pass" && holder ? holder.y : seg.to.y;
      bx = seg.from.x + (tx - seg.from.x) * u;
      by = seg.from.y + (ty - seg.from.y) * u;
    }

    // pressing : le défenseur le plus proche du ballon vient au duel
    const possSide = holder ? holder.side : "a";
    const defSide = possSide === "a" ? "b" : "a";
    let presser = null, best = 1e9;
    for (const d of sim.dots) {
      if (d.side !== defSide || d.pos === "GK") continue;
      const q = Math.hypot(d.x - bx, d.y - by);
      if (q < best) { best = q; presser = d; }
    }

    for (const d of sim.dots) {
      const shiftK = d.pos === "MID" ? 0.16 : d.pos === "FWD" ? 0.13 : 0.10;
      let tx = d.home.x + clampV((bx - d.home.x) * shiftK, -9, 9);
      let ty = d.home.y + clampV((by - d.home.y) * shiftK, -6, 6);
      let sp = 3.8; // marche/replacement
      if (d.pos === "GK") {
        tx = d.home.x; ty = clampV(32 + (by - 32) * 0.25, 25, 39); sp = 5;
        if (seg.type === "shot" && seg.ev && d.side !== seg.ev.side) { ty = clampV(seg.to.y, 25.5, 38.5); sp = 16; }
      } else if (seg.type === "hold" && d === holder) { tx = seg.to.x; ty = seg.to.y; sp = 6; }
      else if (seg.type === "pass" && d === holder) { tx = seg.to.x; ty = seg.to.y; sp = 11; }
      else if (d === presser) { tx = bx + (d.x - bx) * 0.1; ty = by + (d.y - by) * 0.1; sp = 9; }
      // micro-flottement (à l'arrêt, personne n'est une statue)
      tx += Math.sin((now / 1000) * d.w1 + d.ph1) * 0.6;
      ty += Math.cos((now / 1000) * d.w2 + d.ph2) * 0.5;
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 0.0001;
      const step = Math.min(dist, sp * dt);
      d.x = clampV(d.x + (dx / dist) * step, 2.5, 97.5);
      d.y = clampV(d.y + (dy / dist) * step, 3, 61);
      if (d.el.getAttribute("r") !== "1.7") d.el.setAttribute("r", "1.7");
      d.el.setAttribute("cx", d.x.toFixed(2));
      d.el.setAttribute("cy", d.y.toFixed(2));
    }
    sim.ballEl.setAttribute("cx", clampV(bx, 0.5, 99.5).toFixed(2));
    sim.ballEl.setAttribute("cy", clampV(by, 2, 62).toFixed(2));
  }

  // Score d'un match à la minute donnée.
  function scoreAt(m, minute) {
    if (minute >= 90) return { ga: m.ga, gb: m.gb };
    let ga = 0, gb = 0;
    (m.events || []).forEach((e) => { if (e.type === "goal" && e.m <= minute) { if (e.side === "a") ga++; else gb++; } });
    return { ga, gb };
  }

  function drawLive(p, featured, isLocal) {
    const elapsed = Date.now() - p.startedAt;
    const hold = p.goalHoldMs || 3500;
    const maxGoals = Math.max(0, ...p.matches.map((m) => goalsOf(m).length));
    const ftAll = elapsed >= p.clockMs + maxGoals * hold; // toute la journée est finie

    if (featured) {
      const mc = matchClock(elapsed, goalsOf(featured), p.clockMs, hold);
      // Ambiance : sifflet d'engagement, clameur sur but (+ vibration),
      // "ooh" sur occasion, triple sifflet au coup de sifflet final.
      const snd = state.snd || (state.snd = {});
      if (snd.round !== state.liveRoundKey) { snd.round = state.liveRoundKey; snd.holdKey = null; snd.ft = false; snd.seen = 0; SND.whistle(1); }
      if (mc.holding) {
        const hk = mc.holding.m + "|" + mc.holding.scorer;
        if (snd.holdKey !== hk) {
          snd.holdKey = hk;
          SND.goal();
          const mySide = featured.a === state.pid ? "a" : featured.b === state.pid ? "b" : null;
          vibe(mc.holding.side === mySide ? [90, 50, 90, 50, 280] : 160);
        }
      }
      if (mc.ft && !snd.ft) { snd.ft = true; SND.whistle(3); }
      setText($("live-min"), mc.ft ? "TERMINÉ" : mc.minute + "'");
      $("live-min").classList.toggle("ft", mc.ft);
      const sc = scoreAt(featured, mc.minute);
      setText($("live-ga"), String(sc.ga));
      setText($("live-gb"), String(sc.gb));
      const pensEl = $("live-pens");
      if (mc.ft && featured.pens) { pensEl.style.display = ""; setText(pensEl, `Tirs au but : ${featured.pens.pa} - ${featured.pens.pb}`); }

      const seen = (featured.events || []).filter((e) => e.m <= mc.minute);
      if (seen.length > (state.snd.seen || 0)) {
        const newest = seen[seen.length - 1];
        if (newest && newest.type !== "goal") SND.ooh();
        state.snd.seen = seen.length;
      }
      // Célébration : l'horloge est figée sur le but -> grande animation.
      // (deux buts à la même minute enchaînent deux célébrations distinctes)
      let ovEl = document.getElementById("goal-overlay");
      if (mc.holding) {
        const okey = mc.holding.m + "|" + mc.holding.scorer;
        if (ovEl && ovEl.dataset.k !== okey) { ovEl.remove(); ovEl = null; }
        if (!ovEl) {
          const pitch = $("live-stage").querySelector(".fm-pitch");
          if (pitch) pitch.insertAdjacentHTML("beforeend",
            `<div id="goal-overlay" class="goal-overlay" data-k="${esc(okey)}"><span>⚽ BUUUT !</span><b>${esc(mc.holding.scorer)}</b><i>${esc(mc.holding.teamName)}</i></div>`);
        }
      } else if (ovEl) { ovEl.remove(); }

      const evs = seen.slice().sort((a, b) => b.m - a.m);
      setHtml($("live-feed"),
        evs.map((e) => `<div class="evline ${e.type === "goal" ? "goal" : ""}"><span class="min">${e.m}'</span><span class="etxt">${esc(e.text)}</span></div>`).join("")
        || `<div class="evline"><span class="min">1'</span><span class="etxt">🟢 Coup d'envoi !</span></div>`);
    } else {
      const raw = Math.max(0, Math.min(90, Math.floor((elapsed / p.clockMs) * 90)));
      setText($("live-min"), ftAll ? "TERMINÉ" : raw + "'");
      $("live-min").classList.toggle("ft", ftAll);
    }

    const others = p.matches.filter((m) => m !== featured);
    setText($("live-prev-title"), featured ? "Multiplex — les autres matchs" : "Tous les matchs");
    $("live-prev-title").style.display = others.length ? "" : "none";
    const kitOf2 = (pid) => { const pl = (state.snap.players || []).find((x) => x.pid === pid); return pl && pl.kit; };
    setHtml($("live-prev"), others.map((m) => {
      const omc = matchClock(elapsed, goalsOf(m), p.clockMs, hold);
      const sc = scoreAt(m, omc.minute);
      const lastGoal = goalsOf(m).filter((e) => e.m <= omc.minute).pop();
      const isMine = m.a === state.pid || m.b === state.pid;
      return `<div class="match ${isMine ? "mymatch" : ""}">
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
    const d = s.draft; if (!d) return;
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
    $("team-flag").textContent = flag(d.team.code);
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
          <div class="ms-chips">${needChips || '<span class="ms-chip done">✓ Effectif complet</span>'}</div>
        </div>
      </div>`;
    }
    $("need-bar").innerHTML = panel;

    // Relance d'équipe : visible seulement à son tour, avec le compteur.
    const rerollBtn = $("btn-reroll");
    rerollBtn.style.display = myTurn && d.rerollsLeft > 0 ? "" : "none";
    rerollBtn.textContent = `🎲 Relancer l'équipe (${d.rerollsLeft})`;

    const myCountries = new Set((m0 ? m0.squad : []).map((p) => p.c));
    const grid = $("cards-grid");
    grid.classList.toggle("locked", !myTurn);
    grid.innerHTML = d.team.options.map((o) =>
      futCard(o, { disabled: !o.eligible, chemLink: o.eligible && myCountries.has(o.c) })).join("");

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
    const tick = () => { const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); el.textContent = rem; el.classList.toggle("warn", rem <= 10); };
    tick(); timerInterval = setInterval(tick, 250);
  }

  // ---------- Terrain ----------
  function renderPitch(pl) {
    const chem = MODEL.chemistry(pl.squad, pl.formationKey);
    const linksSvg = chem.links.map((l) => {
      const a = chem.placement[l.i].slot, b = chem.placement[l.j].slot;
      return `<line x1="${a.x}" y1="${a.y * 1.5}" x2="${b.x}" y2="${b.y * 1.5}"
        stroke="${l.strong ? "rgba(47,227,138,.8)" : "rgba(255,255,255,.14)"}" stroke-width="${l.strong ? 1.1 : 0.7}"/>`;
    }).join("");

    const tokens = chem.placement.map((slot, idx) => {
      const p = slot.player; if (!p) return "";
      const c = chem.perChem[idx];
      return `<div class="token" style="left:${slot.slot.x}%;top:${slot.slot.y}%">
        <span class="t-rating">${p.r}</span>
        <span class="t-flag">${flag(p.code)}</span>
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
      <p class="hint">Astuce alchimie : aligne des joueurs de même nationalité à des postes proches pour un bonus d'équipe.</p>`;
  }

  // ---------- Résultats ----------
  function renderResults(s) {
    clearInterval(timerInterval);
    state.mode = "view";
    const t = s.tournament; if (!t) return;
    state.matchMap = new Map();

    const champ = t.champion;
    const champTeam = champ && s.players.find((p) => p.pid === champ.id);
    $("champion-card").innerHTML = champ ? `
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
          <td class="tname">${flag(sc.code)} ${esc(sc.n)}</td>
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
          <span class="spn">${flag(pl.code)} ${esc(pl.n)}</span><span class="spr">${pl.r}</span></div>`).join("")}
          ${!sorted.length ? '<p class="hint">Aucun joueur drafté pour l\'instant.</p>' : ""}</div>
      </div>`;
    }).join("");
  }

  // ---------- Modal carte (clic sur un joueur en vue résultats) ----------
  function openCardModal(player) {
    $("card-modal-inner").innerHTML = futCard(player);
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
    const dots = (events || []).filter((e) => e.m <= minuteLimit).map((ev) =>
      `<circle class="fm-dot" cx="${ev.x}" cy="${ev.y * 0.64}" r="${ev.type === "goal" ? 3 : 2.1}" fill="${EV_COLOR[ev.type]}"/>`).join("");
    return `<div class="fm-pitch"><svg viewBox="0 0 100 64" preserveAspectRatio="none">${fmLinesSvg()}${dots}</svg></div>`;
  }

  function matchModal(mm) {
    const evs = mm.events || [];
    const legend = Object.keys(EV_LABEL).map((k) => `<span><i style="background:${EV_COLOR[k]}"></i>${EV_LABEL[k]}</span>`).join("");
    const lines = evs.length ? evs.map((ev) =>
      `<div class="evline ${ev.type === "goal" ? "goal" : ""}"><span class="min">${ev.m}'</span><span class="etxt">${esc(ev.text)}</span></div>`).join("")
      : '<p class="hint">Match sans occasion notable.</p>';

    $("match-sheet").innerHTML = `
      <div class="ms-head">
        <span class="ms-team a">${esc(mm.an)}</span>
        <span class="ms-score">${mm.ga} - ${mm.gb}</span>
        <span class="ms-team b">${esc(mm.bn)}</span>
      </div>
      ${mm.pens ? `<div class="ms-pens">Tirs au but : ${mm.pens.pa} - ${mm.pens.pb}</div>` : ""}
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
