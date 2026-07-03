/* ================= Football Draft — client ================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { code: null, pid: null, snap: null, es: null };
  let timerInterval = null;

  // Drapeau emoji à partir d'un code pays ISO-2
  function flag(code) {
    if (!code || code.length !== 2) return "🏳️";
    return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  function tierClass(r) {
    if (r >= 91) return "tier-elite";
    if (r >= 84) return "tier-gold";
    if (r >= 79) return "tier-silver";
    return "tier-bronze";
  }

  function show(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(screenId).classList.add("active");
  }

  // ---------- Réseau ----------
  async function api(type, extra) {
    const res = await fetch("/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ type, code: state.code, pid: state.pid }, extra || {})),
    });
    return res.json();
  }

  function connect() {
    if (state.es) state.es.close();
    const es = new EventSource(`/events?code=${state.code}&pid=${state.pid}`);
    state.es = es;
    es.addEventListener("state", (e) => {
      state.snap = JSON.parse(e.data);
      render();
    });
    es.addEventListener("pick", (e) => {
      const p = JSON.parse(e.data);
      const who = (state.snap && state.snap.players.find((x) => x.pid === p.pid)) || {};
      toast(`${flag(p.player.code)} ${who.name || "?"} → ${p.player.n}${p.auto ? " (auto)" : ""}`);
    });
  }

  function saveSession() {
    try { localStorage.setItem("fd_session", JSON.stringify({ code: state.code, pid: state.pid })); } catch (_) {}
  }

  // ---------- Accueil ----------
  $("btn-create").addEventListener("click", async () => {
    const name = $("home-name").value.trim() || "Hôte";
    const r = await api("createRoom", { name });
    if (r.ok) { state.code = r.code; state.pid = r.pid; saveSession(); connect(); }
    else $("home-error").textContent = r.error || "Erreur";
  });

  $("btn-join").addEventListener("click", async () => {
    const name = $("home-name").value.trim() || "Joueur";
    const code = $("home-code").value.trim().toUpperCase();
    if (code.length !== 4) { $("home-error").textContent = "Code à 4 caractères."; return; }
    const r = await fetch("/api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "joinRoom", code, name }),
    }).then((x) => x.json());
    if (r.ok) { state.code = r.code; state.pid = r.pid; saveSession(); connect(); }
    else $("home-error").textContent = r.error || "Erreur";
  });

  $("home-code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });

  // ---------- Lobby : contrôles hôte ----------
  $("size-picker").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !isHost()) return;
    api("setSquadSize", { size: parseInt(b.dataset.size, 10) });
  });
  $("btn-start").addEventListener("click", () => api("startGame"));
  $("btn-again").addEventListener("click", () => api("playAgain"));

  // ---------- Onglets résultats ----------
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
    document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("on"));
    t.classList.add("on");
    $("tab-" + t.dataset.tab).classList.add("on");
  });

  const me = () => state.snap && state.snap.players.find((p) => p.pid === state.pid);
  const isHost = () => state.snap && state.snap.hostPid === state.pid;

  // ---------- Rendu principal ----------
  function render() {
    const s = state.snap;
    if (!s) return;
    if (s.phase === "lobby") { renderLobby(s); show("screen-lobby"); }
    else if (s.phase === "draft") { renderDraft(s); show("screen-draft"); }
    else if (s.phase === "results") { renderResults(s); show("screen-results"); }
  }

  // ---------- Lobby ----------
  let qrDrawn = null;
  function renderLobby(s) {
    $("lobby-code").textContent = s.code;
    $("lobby-code-big").textContent = s.code;
    $("lobby-count").textContent = s.players.length;

    if (qrDrawn !== s.code) {
      const url = `${location.origin}/?room=${s.code}`;
      $("qr-holder").innerHTML = renderQR(url);
      qrDrawn = s.code;
    }

    $("lobby-players").innerHTML = s.players.map((p) => `
      <li>
        <span class="avatar">${(p.name[0] || "?").toUpperCase()}</span>
        <span class="pname">${escapeHtml(p.name)}${p.pid === state.pid ? '<span class="you-tag">TOI</span>' : ""}</span>
        ${p.isHost ? '<span class="badge-host">HÔTE</span>' : ""}
        <span class="dot ${p.connected ? "" : "off"}"></span>
      </li>`).join("");

    document.querySelectorAll("#size-picker button").forEach((b) => {
      b.classList.toggle("on", parseInt(b.dataset.size, 10) === s.squadSize);
    });

    $("host-config").style.display = isHost() ? "" : "none";
    const startBtn = $("btn-start");
    if (isHost()) {
      startBtn.style.display = "";
      startBtn.disabled = s.players.length < 2;
      $("lobby-hint").textContent = s.players.length < 2
        ? "Il faut au moins 2 joueurs pour lancer." : `Prêt à drafter des équipes de ${s.squadSize}.`;
    } else {
      startBtn.style.display = "none";
      $("lobby-hint").textContent = "En attente que l'hôte lance la partie…";
    }
  }

  // ---------- Draft ----------
  function renderDraft(s) {
    const d = s.draft;
    if (!d) return;
    const myTurn = d.currentPid === state.pid;

    $("draft-pick").textContent = d.pickNum;
    $("draft-total").textContent = d.totalPicks;

    const banner = $("turn-banner");
    banner.classList.toggle("mine", myTurn);
    $("turn-text").innerHTML = myTurn
      ? `🎯 <b>À toi de jouer</b> — choisis un joueur`
      : `Au tour de <b>${escapeHtml(d.currentName)}</b>…`;

    $("team-flag").textContent = flag(d.team.code);
    $("team-name").textContent = d.team.country;

    $("need-bar").innerHTML = Object.entries(d.needed)
      .map(([pos, n]) => `<span class="need-chip">${pos} <b>×${n}</b></span>`).join("")
      || '<span class="need-chip">Effectif complet</span>';

    $("cards-grid").innerHTML = d.team.options.map((o) => `
      <div class="pcard ${tierClass(o.r)} ${(!o.eligible || !myTurn) ? "disabled" : ""}" data-id="${o.id}">
        <div class="p-top">
          <div><div class="rating">${o.r}</div><div class="pos">${o.pos}</div></div>
          <div class="p-flag">${flag(o.code)}</div>
        </div>
        <div class="p-name">${escapeHtml(o.n)}</div>
        <div class="p-meta"><span>${o.c}</span><span>${o.d}</span></div>
      </div>`).join("");

    const m = me();
    $("my-squad-mini").innerHTML = (m ? m.squad : []).map((p) =>
      `<span class="mini-chip">${p.pos} ${escapeHtml(p.n.split(" ").slice(-1)[0])} <span class="mr">${p.r}</span></span>`
    ).join("") || '<span class="mini-chip">Ton effectif se remplira ici</span>';

    startTimer(d.deadline);
  }

  $("cards-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".pcard");
    if (!card || card.classList.contains("disabled")) return;
    const s = state.snap;
    if (!s || !s.draft || s.draft.currentPid !== state.pid) return;
    card.style.pointerEvents = "none";
    api("pick", { playerId: parseInt(card.dataset.id, 10) });
  });

  function startTimer(deadline) {
    clearInterval(timerInterval);
    const el = $("draft-timer");
    const tick = () => {
      const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      el.textContent = rem;
      el.classList.toggle("warn", rem <= 10);
    };
    tick();
    timerInterval = setInterval(tick, 250);
  }

  // ---------- Résultats ----------
  function renderResults(s) {
    clearInterval(timerInterval);
    const t = s.tournament;
    if (!t) return;

    const champ = t.champion;
    const champTeam = champ && s.players.find((p) => p.pid === champ.id);
    $("champion-card").innerHTML = champ ? `
      <div class="trophy">🏆</div>
      <div class="c-label">Champion</div>
      <div class="c-name">${escapeHtml(champ.name)}${champ.id === state.pid ? " 🎉" : ""}</div>
      <div class="c-ovr">Note d'équipe ${champTeam ? champTeam.strength.overall : "—"}</div>` : "";

    // Phases finales
    const roundNames = (n) => ({ 1: "Finale", 2: "Demi-finales", 3: "Quarts de finale" }[n] || "Tour");
    let bracket = "";
    if (t.knockout) {
      const R = t.knockout.rounds;
      R.forEach((round, i) => {
        bracket += `<div class="round-title">${roundNames(R.length - i)}</div>`;
        round.forEach((m) => {
          const aw = m.winner === m.a, bw = m.winner === m.b;
          bracket += `<div class="match">
            <span class="side ${aw ? "win" : "lose"}">${escapeHtml(m.an)}</span>
            <span class="score">${m.ga}-${m.gb}${m.pens ? `<span class="pens"> (${m.pens.pa}-${m.pens.pb} tab)</span>` : ""}</span>
            <span class="side ${bw ? "win" : "lose"}" style="justify-content:flex-end">${escapeHtml(m.bn)}</span>
          </div>`;
        });
      });
    } else {
      bracket = '<p class="hint">Pas assez d\'équipes pour des phases finales.</p>';
    }
    $("tab-bracket").innerHTML = bracket;

    // Classement
    const K = t.standings.length >= 8 ? 8 : t.standings.length >= 4 ? 4 : 2;
    $("tab-table").innerHTML = `<table class="ltable">
      <tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th><th>Diff</th><th>Pts</th></tr>
      ${t.standings.map((r, i) => `
        <tr class="${i < K ? "qualif" : ""}">
          <td class="rk">${i + 1}</td>
          <td class="tname">${escapeHtml(r.name)}${r.id === state.pid ? '<span class="you-tag">TOI</span>' : ""}</td>
          <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
          <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.pts}</td>
        </tr>`).join("")}
    </table>`;

    // Équipes
    $("tab-squads").innerHTML = s.players.map((p) => {
      const sorted = p.squad.slice().sort((a, b) => order(a.pos) - order(b.pos) || b.r - a.r);
      return `<div class="squad-block">
        <div class="squad-head">
          <span class="sname">${escapeHtml(p.name)}${p.pid === state.pid ? '<span class="you-tag">TOI</span>' : ""}</span>
          <span class="sovr">${p.strength.overall}</span>
        </div>
        <div class="squad-players">
          ${sorted.map((pl) => `<div class="sp"><span class="spos">${pl.pos}</span>
            <span class="spn">${flag(pl.code)} ${escapeHtml(pl.n)}</span><span class="spr">${pl.r}</span></div>`).join("")}
        </div>
      </div>`;
    }).join("");

    $("btn-again").style.display = isHost() ? "" : "none";
  }

  const order = (pos) => ({ GK: 0, DEF: 1, MID: 2, FWD: 3 }[pos] ?? 4);

  // ---------- QR en SVG ----------
  function renderQR(text) {
    const m = QRCode.matrix(text);
    const n = m.length, q = 2, size = n + q * 2;
    let rects = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (m[r][c]) rects += `<rect x="${c + q}" y="${r + q}" width="1.02" height="1.02"/>`;
    return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#fff"/><g fill="#04121f">${rects}</g></svg>`;
  }

  // ---------- Utilitaires ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(4,18,31,.95);border:1px solid rgba(255,255,255,.15);color:#eaf6ff;padding:10px 16px;border-radius:24px;font-size:13px;font-weight:700;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:90%;text-align:center;transition:opacity .3s;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2600);
  }

  // ---------- Reprise de session / lien direct ----------
  function boot() {
    // Pied de page dynamique (nombre de joueurs / nations).
    try {
      const foot = document.querySelector(".home-foot");
      if (foot && typeof PLAYERS !== "undefined") {
        const nations = new Set(PLAYERS.map((p) => p.c)).size;
        foot.textContent = `${PLAYERS.length} légendes · ${nations} nations · multijoueur temps réel`;
      }
    } catch (_) {}

    const params = new URLSearchParams(location.search);

    // Mode démo/capture : rend une phase à partir d'un snapshot figé.
    const mock = params.get("mock");
    if (mock) {
      fetch("/_mock/" + mock + ".json").then((r) => r.json()).then((d) => {
        state.code = d.snap.code; state.pid = d.viewPid; state.snap = d.snap; render();
      });
      return;
    }

    const roomParam = (params.get("room") || params.get("code") || "").toUpperCase();
    if (roomParam) $("home-code").value = roomParam;

    // Lien direct de reconnexion : ?code=XXXX&pid=N
    const pidParam = parseInt(params.get("pid"), 10);
    if (roomParam && pidParam) {
      state.code = roomParam; state.pid = pidParam; saveSession(); connect();
      setTimeout(() => { if (!state.snap && state.es) state.es.close(); }, 3500);
      return;
    }

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("fd_session") || "null"); } catch (_) {}
    if (saved && saved.code && saved.pid) {
      state.code = saved.code; state.pid = saved.pid;
      connect();
      // Si aucune donnée reçue rapidement, la session a expiré -> accueil.
      setTimeout(() => { if (!state.snap) { localStorage.removeItem("fd_session"); if (state.es) state.es.close(); } }, 3500);
    }
  }
  boot();
})();
