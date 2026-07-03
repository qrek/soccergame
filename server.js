/*
 * Serveur de jeu — Football Draft (zéro dépendance externe).
 * - Sert le client statique depuis /public
 * - Temps réel via Server-Sent Events (GET /events) + actions POST (/api)
 *
 * Chaque joueur rejoint une "salle" via un CODE (ou un QR code qui pointe vers
 * l'URL avec ?room=CODE). Draft et tournoi sont autoritaires côté serveur.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const engine = require("./public/js/engine.js");
const MODEL = require("./public/js/model.js");

const RAW_PLAYERS = require("./public/data/players.js");
const PLAYERS = RAW_PLAYERS.map((p, i) => ({ id: i, ...p }));

const PORT = process.env.PORT || 3000;
const TURN_SECONDS = 45;
const SQUAD_SIZE = 11; // toutes les équipes ont 11 joueurs
const MATCH_MS = parseInt(process.env.MATCH_MS, 10) || 52000;      // durée du direct d'une journée (0' -> 90')
const PAUSE_MS = parseInt(process.env.PAUSE_MS, 10) || 7000;       // pause score final avant la journée suivante
const GOAL_HOLD_MS = parseInt(process.env.GOAL_HOLD_MS, 10) || 3500; // l'horloge se fige sur chaque but (célébration)
const REROLLS = 2; // relances d'équipe par joueur pendant le draft
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------------------------------------------------------------------------
// Salles
// ---------------------------------------------------------------------------
const rooms = new Map();

function genCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = genCode();
  const room = {
    code,
    phase: "lobby",
    players: [],       // { pid, name, connected, squad: [], formationKey }
    clients: new Map(), // pid -> res (flux SSE)
    nextPid: 1,
    hostPid: null,
    squadSize: SQUAD_SIZE,
    draft: null,
    tournament: null,
    turnTimer: null,
  };
  rooms.set(code, room);
  return room;
}

const playerByPid = (room, pid) => room.players.find((p) => p.pid === pid);
const squadPlayers = (room, player) => player.squad.map((id) => PLAYERS[id]);

function neededPositions(room, player) {
  const counts = MODEL.positionCounts(player.formationKey);
  const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  squadPlayers(room, player).forEach((p) => have[p.pos]++);
  const need = {};
  for (const pos of ["GK", "DEF", "MID", "FWD"]) {
    const rem = counts[pos] - have[pos];
    if (rem > 0) need[pos] = rem;
  }
  return need;
}

function draftedIds(room) {
  const set = new Set();
  room.players.forEach((p) => p.squad.forEach((id) => set.add(id)));
  return set;
}

// ---------------------------------------------------------------------------
// Diffusion (SSE)
// ---------------------------------------------------------------------------
function snapshot(room) {
  const players = room.players.map((p) => {
    const sp = squadPlayers(room, p);
    const chem = MODEL.chemistry(sp, p.formationKey);
    return {
      pid: p.pid,
      name: p.name,
      connected: p.connected,
      isHost: p.pid === room.hostPid,
      formationKey: p.formationKey,
      teamName: p.teamName || p.name,
      kit: p.kit,
      squad: sp,
      squadCount: sp.length,
      strength: engine.teamStrength(sp),
      chem: chem.teamChem,
      chemBonus: chem.bonus,
    };
  });

  const snap = {
    code: room.code,
    phase: room.phase,
    hostPid: room.hostPid,
    squadSize: room.squadSize,
    players,
  };

  if (room.phase === "draft" && room.draft) {
    const d = room.draft;
    const drafter = playerByPid(room, d.currentPid);
    snap.draft = {
      pickNum: d.pickNum + 1,
      totalPicks: d.order.length,
      currentPid: d.currentPid,
      currentName: drafter ? drafter.name : "",
      round: Math.floor(d.pickNum / room.players.length) + 1,
      team: d.currentTeam,
      needed: drafter ? neededPositions(room, drafter) : {},
      deadline: d.deadline,
      budget: MODEL.BUDGET,
      budgetLeft: drafter ? MODEL.BUDGET - drafter.spent : 0,
      rerollsLeft: drafter ? (drafter.rerolls || 0) : 0,
    };
  }

  if (room.phase === "playing" && room.reveal) {
    const { roundIdx, rounds, startedAt } = room.reveal;
    const cur = rounds[Math.min(roundIdx, rounds.length - 1)];
    snap.playing = {
      round: roundIdx + 1,
      totalRounds: rounds.length,
      stage: cur.stage,
      type: cur.type,
      matches: cur.matches,
      startedAt,
      clockMs: MATCH_MS,
      goalHoldMs: GOAL_HOLD_MS,
    };
  }

  if (room.phase === "results" && room.tournament) snap.tournament = room.tournament;
  return snap;
}

function sendEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_) { /* client parti */ }
}

function broadcast(room) {
  const snap = snapshot(room);
  for (const res of room.clients.values()) sendEvent(res, "state", snap);
}

function broadcastPick(room, payload) {
  for (const res of room.clients.values()) sendEvent(res, "pick", payload);
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------
function startDraft(room) {
  room.phase = "draft";
  room.players.forEach((p) => { p.squad = []; p.spent = 0; p.rerolls = REROLLS; });
  const pids = room.players.map((p) => p.pid);
  const order = [];
  for (let r = 0; r < SQUAD_SIZE; r++) {
    order.push(...(r % 2 === 0 ? pids : pids.slice().reverse()));
  }
  room.draft = { order, pickNum: 0, currentPid: order[0], currentTeam: null, deadline: 0 };
  prepareTurn(room);
}

function prepareTurn(room) {
  const d = room.draft;
  d.currentPid = d.order[d.pickNum];
  const drafter = playerByPid(room, d.currentPid);
  const drafted = draftedIds(room);
  const need = neededPositions(room, drafter);
  // Réserve : garder de quoi payer les postes restants (~2 M€ chacun).
  const budget = { left: MODEL.BUDGET - drafter.spent, needCounts: need };
  d.currentTeam = engine.drawTeamForTurn(PLAYERS, drafted, new Set(Object.keys(need)), budget);
  d.deadline = Date.now() + TURN_SECONDS * 1000;
  scheduleAutoPick(room);
  broadcast(room);
}

function scheduleAutoPick(room) {
  clearTimeout(room.turnTimer);
  const drafter = playerByPid(room, room.draft.currentPid);
  const delay = drafter && drafter.connected ? TURN_SECONDS * 1000 : 1500;
  room.turnTimer = setTimeout(() => autoPick(room), delay);
}

function autoPick(room) {
  const d = room.draft;
  if (!d || !d.currentTeam) return;
  // Auto-pick : le meilleur éligible, sinon le moins cher encore libre.
  const pick = d.currentTeam.options.find((o) => o.eligible)
    || d.currentTeam.options.filter((o) => !o.taken).sort((a, b) => a.price - b.price)[0];
  if (pick) applyPick(room, d.currentPid, pick.id, true);
}

function applyPick(room, pid, playerId, auto) {
  const d = room.draft;
  if (!d || pid !== d.currentPid) return false;
  const drafter = playerByPid(room, pid);
  if (!drafter) return false;

  const option = d.currentTeam.options.find((o) => o.id === playerId);
  if ((!option || !option.eligible) && !auto) return false;
  if (draftedIds(room).has(playerId)) return false;

  drafter.squad.push(playerId);
  drafter.spent += MODEL.marketValue(PLAYERS[playerId]);
  broadcastPick(room, { pid, player: PLAYERS[playerId], auto: !!auto, from: d.currentTeam.country, price: MODEL.marketValue(PLAYERS[playerId]) });

  d.pickNum++;
  clearTimeout(room.turnTimer);
  if (d.pickNum >= d.order.length) finishDraft(room);
  else prepareTurn(room);
  return true;
}

// ---------------------------------------------------------------------------
// Tournoi (logique partagée dans engine.js) + diffusion match par match
// ---------------------------------------------------------------------------
function finishDraft(room) {
  clearTimeout(room.turnTimer);
  const teams = room.players.map((p) => {
    const sp = squadPlayers(room, p);
    const chem = MODEL.chemistry(sp, p.formationKey);
    return { id: p.pid, name: p.teamName || p.name, players: sp, bonus: chem.bonus, chem: chem.teamChem };
  });
  room.fullTournament = engine.runTournament(teams);
  // Diffusion en direct : chaque journée se joue en simultané (0' -> 90'),
  // on n'avance que quand tous les matchs de la journée sont terminés.
  room.phase = "playing";
  room.reveal = { roundIdx: 0, rounds: engine.buildRounds(room.fullTournament), startedAt: 0 };
  startRound(room);
}

function startRound(room) {
  room.reveal.startedAt = Date.now();
  clearTimeout(room.revealTimer);
  const cur = room.reveal.rounds[room.reveal.roundIdx];
  const maxGoals = Math.max(0, ...cur.matches.map((m) => (m.events || []).filter((e) => e.type === "goal").length));
  room.revealTimer = setTimeout(() => {
    room.reveal.roundIdx++;
    if (room.reveal.roundIdx >= room.reveal.rounds.length) finishReveal(room);
    else startRound(room);
  }, MATCH_MS + maxGoals * GOAL_HOLD_MS + PAUSE_MS);
  broadcast(room);
}

function finishReveal(room) {
  clearTimeout(room.revealTimer);
  room.phase = "results";
  room.tournament = room.fullTournament;
  broadcast(room);
}

// Remet la salle au salon (noms, maillots et formations conservés).
function resetRoom(room) {
  clearTimeout(room.turnTimer);
  clearTimeout(room.revealTimer);
  room.phase = "lobby";
  room.draft = null;
  room.tournament = null;
  room.fullTournament = null;
  room.reveal = null;
  room.players.forEach((pl) => { pl.squad = []; pl.spent = 0; });
  broadcast(room);
}

// ---------------------------------------------------------------------------
// Actions (POST /api)
// ---------------------------------------------------------------------------
const KIT_PALETTE = ["#e11d2a", "#1f6feb", "#12b886", "#f59f00", "#7048e8", "#111418", "#f1f3f5", "#e64980", "#0b7285", "#495057"];
const KIT_PATTERNS = ["plain", "stripes", "hoops", "sash", "halves"];

function joinRoomInternal(room, name) {
  const idx = room.players.length;
  const player = {
    pid: room.nextPid++,
    name: String(name || "Joueur").slice(0, 16),
    connected: false,
    squad: [],
    spent: 0,
    formationKey: "4-3-3",
    teamName: "",
    kit: { p: KIT_PALETTE[idx % KIT_PALETTE.length], s: "#ffffff", pat: "plain" },
  };
  room.players.push(player);
  return player;
}

const ACTIONS = {
  createRoom(msg) {
    const room = createRoom();
    const player = joinRoomInternal(room, msg.name || "Hôte");
    room.hostPid = player.pid;
    return { ok: true, code: room.code, pid: player.pid };
  },
  joinRoom(msg) {
    const code = (msg.code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return { ok: false, error: "Session introuvable." };
    if (room.phase !== "lobby") return { ok: false, error: "La partie a déjà commencé." };
    if (room.players.length >= 8) return { ok: false, error: "Session complète (8 max)." };
    const player = joinRoomInternal(room, msg.name);
    return { ok: true, code: room.code, pid: player.pid };
  },
  setFormation(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "lobby") return { ok: false };
    const player = playerByPid(room, msg.pid);
    if (!player) return { ok: false };
    if (MODEL.FORMATIONS[msg.formationKey] && MODEL.FORMATIONS[msg.formationKey].size === SQUAD_SIZE) {
      player.formationKey = msg.formationKey;
      broadcast(room);
    }
    return { ok: true };
  },
  setTeam(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "lobby") return { ok: false };
    const player = playerByPid(room, msg.pid);
    if (!player) return { ok: false };
    if (typeof msg.teamName === "string") player.teamName = msg.teamName.slice(0, 20);
    if (msg.kit && typeof msg.kit === "object") {
      const p = String(msg.kit.p || "").slice(0, 7);
      const s = String(msg.kit.s || "").slice(0, 7);
      const pat = KIT_PATTERNS.includes(msg.kit.pat) ? msg.kit.pat : "plain";
      if (/^#[0-9a-fA-F]{6}$/.test(p)) player.kit.p = p;
      if (/^#[0-9a-fA-F]{6}$/.test(s)) player.kit.s = s;
      player.kit.pat = pat;
    }
    broadcast(room);
    return { ok: true };
  },
  startGame(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "lobby" || msg.pid !== room.hostPid) return { ok: false };
    if (room.players.length < 2) return { ok: false, error: "Il faut au moins 2 joueurs." };
    startDraft(room);
    return { ok: true };
  },
  pick(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "draft") return { ok: false };
    applyPick(room, msg.pid, msg.playerId, false);
    return { ok: true };
  },
  playAgain(msg) {
    const room = rooms.get(msg.code);
    if (!room || msg.pid !== room.hostPid) return { ok: false };
    resetRoom(room);
    return { ok: true };
  },
  // Réinitialisation d'urgence : n'importe quel joueur de la salle peut
  // ramener tout le monde au salon (partie bloquée, hôte parti...).
  resetGame(msg) {
    const room = rooms.get(msg.code);
    if (!room || !playerByPid(room, msg.pid)) return { ok: false };
    resetRoom(room);
    return { ok: true };
  },
  // Relancer l'équipe tirée au sort (2 fois max par joueur et par draft).
  rerollTeam(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "draft" || !room.draft) return { ok: false };
    if (msg.pid !== room.draft.currentPid) return { ok: false };
    const drafter = playerByPid(room, msg.pid);
    if (!drafter || !(drafter.rerolls > 0)) return { ok: false, error: "Plus de relance disponible." };
    drafter.rerolls--;
    prepareTurn(room);
    return { ok: true };
  },
  // Quitter la session depuis le salon (l'hôte est transféré si besoin).
  leaveRoom(msg) {
    const room = rooms.get(msg.code);
    const player = room && playerByPid(room, msg.pid);
    if (!room || !player) return { ok: false };
    if (room.phase === "lobby") {
      room.players = room.players.filter((p) => p.pid !== msg.pid);
      const res = room.clients.get(msg.pid);
      if (res) { try { res.end(); } catch (_) {} room.clients.delete(msg.pid); }
      if (!room.players.length) { rooms.delete(room.code); return { ok: true }; }
      if (room.hostPid === msg.pid) room.hostPid = room.players[0].pid;
      broadcast(room);
    } else {
      player.connected = false; // en cours de partie : on le note absent
      broadcast(room);
    }
    return { ok: true };
  },
  skipReveal(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "playing" || msg.pid !== room.hostPid) return { ok: false };
    finishReveal(room);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Serveur HTTP
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      // Toujours revalider : les téléphones ne gardent pas d'anciennes versions.
      "Cache-Control": "no-cache, must-revalidate",
    });
    res.end(data);
  });
}

function handleEvents(req, res, query) {
  const room = rooms.get((query.code || "").toUpperCase());
  const pid = parseInt(query.pid, 10);
  const player = room && playerByPid(room, pid);
  if (!player) { res.writeHead(404); return res.end(); }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");

  player.connected = true;
  room.clients.set(pid, res);
  sendEvent(res, "state", snapshot(room));
  broadcast(room);

  // Si c'est son tour et qu'il vient (re)connecter, on laisse le temps normal.
  if (room.phase === "draft" && room.draft && room.draft.currentPid === pid) scheduleAutoPick(room);

  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (_) {} }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    if (room.clients.get(pid) === res) room.clients.delete(pid);
    player.connected = false;
    if (room.phase === "draft" && room.draft && room.draft.currentPid === pid) scheduleAutoPick(room);
    broadcast(room);
    // Nettoyage des salles totalement vides.
    setTimeout(() => {
      if (rooms.get(room.code) && room.players.every((p) => !p.connected)) rooms.delete(room.code);
    }, 5 * 60 * 1000);
  });
}

function handleApi(req, res) {
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1e5) req.destroy(); });
  req.on("end", () => {
    let msg;
    try { msg = JSON.parse(body || "{}"); } catch (_) { res.writeHead(400); return res.end("{}"); }
    const fn = ACTIONS[msg.type];
    if (process.env.DEBUG) console.log("[api]", msg.type, JSON.stringify(msg).slice(0, 120));
    const result = fn ? fn(msg) : { ok: false, error: "Action inconnue." };
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result || { ok: true }));
  });
}

const server = http.createServer((req, res) => {
  const [pathname, qs] = req.url.split("?");
  if (pathname === "/api" && req.method === "POST") return handleApi(req, res);
  if (pathname === "/events" && req.method === "GET") {
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    return handleEvents(req, res, query);
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => console.log(`⚽  Football Draft -> http://localhost:${PORT}`));
