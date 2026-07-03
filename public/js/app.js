/* ================= Football Draft — client (FUT) ================= */
(function () {
  "use strict";

  // Version affichée sur l'accueil : permet de vérifier ce qui est déployé.
  const APP_VERSION = "v9 — bouton reset";

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
        budget: MODEL.BUDGET, budgetLeft: MODEL.BUDGET - cur.spent };
    }
    if (local.phase === "playing" && local.reveal) {
      const { roundIdx, rounds } = local.reveal;
      const cur = rounds[Math.min(roundIdx, rounds.length - 1)];
      snap.playing = { round: roundIdx + 1, totalRounds: rounds.length, stage: cur.stage, type: cur.type,
        matches: cur.matches, startedAt: local.roundStartedAt, clockMs: 38000 };
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
    local.players.forEach((p) => { p.squad = []; p.spent = 0; });
    const pids = local.players.map((p) => p.pid);
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

  // Réinitialisation d'urgence (confirmée) — accessible à tous les joueurs.
  const confirmReset = () => { if (confirm("Réinitialiser la partie pour tout le monde et revenir au salon ?")) api("resetGame"); };
  ["btn-reset-draft", "btn-reset-playing", "btn-reset-results"].forEach((id) => $(id).addEventListener("click", confirmReset));

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
    if (s.phase !== "playing") clearInterval(liveInterval);
    if (s.phase === "lobby") { renderLobby(s); show("screen-lobby"); }
    else if (s.phase === "draft") { renderDraft(s); show("screen-draft"); }
    else if (s.phase === "playing") { renderPlaying(s); show("screen-playing"); }
    else if (s.phase === "results") { renderResults(s); show("screen-results"); }
  }

  // ---------- Diffusion en direct façon FM (journée par journée) ----------
  const fmtM = (v) => (v >= 10 ? String(Math.round(v)) : String(v).replace(".", ",")) + " M€";
  let liveInterval = null;

  function renderPlaying(s) {
    clearInterval(timerInterval);
    const p = s.playing; if (!p) return;
    const isLocal = s.code === "LOCAL";
    $("play-stage").textContent = `${p.stage} · ${p.round}/${p.totalRounds}`;
    // Chacun suit SON match ; sans match (multiplex) on voit toute la journée.
    const mine = isLocal ? null : p.matches.find((m) => m.a === state.pid || m.b === state.pid);

    clearInterval(liveInterval);
    const tick = () => {
      const elapsed = Date.now() - p.startedAt;
      const minute = Math.max(0, Math.min(90, Math.floor((elapsed / p.clockMs) * 90)));
      drawLive(p, mine, minute, isLocal);
    };
    tick();
    liveInterval = setInterval(tick, 400);
  }

  // ---------- Replay d'action : 11 contre 11 sur terrain complet ----------
  const EV_ICON = { goal: "⚽ BUT !", saved: "🧤 Arrêt", off: "❌ À côté", post: "🪵 Poteau" };

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

  // Rejoue une action au milieu du 11v11 : le tireur part de SON poste vers
  // le point de tir réel, reçoit la passe d'un coéquipier proche, frappe ;
  // les défenseurs les plus proches ferment, le gardien plonge.
  function actionReplay(match, ev) {
    const R = (n) => { let h = ((ev.m * 2654435761) ^ (ev.scorer.length * 40503) ^ (n * 2246822519)) >>> 0; return (h % 1000) / 1000; };
    const atkSide = ev.side, right = atkSide === "a";
    const A = teamSetup(right ? match.a : match.b, atkSide);
    const D = teamSetup(right ? match.b : match.a, right ? "b" : "a");
    if (A.kit.toLowerCase() === D.kit.toLowerCase()) D.kit = "#f1f3f5";

    const shot = { x: Math.max(4, Math.min(96, ev.x)), y: Math.max(5, Math.min(59, ev.y * 0.64)) };
    const near = (list, pt, excl) => list
      .filter((d) => d.pos !== "GK" && d !== excl)
      .sort((u, v) => Math.hypot(u.p.x - pt.x, u.p.y - pt.y) - Math.hypot(v.p.x - pt.x, v.p.y - pt.y));
    let shooter = A.dots.find((d) => d.n === ev.scorer) || near(A.dots, shot)[0];
    const passer = near(A.dots, shot, shooter)[0];
    const defsNear = near(D.dots, shot).slice(0, 2);
    const gk = D.dots.find((d) => d.pos === "GK") || D.dots[0];

    const gy = (v) => Math.max(3, Math.min(61, v));
    let end, gkTo;
    if (ev.type === "goal") { end = { x: right ? 99.3 : 0.7, y: gy(27.5 + R(1) * 9) }; gkTo = { x: gk.p.x, y: end.y > 32 ? 26.5 : 37.5 }; }
    else if (ev.type === "saved") { end = { x: right ? 96.4 : 3.6, y: gy(28 + R(2) * 8) }; gkTo = end; }
    else if (ev.type === "post") { end = { x: right ? 98.4 : 1.6, y: R(3) < 0.5 ? 26.2 : 37.8 }; gkTo = { x: gk.p.x, y: 32 }; }
    else { end = { x: right ? 99.6 : 0.4, y: R(4) < 0.5 ? gy(16 + R(5) * 6) : gy(42 + R(5) * 6) }; gkTo = { x: gk.p.x, y: 32 }; }

    // Ballon : passe -> contrôle -> frappe (+ rebond sur poteau).
    const pts = [passer.p, shot, end];
    if (ev.type === "post") pts.push({ x: shot.x + (right ? -9 : 9), y: gy(shot.y + (R(6) < 0.5 ? -5 : 5)) });
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0.1; seg.push(L); total += L; }
    const f1 = (seg[0] / total).toFixed(3);
    const f2 = ((seg[0] + seg[1]) / total).toFixed(3);
    const path = pts.map((p, i) => (i ? "L" : "M") + ` ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const kp = pts.length === 3 ? `0;${f1};${f1};1` : `0;${f1};${f1};${f2};1`;
    const kt = pts.length === 3 ? "0;0.42;0.62;1" : "0;0.38;0.56;0.82;1";

    const move = (from, to, begin, dur) =>
      `<animateMotion begin="${begin}s" dur="${dur}s" fill="freeze" path="M 0 0 L ${(to.x - from.x).toFixed(1)} ${(to.y - from.y).toFixed(1)}"/>`;
    const dot = (d, color, extra, ring) =>
      `<circle cx="${d.p.x.toFixed(1)}" cy="${d.p.y.toFixed(1)}" r="1.7" fill="${color}" stroke="${ring ? "#ffd54a" : "rgba(255,255,255,.55)"}" stroke-width="${ring ? 0.6 : 0.35}">${extra || ""}</circle>`;

    const players = []
      .concat(A.dots.map((d) => {
        if (d === shooter) return dot(d, A.kit, move(d.p, shot, 0.15, 1.1));
        if (d === passer) return dot(d, A.kit, move(d.p, { x: d.p.x + (shot.x - d.p.x) * 0.2, y: d.p.y + (shot.y - d.p.y) * 0.2 }, 0.9, 1));
        return dot(d, A.kit, d.pos === "GK" ? "" : "", d.pos === "GK");
      }))
      .concat(D.dots.map((d) => {
        if (d === gk) return dot(d, D.kit, move(d.p, gkTo, 1.5, 0.35), true);
        if (defsNear.includes(d)) return dot(d, D.kit, move(d.p, { x: d.p.x + (shot.x - d.p.x) * 0.35, y: d.p.y + (shot.y - d.p.y) * 0.35 }, 0.55, 1.1));
        return dot(d, D.kit);
      }))
      .join("");

    return `<div class="fm-pitch replay"><svg viewBox="0 0 100 64" preserveAspectRatio="none">
      ${fmLinesSvg()}
      ${players}
      <circle cx="0" cy="0" r="1.15" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width="0.3">
        <animateMotion begin="0.15s" dur="2.15s" fill="freeze" calcMode="linear" keyPoints="${kp}" keyTimes="${kt}" path="${path}"/>
      </circle>
    </svg>
    <div class="stage-note">${ev.m}' ${EV_ICON[ev.type] || ""} ${esc(ev.scorer.split(" ").slice(-1)[0])}</div></div>`;
  }

  // Coup d'envoi : les deux onze alignés dans leurs formations, ballon au centre.
  function kickoffStage(match) {
    const A = teamSetup(match.a, "a"), D = teamSetup(match.b, "b");
    if (A.kit.toLowerCase() === D.kit.toLowerCase()) D.kit = "#f1f3f5";
    const dot = (d, color, ring) =>
      `<circle cx="${d.p.x.toFixed(1)}" cy="${d.p.y.toFixed(1)}" r="1.7" fill="${color}" stroke="${ring ? "#ffd54a" : "rgba(255,255,255,.55)"}" stroke-width="${ring ? 0.6 : 0.35}"/>`;
    const players = A.dots.map((d) => dot(d, A.kit, d.pos === "GK")).join("")
      + D.dots.map((d) => dot(d, D.kit, d.pos === "GK")).join("");
    return `<div class="fm-pitch replay"><svg viewBox="0 0 100 64" preserveAspectRatio="none">
      ${fmLinesSvg()}${players}
      <circle cx="50" cy="32" r="1.15" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width="0.3"/>
    </svg><div class="stage-note">🟢 Coup d'envoi…</div></div>`;
  }

  // Score d'un match à la minute donnée.
  function scoreAt(m, minute) {
    if (minute >= 90) return { ga: m.ga, gb: m.gb };
    let ga = 0, gb = 0;
    (m.events || []).forEach((e) => { if (e.type === "goal" && e.m <= minute) { if (e.side === "a") ga++; else gb++; } });
    return { ga, gb };
  }

  function drawLive(p, mine, minute, isLocal) {
    const ft = minute >= 90;
    const badge = ft ? '<span class="live-min ft">TERMINÉ</span>' : `<span class="live-min">⏱ ${minute}'</span>`;
    // En mode 1 téléphone, on suit le premier match de la journée en vedette.
    const featured = mine || (isLocal ? p.matches[0] : null);

    if (featured) {
      const sc = scoreAt(featured, minute);
      $("live-card").innerHTML = `
        <div class="lc-stage">${esc(p.stage)} · ${mine ? "TON MATCH" : "MATCH VEDETTE"} ${badge}</div>
        <div class="lc-row">
          <span class="lc-team">${esc(featured.an)}</span>
          <span class="lc-score">${sc.ga} - ${sc.gb}</span>
          <span class="lc-team">${esc(featured.bn)}</span>
        </div>
        ${ft && featured.pens ? `<div class="lc-pens">Tirs au but : ${featured.pens.pa} - ${featured.pens.pb}</div>` : ""}`;

      // Replay de la dernière action : rendu uniquement quand l'action change.
      const seen = (featured.events || []).filter((e) => e.m <= minute);
      const last = seen[seen.length - 1];
      const key = p.stage + ":" + featured.a + ":" + (last ? last.m + last.scorer + last.type : "ko");
      if (state.replayKey !== key) {
        state.replayKey = key;
        $("live-stage").innerHTML = last ? actionReplay(featured, last) : kickoffStage(featured);
      }

      const evs = seen.slice().sort((a, b) => b.m - a.m);
      $("live-summary").innerHTML = `<div class="live-feed">${
        evs.map((e) => `<div class="evline ${e.type === "goal" ? "goal" : ""}"><span class="min">${e.m}'</span><span class="etxt">${esc(e.text)}</span></div>`).join("")
        || `<div class="evline"><span class="min">1'</span><span class="etxt">🟢 Coup d'envoi !</span></div>`}</div>`;
    } else {
      $("live-card").innerHTML = `<div class="lc-stage">${esc(p.stage)} · MULTIPLEX ${badge}</div>`;
      $("live-stage").innerHTML = "";
      state.replayKey = null;
      $("live-summary").innerHTML = "";
    }

    const others = p.matches.filter((m) => m !== featured);
    $("live-prev-title").textContent = mine ? "Multiplex — les autres matchs" : "Tous les matchs";
    $("live-prev-title").style.display = others.length ? "" : "none";
    $("live-prev").innerHTML = others.map((m) => {
      const sc = scoreAt(m, minute);
      const lastGoal = (m.events || []).filter((e) => e.type === "goal" && e.m <= minute).pop();
      return `<div class="match">
        <span class="side"><span>${esc(m.an)}</span></span>
        <span class="score">${sc.ga}-${sc.gb}${ft && m.pens ? `<span class="pens"> (${m.pens.pa}-${m.pens.pb})</span>` : ""}</span>
        <span class="side" style="justify-content:flex-end"><span>${esc(m.bn)}</span></span>
      </div>${lastGoal && !ft ? `<div class="mplex-last">⚽ ${lastGoal.m}' ${esc(lastGoal.scorer)}</div>` : ""}`;
    }).join("");

    // Journée suivante : en local un bouton au coup de sifflet final,
    // en ligne le serveur avance seul quand tous les matchs sont finis.
    const nextBtn = $("btn-next-match");
    nextBtn.style.display = isLocal && ft ? "" : "none";
    nextBtn.textContent = p.round >= p.totalRounds ? "Voir les résultats 🏆" : "Journée suivante ▶";
    $("btn-skip").style.display = !isLocal && isHost() ? "" : "none";
    if (!isLocal && ft) $("live-summary").insertAdjacentHTML("beforeend", '<p class="hint">Tous les matchs sont terminés — journée suivante dans un instant…</p>');
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
    $("turn-banner").classList.toggle("mine", myTurn);
    $("turn-text").innerHTML = isLocal
      ? `📱 Au tour de <b>${esc(d.currentName)}</b> — passe-lui le téléphone !`
      : (myTurn ? "🎯 <b>À toi de jouer</b> — choisis un joueur" : `Au tour de <b>${esc(d.currentName)}</b>…`);
    $("team-flag").textContent = flag(d.team.code);
    $("draft-team-name").textContent = d.team.country;

    const budgetChip = d.budget != null
      ? `<span class="need-chip budget-chip">💰 <b>${fmtM(Math.round(d.budgetLeft * 10) / 10)}</b> / ${fmtM(d.budget)}</span>` : "";
    // Alchimie en direct : la sienne + les pays de son effectif pour repérer les liens.
    const m0 = me();
    const chemChip = m0
      ? `<span class="need-chip chem-chip">🔗 Alchimie <b>${MODEL.chemistry(m0.squad, m0.formationKey).teamChem}</b></span>` : "";
    $("need-bar").innerHTML = budgetChip + chemChip
      + (Object.entries(d.needed).map(([pos, n]) => `<span class="need-chip">${pos} <b>×${n}</b></span>`).join("")
      || '<span class="need-chip">Effectif complet</span>');

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
      ${t.standings.map((r, i) => `<tr class="${i < K ? "qualif" : ""}">
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

    $("tab-squads").innerHTML = s.players.map((p) => {
      const sorted = p.squad.slice().sort((a, b) => ord(a.pos) - ord(b.pos) || b.r - a.r);
      return `<div class="squad-block">
        <div class="squad-head">
          <div class="sh-left"><div class="kit-mini">${kitSvg(p.kit)}</div>
            <span class="sname">${esc(p.teamName)}${p.pid === state.pid ? '<span class="you-tag">TOI</span>' : ""}</span></div>
          <span class="sovr">${p.strength.overall}</span>
        </div>
        <div class="squad-players">${sorted.map((pl) => `<div class="sp" data-id="${pl.id}"><span class="spos">${pl.pos}</span>
          <span class="spn">${flag(pl.code)} ${esc(pl.n)}</span><span class="spr">${pl.r}</span></div>`).join("")}</div>
      </div>`;
    }).join("");

    $("btn-again").style.display = isHost() ? "" : "none";
    // Sans l'hôte, chacun peut quand même relancer via la réinitialisation.
    $("btn-reset-results").style.display = isHost() ? "none" : "";
  }
  const ord = (pos) => ({ GK: 0, DEF: 1, MID: 2, FWD: 3 }[pos] ?? 4);

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
        if (d.snap.playing) { d.snap.playing.startedAt = Date.now(); d.snap.playing.clockMs = parseInt(params.get("clock"), 10) || 38000; }
        render();
        if (params.get("open") && state.matchMap && state.matchMap.size) matchModal(state.matchMap.values().next().value);
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
