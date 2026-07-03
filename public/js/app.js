/* ================= Football Draft — client (FUT) ================= */
(function () {
  "use strict";

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
    return `<div class="fut ${tierClass(pl.r)} ${stateClass}" data-id="${pl.id}">
      ${pl.taken ? '<span class="taken-badge">PRIS</span>' : ""}
      ${pl.expensive ? '<span class="taken-badge expensive-badge">TROP CHER</span>' : ""}
      <div class="fut-inner">
        <div class="fut-top">
          <div class="fut-rating"><span class="r">${pl.r}</span><span class="p">${pl.pos}</span></div>
          <div class="fut-badges"><span class="flag">${flag(pl.code)}</span><span class="price">${fmtM(price)}</span></div>
        </div>
        <div class="fut-name">${esc(pl.n)}</div>
        <div class="fut-sub">${esc(pl.c)} · ${esc(pl.d)}</div>
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
      const { idx, list } = local.reveal;
      const cur = list[Math.min(idx, list.length - 1)];
      snap.playing = { idx: idx + 1, total: list.length, stage: cur.stage, type: cur.type, match: cur.m,
        results: list.slice(0, idx).map((e) => ({ stage: e.stage, an: e.m.an, bn: e.m.bn, ga: e.m.ga, gb: e.m.gb, pens: e.m.pens || null })) };
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
    const budget = { left: MODEL.BUDGET - cur.spent, reserve: 3 * (11 - cur.squad.length - 1) };
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
      // Diffusion : on avance match par match avec le bouton.
      local.phase = "playing";
      local.reveal = { idx: 0, list: ENGINE.buildReveal(local.tournament) };
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
        local.reveal.idx++;
        if (local.reveal.idx >= local.reveal.list.length) local.phase = "results";
        localRender();
      }
    }
    else if (type === "playAgain") { local.phase = "lobby"; local.draft = null; local.tournament = null; local.reveal = null; local.players.forEach((p) => { p.squad = []; p.spent = 0; }); localRender(); }
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
    if (s.phase === "lobby") { renderLobby(s); show("screen-lobby"); }
    else if (s.phase === "draft") { renderDraft(s); show("screen-draft"); }
    else if (s.phase === "playing") { renderPlaying(s); show("screen-playing"); }
    else if (s.phase === "results") { renderResults(s); show("screen-results"); }
  }

  // ---------- Diffusion des matchs (EN DIRECT) ----------
  const fmtM = (v) => (v >= 10 ? String(Math.round(v)) : String(v).replace(".", ",")) + " M€";

  function renderPlaying(s) {
    clearInterval(timerInterval);
    const p = s.playing; if (!p) return;
    const isLocal = s.code === "LOCAL";
    $("play-stage").textContent = `${p.stage} · ${p.idx}/${p.total}`;

    const m = p.match;
    $("live-card").innerHTML = `
      <div class="lc-stage">${esc(p.stage)}</div>
      <div class="lc-row">
        <span class="lc-team">${esc(m.an)}</span>
        <span class="lc-score">${m.ga} - ${m.gb}</span>
        <span class="lc-team">${esc(m.bn)}</span>
      </div>
      ${m.pens ? `<div class="lc-pens">Tirs au but : ${m.pens.pa} - ${m.pens.pb}</div>` : ""}`;

    const goals = (m.events || []).filter((e) => e.type === "goal");
    $("live-summary").innerHTML = goals.length
      ? goals.map((e) => `<div class="evline goal"><span class="min">${e.m}'</span><span class="etxt">⚽ ${esc(e.scorer)} (${esc(e.teamName)})</span></div>`).join("")
      : '<p class="hint">Aucun but — les défenses ont tenu bon.</p>';

    $("btn-next-match").style.display = isLocal ? "" : "none";
    $("btn-skip").style.display = !isLocal && isHost() ? "" : "none";

    const prev = (p.results || []).slice(-8).reverse();
    $("live-prev-title").style.display = prev.length ? "" : "none";
    $("live-prev").innerHTML = prev.map((r) => `
      <div class="match"><span class="side"><span>${esc(r.an)}</span></span>
      <span class="score">${r.ga}-${r.gb}${r.pens ? `<span class="pens"> (${r.pens.pa}-${r.pens.pb})</span>` : ""}</span>
      <span class="side" style="justify-content:flex-end"><span>${esc(r.bn)}</span></span></div>`).join("");
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
    $("need-bar").innerHTML = budgetChip
      + (Object.entries(d.needed).map(([pos, n]) => `<span class="need-chip">${pos} <b>×${n}</b></span>`).join("")
      || '<span class="need-chip">Effectif complet</span>');

    const grid = $("cards-grid");
    grid.classList.toggle("locked", !myTurn);
    grid.innerHTML = d.team.options.map((o) => futCard(o, { disabled: !o.eligible })).join("");

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
          <g fill="none" stroke="rgba(255,255,255,.28)" stroke-width="0.6">
            <rect x="2" y="2" width="96" height="146"/>
            <line x1="2" y1="75" x2="98" y2="75"/>
            <circle cx="50" cy="75" r="12"/>
            <rect x="28" y="2" width="44" height="20"/><rect x="40" y="2" width="20" height="8"/>
            <rect x="28" y="128" width="44" height="20"/><rect x="40" y="140" width="20" height="8"/>
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

  function matchModal(mm) {
    const evs = mm.events || [];
    const dots = evs.map((ev) =>
      `<circle class="fm-dot" cx="${ev.x}" cy="${ev.y * 0.64}" r="${ev.type === "goal" ? 3 : 2.1}" fill="${EV_COLOR[ev.type]}"/>`).join("");
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
      <div class="fm-pitch"><svg viewBox="0 0 100 64" preserveAspectRatio="none">
        <g fill="none" stroke="rgba(255,255,255,.28)" stroke-width="0.5">
          <rect x="1.5" y="1.5" width="97" height="61"/>
          <line x1="50" y1="1.5" x2="50" y2="62.5"/><circle cx="50" cy="32" r="9"/>
          <rect x="1.5" y="18" width="12" height="28"/><rect x="86.5" y="18" width="12" height="28"/>
        </g>${dots}
      </svg></div>
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
    const params = new URLSearchParams(location.search);
    const mock = params.get("mock");
    if (mock) {
      document.body.classList.add("no-anim");
      fetch("_mock/" + mock + ".json").then((r) => r.json()).then((d) => {
        state.code = d.snap.code; state.pid = d.viewPid; state.snap = d.snap; render();
        if (params.get("open") && state.matchMap && state.matchMap.size) matchModal(state.matchMap.values().next().value);
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
