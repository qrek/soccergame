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
const engine = require("./game/engine");

const RAW_PLAYERS = require("./public/data/players.js");
const PLAYERS = RAW_PLAYERS.map((p, i) => ({ id: i, ...p }));

const PORT = process.env.PORT || 3000;
const TURN_SECONDS = 45;
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
    players: [],       // { pid, name, connected, squad: [] }
    clients: new Map(), // pid -> res (flux SSE)
    nextPid: 1,
    hostPid: null,
    squadSize: 11,
    formation: engine.formationFor(11),
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
  const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  squadPlayers(room, player).forEach((p) => have[p.pos]++);
  const need = {};
  for (const pos of ["GK", "DEF", "MID", "FWD"]) {
    const rem = room.formation[pos] - have[pos];
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
    return {
      pid: p.pid,
      name: p.name,
      connected: p.connected,
      isHost: p.pid === room.hostPid,
      squad: sp,
      squadCount: sp.length,
      strength: engine.teamStrength(sp),
    };
  });

  const snap = {
    code: room.code,
    phase: room.phase,
    hostPid: room.hostPid,
    squadSize: room.squadSize,
    formation: room.formation,
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
  room.players.forEach((p) => (p.squad = []));
  const pids = room.players.map((p) => p.pid);
  const order = [];
  for (let r = 0; r < room.squadSize; r++) {
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
  const neededPos = new Set(Object.keys(need));

  const byCountry = new Map();
  for (const p of PLAYERS) {
    if (drafted.has(p.id)) continue;
    if (!byCountry.has(p.c)) byCountry.set(p.c, []);
    byCountry.get(p.c).push(p);
  }

  let candidates = [...byCountry.entries()].filter(([, list]) => list.some((p) => neededPos.has(p.pos)));
  let relaxed = false;
  if (candidates.length === 0) {
    candidates = [...byCountry.entries()].filter(([, list]) => list.length > 0);
    relaxed = true;
  }

  const [country, list] = candidates[Math.floor(Math.random() * candidates.length)];
  const options = list
    .map((p) => ({ ...p, eligible: relaxed || neededPos.has(p.pos) }))
    .sort((a, b) => b.r - a.r);

  d.currentTeam = { country, code: list[0].code, options, relaxed };
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
  const pick = d.currentTeam.options.find((o) => o.eligible) || d.currentTeam.options[0];
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
  broadcastPick(room, { pid, player: PLAYERS[playerId], auto: !!auto, from: d.currentTeam.country });

  d.pickNum++;
  clearTimeout(room.turnTimer);
  if (d.pickNum >= d.order.length) finishDraft(room);
  else prepareTurn(room);
  return true;
}

// ---------------------------------------------------------------------------
// Tournoi
// ---------------------------------------------------------------------------
const seedFor = (a, b, salt) => ((a * 73856093) ^ (b * 19349663) ^ (salt * 83492791)) >>> 0;

function finishDraft(room) {
  room.phase = "results";
  clearTimeout(room.turnTimer);

  const teams = room.players.map((p) => ({ id: p.pid, name: p.name, players: squadPlayers(room, p) }));
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));

  const rounds = engine.roundRobin(teams.map((t) => t.id));
  const matches = [];
  rounds.forEach((round, ri) => {
    round.forEach(([a, b]) => {
      const res = engine.simulateMatch(teamById[a], teamById[b], seedFor(a, b, ri + 1));
      matches.push({ a, b, ga: res.ga, gb: res.gb, round: ri + 1 });
    });
  });
  const standings = engine.computeStandings(teams, matches);

  const N = teams.length;
  const K = N >= 8 ? 8 : N >= 4 ? 4 : N >= 2 ? 2 : 0;
  const knockout = buildKnockout(standings, teamById, K);

  room.tournament = {
    standings: standings.map((s) => ({ ...s, name: teamById[s.id].name })),
    matches: matches.map((m) => ({ ...m, an: teamById[m.a].name, bn: teamById[m.b].name })),
    knockout,
    champion: knockout ? knockout.champion :
      (standings[0] ? { id: standings[0].id, name: teamById[standings[0].id].name } : null),
  };
  broadcast(room);
}

function buildKnockout(standings, teamById, K) {
  if (K < 2) return null;
  const seeds = standings.slice(0, K).map((s) => s.id);
  const nameOf = (id) => teamById[id].name;
  const pairMaps = { 2: [[0, 1]], 4: [[0, 3], [1, 2]], 8: [[0, 7], [3, 4], [1, 6], [2, 5]] };

  let current = pairMaps[K].map(([i, j]) => [seeds[i], seeds[j]]);
  const roundsOut = [];
  let salt = 100;
  while (current.length >= 1) {
    const roundMatches = [];
    const winners = [];
    for (const [a, b] of current) {
      const res = engine.simulateKnockout(teamById[a], teamById[b], seedFor(a, b, salt++));
      roundMatches.push({ a, b, an: nameOf(a), bn: nameOf(b), ga: res.ga, gb: res.gb, pens: res.pens, winner: res.winner });
      winners.push(res.winner);
    }
    roundsOut.push(roundMatches);
    if (winners.length === 1) return { rounds: roundsOut, champion: { id: winners[0], name: nameOf(winners[0]) } };
    current = [];
    for (let i = 0; i < winners.length; i += 2) current.push([winners[i], winners[i + 1]]);
  }
  return { rounds: roundsOut, champion: null };
}

// ---------------------------------------------------------------------------
// Actions (POST /api)
// ---------------------------------------------------------------------------
function joinRoomInternal(room, name) {
  const player = { pid: room.nextPid++, name: String(name || "Joueur").slice(0, 16), connected: false, squad: [] };
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
  setSquadSize(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "lobby" || msg.pid !== room.hostPid) return { ok: false };
    if (engine.FORMATIONS[msg.size]) {
      room.squadSize = msg.size;
      room.formation = engine.formationFor(msg.size);
      broadcast(room);
    }
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
    room.phase = "lobby";
    room.draft = null;
    room.tournament = null;
    room.players.forEach((pl) => (pl.squad = []));
    broadcast(room);
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
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
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
