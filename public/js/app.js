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

  // ---------- Carte FUT ----------
  const monogram = (n) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  function futCard(pl, opts) {
    opts = opts || {};
    const stats = MODEL.computeStats(pl); // [PAC,SHO,PAS,DRI,DEF,PHY] ou GK
    const order = [0, 3, 1, 4, 2, 5]; // agencement 2 colonnes façon FIFA
    const statsHtml = order.map((i) => `<span><span class="lab">${stats[i].label}</span><b>${stats[i].value}</b></span>`).join("");
    return `<div class="fut ${tierClass(pl.r)} ${opts.disabled ? "disabled" : ""}" data-id="${pl.id}">
      <div class="fut-inner">
        <div class="fut-top">
          <div class="fut-rating"><span class="r">${pl.r}</span><span class="p">${pl.pos}</span></div>
          <div class="fut-badges"><span class="flag">${flag(pl.code)}</span></div>
        </div>
        <div class="fut-photo"><span class="silhouette">${monogram(pl.n)}</span></div>
        <div class="fut-name">${esc(pl.n)}</div>
        <div class="fut-stats">${statsHtml}</div>
      </div></div>`;
  }

  // ---------- Réseau ----------
  async function api(type, extra) {
    const res = await fetch("/api", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ type, code: state.code, pid: state.pid }, extra || {})) });
    return res.json();
  }

  function connect() {
    if (state.es) state.es.close();
    const es = new EventSource(`/events?code=${state.code}&pid=${state.pid}`);
    state.es = es;
    es.addEventListener("state", (e) => { state.snap = JSON.parse(e.data); render(); });
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
    const r = await fetch("/api", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "joinRoom", code, name: $("home-name").value.trim() || "Joueur" }) }).then((x) => x.json());
    if (r.ok) { state.code = r.code; state.pid = r.pid; saveSession(); connect(); } else $("home-error").textContent = r.error || "Erreur";
  });
  $("home-code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });

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
    else if (s.phase === "results") { renderResults(s); show("screen-results"); }
  }

  // ---------- Lobby ----------
  let qrDrawn = null;
  function renderLobby(s) {
    $("lobby-code").textContent = s.code;
    $("lobby-code-big").textContent = s.code;
    $("lobby-count").textContent = s.players.length;
    if (qrDrawn !== s.code) { $("qr-holder").innerHTML = renderQR(`${location.origin}/?room=${s.code}`); qrDrawn = s.code; }

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

    $("turn-banner").classList.toggle("mine", myTurn);
    $("turn-text").innerHTML = myTurn ? "🎯 <b>À toi de jouer</b> — choisis un joueur" : `Au tour de <b>${esc(d.currentName)}</b>…`;
    $("team-flag").textContent = flag(d.team.code);
    $("draft-team-name").textContent = d.team.country;

    $("need-bar").innerHTML = Object.entries(d.needed).map(([pos, n]) => `<span class="need-chip">${pos} <b>×${n}</b></span>`).join("")
      || '<span class="need-chip">Effectif complet</span>';

    const grid = $("cards-grid");
    grid.classList.toggle("locked", !myTurn);
    grid.innerHTML = d.team.options.map((o) => futCard(o, { disabled: !o.eligible })).join("");

    const m = me();
    $("my-squad-mini").innerHTML = (m ? m.squad : []).map((p) =>
      `<span class="mini-chip">${p.pos} ${esc(p.n.split(" ").slice(-1)[0])} <span class="mr">${p.r}</span></span>`).join("")
      || '<span class="mini-chip">Ton effectif se remplira ici</span>';

    startTimer(d.deadline);
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
        round.forEach((mm) => {
          const aw = mm.winner === mm.a, bw = mm.winner === mm.b;
          bracket += `<div class="match">
            <span class="side ${aw ? "win" : "lose"}"><span>${esc(mm.an)}</span></span>
            <span class="score">${mm.ga}-${mm.gb}${mm.pens ? `<span class="pens"> (${mm.pens.pa}-${mm.pens.pb} tab)</span>` : ""}</span>
            <span class="side ${bw ? "win" : "lose"}" style="justify-content:flex-end"><span>${esc(mm.bn)}</span></span>
          </div>`;
        });
      });
    } else bracket = '<p class="hint">Pas assez d\'équipes pour des phases finales.</p>';
    $("tab-bracket").innerHTML = bracket;

    const K = t.standings.length >= 8 ? 8 : t.standings.length >= 4 ? 4 : 2;
    $("tab-table").innerHTML = `<table class="ltable">
      <tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th><th>Diff</th><th>Pts</th></tr>
      ${t.standings.map((r, i) => `<tr class="${i < K ? "qualif" : ""}">
        <td class="rk">${i + 1}</td><td class="tname">${esc(r.name)}${r.id === state.pid ? '<span class="you-tag">TOI</span>' : ""}</td>
        <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.pts}</td></tr>`).join("")}</table>`;

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
    if (mock) { document.body.classList.add("no-anim"); fetch("/_mock/" + mock + ".json").then((r) => r.json()).then((d) => { state.code = d.snap.code; state.pid = d.viewPid; state.snap = d.snap; render(); }); return; }

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
