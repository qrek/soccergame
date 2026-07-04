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
const TURN_SECONDS = 13;
const SQUAD_SIZE = 11;   // onze de départ
const DRAFT_PICKS = 13;  // 11 titulaires + 2 remplaçants (rotation/forme)
const MATCH_MS = parseInt(process.env.MATCH_MS, 10) || 44000;      // durée du direct d'une journée (0' -> 90')
const PAUSE_MS = parseInt(process.env.PAUSE_MS, 10) || 7000;       // pause score final avant la journée suivante
const GOAL_HOLD_MS = parseInt(process.env.GOAL_HOLD_MS, 10) || 3500; // l'horloge se fige sur chaque but (célébration)
const REROLLS = 2; // relances d'équipe par joueur pendant le draft
const PUBLIC_DIR = path.join(__dirname, "public");
const PALMARES_FILE = path.join(__dirname, "palmares.json");
const PALMARES = { data: {}, top: [] };
try { PALMARES.data = JSON.parse(fs.readFileSync(PALMARES_FILE, "utf8")); } catch (_) {}
function refreshPalmares() {
  PALMARES.top = Object.entries(PALMARES.data)
    .map(([name, v]) => ({ name, titles: v.titles || 0, finals: v.finals || 0 }))
    .sort((x, y) => y.titles - x.titles || y.finals - x.finals)
    .slice(0, 8);
}
refreshPalmares();
function recordPalmares(room) {
  const t = room.tournament;
  if (!t || !t.champion) return;
  const finale = t.knockout && t.knockout.rounds[t.knockout.rounds.length - 1];
  const add = (pid, field) => {
    const pl = playerByPid(room, pid);
    if (!pl) return;
    const rec = PALMARES.data[pl.name] || { titles: 0, finals: 0 };
    rec[field]++;
    PALMARES.data[pl.name] = rec;
  };
  add(t.champion.id, "titles");
  if (finale && finale[0]) add(finale[0].a === t.champion.id ? finale[0].b : finale[0].a, "finals");
  refreshPalmares();
  fs.writeFile(PALMARES_FILE, JSON.stringify(PALMARES.data), () => {});
}

// ---------------------------------------------------------------------------
// Salles
// ---------------------------------------------------------------------------
const rooms = new Map();

// Thèmes de draft : filtre du vivier de joueurs.
const THEMES = {
  all:    { label: "Toutes époques", filter: () => true },
  retro:  { label: "Rétro (≤ 1980s)", filter: (p) => ["1950s", "1960s", "1970s", "1980s"].indexOf(p.d) >= 0 },
  modern: { label: "Moderne (≥ 2000s)", filter: (p) => ["2000s", "2010s", "2020s"].indexOf(p.d) >= 0 },
  onestar:{ label: "Une seule 91+", filter: () => true },
};
function themePool(room) {
  const th = THEMES[room.theme] || THEMES.all;
  return PLAYERS.filter(th.filter);
}

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
    theme: "all",
    mode: "snake", // snake | auction
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
// Tableau du tournoi pendant la diffusion : tours KO joués (scores figés),
// tour en cours SANS score (pas de spoiler), paires du prochain tour si connues.
function buildBracket(room, cur) {
  const t = room.tstate;
  if (!t) return null;
  const rounds = t.koRounds.map((r) => r.map((m) => cur && cur.matches.indexOf(m) >= 0
    ? { a: m.a, b: m.b, live: true }
    : { a: m.a, b: m.b, ga: m.ga, gb: m.gb, winner: m.winner, pens: m.pens || null }));
  // koPairs pointe encore sur le tour en cours tant qu'il n'est pas soldé :
  // on ne l'expose comme "à venir" que s'il s'agit bien d'un tour futur.
  let next = null;
  if (t.koPairs && t.koPairs.length) {
    const last = t.koRounds[t.koRounds.length - 1];
    const same = last && last.length === t.koPairs.length && last.every((m, i) => m.a === t.koPairs[i][0] && m.b === t.koPairs[i][1]);
    if (!same) next = t.koPairs.map(([a, b]) => [a, b]);
  }
  return {
    koSize: t.koSize,
    leagueRounds: t.leagueRounds.length,
    leaguePlayed: Math.min(t.stageNum, t.leagueRounds.length),
    koStage: t.koStage,
    rounds, next,
    champion: t.champion != null ? t.champion : null,
  };
}

function snapshot(room) {
  const players = room.players.map((p) => {
    const t0 = room.tstate;
    const sp = squadPlayers(room, p).map((pl) => Object.assign({}, pl, {
      fat: t0 ? (t0.fatigue[pl.id] || 0) : 0,
      susp: t0 ? (t0.suspended[pl.id] || 0) > 0 : false,
    }));
    const chem = MODEL.chemistry(sp, p.formationKey);
    return {
      pid: p.pid,
      name: p.name,
      connected: p.connected,
      isHost: p.pid === room.hostPid,
      formationKey: p.formationKey,
      penTaker: p.penTaker != null ? p.penTaker : null,
      teamName: p.teamName || p.name,
      kit: p.kit,
      squad: sp,
      squadCount: sp.length,
      strength: engine.teamStrength(MODEL.placeInSlots(sp, p.formationKey).filter((x) => x.player).map((x) => x.player)),
      chem: chem.teamChem,
      chemBonus: chem.bonus,
    };
  });

  const snap = {
    code: room.code,
    phase: room.phase,
    now: Date.now(), // horloge serveur : le client corrige son propre décalage
    hostPid: room.hostPid,
    squadSize: room.squadSize,
    theme: room.theme,
    mode: room.mode,
    palmares: PALMARES.top,
    players,
  };

  if (room.phase === "draft" && room.mode === "auction" && room.auction && room.auction.current) {
    const cur = room.auction.current;
    const pl = PLAYERS[cur.playerId];
    snap.draft = {
      auction: true,
      totalPicks: DRAFT_PICKS * room.players.length,
      pickNum: room.players.reduce((u, p) => u + p.squad.length, 0) + 1,
      player: Object.assign({}, pl, { price: MODEL.marketValue(pl) }),
      price: cur.price,
      nextPrice: nextBidPrice(cur),
      bestPid: cur.bestPid,
      bestName: cur.bestPid != null ? (playerByPid(room, cur.bestPid) || {}).teamName || (playerByPid(room, cur.bestPid) || {}).name : null,
      deadline: cur.deadline,
      budget: MODEL.BUDGET,
    };
  }
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
      order: d.order.slice(0, room.players.length),
    };
  }

  if (room.phase === "playing" && room.reveal && room.reveal.current) {
    const cur = room.reveal.current;
    snap.playing = {
      round: room.reveal.idx,
      totalRounds: room.tstate.totalRounds,
      stage: cur.stage,
      type: cur.type,
      matches: cur.matches.map(engine.publicMatch),
      startedAt: room.reveal.startedAt,
      clockMs: MATCH_MS,
      goalHoldMs: GOAL_HOLD_MS,
      penHoldMs: PEN_LIVE_MS,
      // matchs de championnat des journées PRÉCÉDENTES (classement live)
      playedMatches: room.tstate.playedLeague
        .filter((m) => cur.matches.indexOf(m) < 0)
        .map((m) => ({ a: m.a, b: m.b, ga: m.ga, gb: m.gb })),
      // tableau du tournoi : poule + arbre KO (le tour en cours est masqué)
      bracket: buildBracket(room, cur),
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
const AUCTION_FIRST_MS = parseInt(process.env.AUCTION_FIRST_MS, 10) || 9000; // temps après mise à prix
const AUCTION_BID_MS = parseInt(process.env.AUCTION_BID_MS, 10) || 6000;   // temps relancé après chaque enchère

function auctionFits(room, player, pl) {
  if (player.squad.length >= DRAFT_PICKS) return false;
  const need = neededPositions(room, player);
  const needTotal = Object.values(need).reduce((u, v) => u + v, 0);
  const benchFree = DRAFT_PICKS - player.squad.length - needTotal > 0;
  if (!(need[pl.pos] > 0 || benchFree)) return false;
  if (room.theme === "onestar" && pl.r >= 91 && squadPlayers(room, player).some((x) => x.r >= 91)) return false;
  return true;
}
function auctionMaxBid(room, player) {
  // réserve : ~2,5 M€ par place restante après celle-ci
  const slotsAfter = DRAFT_PICKS - player.squad.length - 1;
  return MODEL.BUDGET - player.spent - slotsAfter * 2.5;
}
function nextBidPrice(cur) {
  return cur.bestPid == null ? cur.price : Math.round((cur.price + Math.max(2, cur.price * 0.12)) * 2) / 2;
}
function startAuction(room) {
  const pool = themePool(room).slice().sort((x, y) =>
    (MODEL.marketValue(y) + Math.random() * 18) - (MODEL.marketValue(x) + Math.random() * 18));
  room.auction = { pool, idx: 0, current: null, timer: null };
  nextLot(room);
}
function nextLot(room) {
  const a = room.auction;
  clearTimeout(a.timer);
  if (room.players.every((p) => p.squad.length >= DRAFT_PICKS)) return finishDraft(room);
  while (a.idx < a.pool.length) {
    const pl = a.pool[a.idx++];
    if (draftedIds(room).has(pl.id)) continue;
    const eligible = room.players.some((p) => auctionFits(room, p, pl) && MODEL.marketValue(pl) * 0.5 <= auctionMaxBid(room, p));
    if (!eligible) continue;
    a.current = { playerId: pl.id, price: Math.max(1, Math.round(MODEL.marketValue(pl) * 0.5 * 2) / 2), bestPid: null, deadline: Date.now() + AUCTION_FIRST_MS };
    a.timer = setTimeout(() => resolveLot(room), AUCTION_FIRST_MS);
    broadcast(room);
    return;
  }
  // vivier épuisé : compléter au moins cher, gratuitement
  for (const p of room.players) {
    while (p.squad.length < DRAFT_PICKS) {
      const need = neededPositions(room, p);
      const rest = themePool(room).filter((x) => !draftedIds(room).has(x.id));
      // d'abord un joueur du poste manquant, sinon n'importe qui (pick "hors poste")
      const pool2 = rest.filter((x) => need[x.pos] > 0 || Object.keys(need).length === 0);
      const cheap = (pool2.length ? pool2 : rest).sort((x, y) => MODEL.marketValue(x) - MODEL.marketValue(y))[0];
      if (!cheap) break;
      p.squad.push(cheap.id);
    }
  }
  finishDraft(room);
}
function resolveLot(room) {
  const a = room.auction;
  const cur = a.current;
  if (!cur) return;
  if (cur.bestPid != null) {
    const winner = playerByPid(room, cur.bestPid);
    winner.squad.push(cur.playerId);
    winner.spent += cur.price;
    broadcastPick(room, { pid: cur.bestPid, player: PLAYERS[cur.playerId], auto: false, from: "enchères", price: cur.price });
  }
  a.current = null;
  nextLot(room);
}

function startDraft(room) {
  room.phase = "draft";
  room.players.forEach((p) => { p.squad = []; p.spent = 0; p.rerolls = REROLLS; p.penTaker = null; });
  if (room.mode === "auction") return startAuction(room);
  // Tirage au sort de l'ordre de passage (serpentin ensuite).
  const pids = room.players.map((p) => p.pid);
  for (let i = pids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pids[i], pids[j]] = [pids[j], pids[i]];
  }
  const order = [];
  for (let r = 0; r < DRAFT_PICKS; r++) {
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
  const budget = { left: MODEL.BUDGET - drafter.spent, needCounts: need, slotsLeft: DRAFT_PICKS - drafter.squad.length };
  let pool = themePool(room);
  if (room.theme === "onestar" && squadPlayers(room, drafter).some((p) => p.r >= 91)) {
    pool = pool.filter((p) => p.r < 91);
  }
  d.currentTeam = engine.drawTeamForTurn(pool, drafted, new Set(Object.keys(need)), budget);
  d.deadline = Date.now() + TURN_SECONDS * 1000;
  scheduleAutoPick(room);
  broadcast(room);
}

function scheduleAutoPick(room) {
  clearTimeout(room.turnTimer);
  // Toujours le chrono complet : une connexion coupée (écran verrouillé,
  // changement d'app) ne doit JAMAIS voler le pick d'un joueur.
  room.turnTimer = setTimeout(() => autoPick(room), TURN_SECONDS * 1000);
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
  const teams = room.players.map((p) => ({
    id: p.pid, name: p.teamName || p.name,
    players: squadPlayers(room, p),
    formationKey: p.formationKey,
    penTaker: p.penTaker != null ? p.penTaker : null,
  }));
  // Simulation PROGRESSIVE : chaque journée est jouée à son coup d'envoi
  // (forme, rotation, suspensions et instructions du match en dépendent).
  room.tstate = engine.createTournament(teams);
  room.phase = "playing";
  room.reveal = { idx: 0, current: null, startedAt: 0 };
  startRound(room);
}

const PEN_INPUT_MS = parseInt(process.env.PEN_INPUT_MS, 10) || 12000; // temps pour choisir tir/plongeon
const PEN_REVEAL_MS = parseInt(process.env.PEN_REVEAL_MS, 10) || 2600;  // suspense entre deux tirs
// Penalty en cours de match : fenêtre de choix + révélation (l'horloge du
// match reste figée sur la faute pendant toute la fenêtre).
const PEN_LIVE_INPUT_MS = parseInt(process.env.PEN_LIVE_INPUT_MS, 10) || 9000;
const PEN_LIVE_REVEAL_MS = parseInt(process.env.PEN_LIVE_REVEAL_MS, 10) || 3500;
const PEN_LIVE_MS = PEN_LIVE_INPUT_MS + PEN_LIVE_REVEAL_MS;

function startRound(room) {
  clearTimeout(room.revealTimer);
  const round = engine.playNextRound(room.tstate);
  if (!round) return finishReveal(room);
  room.reveal.current = round;
  room.reveal.idx++;
  room.reveal.startedAt = Date.now();
  // Penalties en cours de match : chaque coup de sifflet devient une fenêtre
  // interactive (le résultat pré-simulé sera re-décidé par les managers).
  round.matches.forEach((m) => {
    (m.events || []).forEach((ev) => { if (ev.pen) ev.pending = true; });
    schedulePens(room, m);
  });
  scheduleRoundEnd(room, round);
  broadcast(room);
}

// Durée totale du direct d'un match : temps de jeu + gels (buts, penalties).
function matchPlayMs(m) {
  const freezes = engine.freezesOf(m, GOAL_HOLD_MS, PEN_LIVE_MS);
  return Math.round((MATCH_MS * (m.dur || 90)) / 90) + freezes.reduce((s, f) => s + f.len, 0);
}

// (Re)programme la fin de journée : les fenêtres de penalty et les
// prolongations peuvent changer en cours de route.
function scheduleRoundEnd(room, round) {
  clearTimeout(room.revealTimer);
  const playMs = Math.max(0, ...round.matches.map(matchPlayMs));
  const delay = Math.max(0, room.reveal.startedAt + playMs - Date.now());
  room.revealTimer = setTimeout(() => endOfRound(room, round), delay);
}

function endOfRound(room, round) {
  const tied = round.type === "ko" ? round.matches.filter((m) => m.ga === m.gb && m.winner == null) : [];
  if (tied.length) {
    tied.forEach((m) => buildShootout(room, m)); // séance interactive
  } else {
    room.revealTimer = setTimeout(() => advanceAfterRound(room, round), PAUSE_MS);
  }
}

// ---- Penalties en direct : fenêtre d'input pendant le match ----
// Instant (ms depuis le coup d'envoi) où démarre la fenêtre d'un penalty.
function penStartMs(m, ev) {
  let holds = 0;
  for (const f of engine.freezesOf(m, GOAL_HOLD_MS, PEN_LIVE_MS)) {
    const tg = (f.m / 90) * MATCH_MS + holds;
    if (f.ev === ev) return tg;
    holds += f.len;
  }
  return null;
}

function clearPenTimers(m) {
  (m._lpTimers || []).forEach(clearTimeout);
  m._lpTimers = [];
}

function schedulePens(room, m) {
  clearPenTimers(m);
  for (const ev of m.events || []) {
    if (!ev.pen || !ev.pending) continue;
    const tW = penStartMs(m, ev);
    if (tW == null) continue;
    const delay = Math.max(0, room.reveal.startedAt + tW - Date.now());
    m._lpTimers.push(setTimeout(() => armLivePen(room, m, ev, tW), delay));
  }
}

function armLivePen(room, m, ev, tW) {
  m.livePen = { m: ev.m, side: ev.side, scorer: ev.scorer, gkName: ev.gkName, ev,
    phase: "await", pending: { shot: null, dive: null },
    deadline: room.reveal.startedAt + tW + PEN_LIVE_INPUT_MS, endAt: room.reveal.startedAt + tW + PEN_LIVE_MS };
  if (!m._lprng) m._lprng = engine.makeRng(engine.seedFor(m.a, m.b, m.salt) ^ 0x11f2a7);
  m._lpTimers.push(setTimeout(() => resolveLivePen(room, m), Math.max(0, m.livePen.deadline - Date.now())));
  broadcast(room);
}

function resolveLivePen(room, m) {
  const lp = m.livePen;
  if (!lp || lp.phase !== "await") return;
  const ev = lp.ev;
  const dirs = ["L", "C", "R"];
  const shot = lp.pending.shot || dirs[Math.floor(m._lprng() * 3)];
  const dive = lp.pending.dive || dirs[Math.floor(m._lprng() * 3)];
  const defTeam = ev.side === "a" ? m._tb : m._ta;
  const gk = defTeam.players.find((p) => p.pos === "GK") || defTeam.players[0];
  const scored = engine.resolvePenalty(shot, dive, ev.sho, gk.r, m._lprng());
  // Le choix des managers REMPLACE l'issue pré-simulée.
  ev.type = scored ? "goal" : (shot === dive ? "saved" : "off");
  ev.text = engine.commentary(ev);
  delete ev.pending;
  ev.lpDone = true;
  lp.phase = "reveal"; lp.dir = shot; lp.dive = dive; lp.out = ev.type;
  // Score recalculé depuis les évènements (les penalties en attente ne comptent pas).
  const recount = () => {
    m.ga = (m.events || []).filter((e) => e.type === "goal" && e.side === "a").length;
    m.gb = (m.events || []).filter((e) => e.type === "goal" && e.side === "b").length;
  };
  recount();
  // En KO, la prolongation dépend du score à la 90e : on la recalcule si le
  // penalty a eu lieu dans le temps réglementaire.
  if (m.ko && ev.m <= 90) {
    m.events = (m.events || []).filter((e) => e.m <= 90);
    m.dur = 90;
    recount();
    if (m.ga === m.gb) {
      engine.extraTime(m, engine.seedFor(m.a, m.b, m.salt));
      engine.retagPenalties(m);
      (m.events || []).forEach((e) => { if (e.pen && e.m > 90 && !e.lpDone) e.pending = true; });
    }
  }
  // Fin de la fenêtre : on efface le panneau puis on reprogramme la suite
  // (nouveaux penalties de prolongation éventuels, fin de journée décalée).
  m._lpTimers.push(setTimeout(() => {
    m.livePen = null;
    schedulePens(room, m);
    if (room.reveal && room.reveal.current) scheduleRoundEnd(room, room.reveal.current);
    broadcast(room);
  }, Math.max(0, lp.endAt - Date.now())));
  broadcast(room);
}

// Purge les fenêtres de penalty (skip, reset, fin de partie).
function clearLivePens(room) {
  if (!room.reveal || !room.reveal.current) return;
  room.reveal.current.matches.forEach((m) => {
    clearPenTimers(m);
    m.livePen = null;
    (m.events || []).forEach((ev) => { delete ev.pending; });
  });
}

function advanceAfterRound(room, round) {
  engine.settleRound(room.tstate, round);
  if (room.tstate.done) finishReveal(room);
  else startRound(room);
}

// ---- Séance de tirs au but : chaque tir attend les choix des deux managers
function buildShootout(room, m) {
  const mk = (side) => {
    const pid = side === "a" ? m.a : m.b;
    const rp = playerByPid(room, pid);
    const team = side === "a" ? m._ta : m._tb;
    const ks = team.players.filter((p) => p.pos !== "GK").sort((u, v) => engine.shoOf(v) - engine.shoOf(u)).slice(0, 8);
    if (rp && rp.penTaker != null) {
      const i = ks.findIndex((p) => p.id === rp.penTaker);
      if (i > 0) ks.unshift(ks.splice(i, 1)[0]);
    }
    return ks;
  };
  const gk = (side) => { const t = side === "a" ? m._ta : m._tb; return t.players.find((p) => p.pos === "GK") || t.players[0]; };
  m.shootout = {
    pa: 0, pb: 0, kicks: [], turn: 0, phase: "await", done: false,
    _ka: mk("a"), _kb: mk("b"), _gka: gk("a"), _gkb: gk("b"),
    pending: { shot: null, dive: null }, kicker: null, deadline: 0,
    _rng: engine.makeRng(engine.seedFor(m.a, m.b, m.salt) ^ 0x7e7e7e7),
  };
  armKick(room, m);
}

function armKick(room, m) {
  const so = m.shootout;
  const side = so.turn % 2 === 0 ? "a" : "b";
  const ks = side === "a" ? so._ka : so._kb;
  const kp = ks[Math.floor(so.turn / 2) % ks.length];
  so.kicker = { side, name: kp.n, sho: engine.shoOf(kp) };
  so.phase = "await";
  so.pending = { shot: null, dive: null };
  so.deadline = Date.now() + PEN_INPUT_MS;
  clearTimeout(so._timer);
  so._timer = setTimeout(() => resolveKick(room, m), PEN_INPUT_MS);
  broadcast(room);
}

function resolveKick(room, m) {
  const so = m.shootout;
  if (!so || so.done || so.phase !== "await") return;
  clearTimeout(so._timer);
  const dirs = ["L", "C", "R"];
  const shot = so.pending.shot || dirs[Math.floor(so._rng() * 3)];
  const dive = so.pending.dive || dirs[Math.floor(so._rng() * 3)];
  const gk = so.kicker.side === "a" ? so._gkb : so._gka;
  const scored = engine.resolvePenalty(shot, dive, so.kicker.sho, gk.r, so._rng());
  if (scored) { if (so.kicker.side === "a") so.pa++; else so.pb++; }
  so.kicks.push({ side: so.kicker.side, name: so.kicker.name, dir: shot, dive, scored });
  so.turn++;
  so.phase = "reveal";
  const ta = so.kicks.filter((k) => k.side === "a").length;
  const tb = so.kicks.filter((k) => k.side === "b").length;
  let done = false;
  if (tb <= 5 && so.pa > so.pb + (5 - tb)) done = true;
  if (ta <= 5 && so.pb > so.pa + (5 - ta)) done = true;
  if (ta >= 5 && tb >= 5 && ta === tb && so.pa !== so.pb) done = true;
  if (done) {
    so.done = true;
    m.pens = { pa: so.pa, pb: so.pb };
    m.winner = so.pa > so.pb ? m.a : m.b;
    broadcast(room);
    const round = room.reveal.current;
    if (!round.matches.some((x) => x.ga === x.gb && (!x.shootout || !x.shootout.done))) {
      room.revealTimer = setTimeout(() => advanceAfterRound(room, round), PAUSE_MS);
    }
  } else {
    broadcast(room);
    so._timer = setTimeout(() => armKick(room, m), PEN_REVEAL_MS);
  }
}

function finishReveal(room) {
  clearTimeout(room.revealTimer);
  clearLivePens(room);
  if (room.reveal && room.reveal.current) room.reveal.current.matches.forEach((m) => { if (m.shootout) clearTimeout(m.shootout._timer); });
  // au cas où on saute la diffusion : terminer le tournoi d'un coup
  if (room.tstate && !room.tstate.done) {
    if (room.reveal && room.reveal.current) engine.settleRound(room.tstate, room.reveal.current);
    let r;
    while (!room.tstate.done && (r = engine.playNextRound(room.tstate))) engine.settleRound(room.tstate, r);
  }
  room.phase = "results";
  room.tournament = engine.finalizeTournament(room.tstate);
  recordPalmares(room);
  broadcast(room);
}

// Remet la salle au salon (noms, maillots et formations conservés).
function resetRoom(room) {
  clearTimeout(room.turnTimer);
  clearTimeout(room.revealTimer);
  if (room.auction) clearTimeout(room.auction.timer);
  room.auction = null;
  clearLivePens(room);
  if (room.reveal && room.reveal.current) room.reveal.current.matches.forEach((m) => { if (m.shootout) clearTimeout(m.shootout._timer); });
  room.phase = "lobby";
  room.draft = null;
  room.tournament = null;
  room.tstate = null;
  room.reveal = null;
  room.players.forEach((pl) => { pl.squad = []; pl.spent = 0; });
  broadcast(room);
}

// Choix de tir / plongeon pendant une séance de tirs au but.
function penInput(msg, kind) {
  const room = rooms.get(msg.code);
  if (!room || room.phase !== "playing" || !room.reveal || !room.reveal.current) return { ok: false };
  if (["L", "C", "R"].indexOf(msg.dir) < 0) return { ok: false };
  // 1) penalty en cours de match (fenêtre live)
  const mp = room.reveal.current.matches.find((x) => x.livePen && x.livePen.phase === "await"
    && (kind === "shot"
      ? (x.livePen.side === "a" ? x.a : x.b) === msg.pid
      : (x.livePen.side === "a" ? x.b : x.a) === msg.pid));
  if (mp) {
    mp.livePen.pending[kind] = msg.dir;
    if (mp.livePen.pending.shot && mp.livePen.pending.dive) resolveLivePen(room, mp);
    return { ok: true };
  }
  // 2) séance de tirs au but
  const m = room.reveal.current.matches.find((x) => x.shootout && !x.shootout.done && x.shootout.phase === "await"
    && (kind === "shot"
      ? (x.shootout.kicker.side === "a" ? x.a : x.b) === msg.pid
      : (x.shootout.kicker.side === "a" ? x.b : x.a) === msg.pid));
  if (!m) return { ok: false, error: "Pas de tir en attente pour toi." };
  m.shootout.pending[kind] = msg.dir;
  if (m.shootout.pending.shot && m.shootout.pending.dive) resolveKick(room, m);
  return { ok: true };
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
    if (themePool(room).length < room.players.length * DRAFT_PICKS) {
      const maxN = Math.floor(themePool(room).length / DRAFT_PICKS);
      return { ok: false, error: `Vivier trop petit pour ce thème : ${maxN} managers max.` };
    }
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
  bid(msg) {
    const room = rooms.get(msg.code);
    const player = room && playerByPid(room, msg.pid);
    if (!room || !player || room.phase !== "draft" || room.mode !== "auction" || !room.auction || !room.auction.current) return { ok: false };
    const cur = room.auction.current;
    if (cur.bestPid === msg.pid) return { ok: false, error: "Tu es déjà le mieux offrant." };
    const pl = PLAYERS[cur.playerId];
    if (!auctionFits(room, player, pl)) return { ok: false, error: "Ne rentre pas dans ton effectif." };
    const price = nextBidPrice(cur);
    if (price > auctionMaxBid(room, player)) return { ok: false, error: "Au-dessus de tes moyens (réserve comprise)." };
    cur.price = price;
    cur.bestPid = msg.pid;
    cur.deadline = Date.now() + AUCTION_BID_MS;
    clearTimeout(room.auction.timer);
    room.auction.timer = setTimeout(() => resolveLot(room), AUCTION_BID_MS);
    broadcast(room);
    return { ok: true };
  },
  penKick(msg) { return penInput(msg, "shot"); },
  penDive(msg) { return penInput(msg, "dive"); },
  setTheme(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "lobby" || msg.pid !== room.hostPid || !THEMES[msg.theme]) return { ok: false };
    room.theme = msg.theme;
    broadcast(room);
    return { ok: true };
  },
  setMode(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "lobby" || msg.pid !== room.hostPid || ["snake", "auction"].indexOf(msg.mode) < 0) return { ok: false };
    room.mode = msg.mode;
    broadcast(room);
    return { ok: true };
  },
  // 3. Tireur de penalty désigné (utilisé pour les pens du match + 1er tireur TAB)
  setPenTaker(msg) {
    const room = rooms.get(msg.code);
    const player = room && playerByPid(room, msg.pid);
    if (!player) return { ok: false };
    const pl = PLAYERS[msg.playerId];
    if (!pl || player.squad.indexOf(msg.playerId) < 0 || pl.pos === "GK") return { ok: false };
    player.penTaker = msg.playerId;
    broadcast(room);
    return { ok: true };
  },
  // Instruction tactique pendant SON match (max 3 par match, impact <= 6 %).
  setInstruction(msg) {
    const room = rooms.get(msg.code);
    if (!room || room.phase !== "playing" || !room.reveal || !room.reveal.current) return { ok: false };
    const stance = ["off", "bal", "def"].indexOf(msg.stance) >= 0 ? msg.stance : "bal";
    const m = room.reveal.current.matches.find((x) => x.a === msg.pid || x.b === msg.pid);
    if (!m) return { ok: false, error: "Pas de match en cours." };
    const uses = (m.instr && m.instr[msg.pid]) || 0;
    if (uses >= 3) return { ok: false, error: "Plus d'instruction disponible (3 max)." };
    if (m.livePen) return { ok: false, error: "Attends la fin du penalty !" };
    // minute courante (horloge + gels : célébrations et fenêtres de penalty)
    const elapsed = Date.now() - room.reveal.startedAt;
    let holds = 0, minute = null;
    for (const f of engine.freezesOf(m, GOAL_HOLD_MS, PEN_LIVE_MS)) {
      const tg = (f.m / 90) * MATCH_MS + holds;
      if (elapsed < tg) break;
      if (elapsed < tg + f.len) { minute = f.m; break; }
      holds += f.len;
    }
    if (minute === null) minute = Math.min(90, Math.floor(((elapsed - holds) / MATCH_MS) * 90));
    if (minute >= 85) return { ok: false, error: "Trop tard pour changer de tactique." };
    m.instr[msg.pid] = uses + 1;
    engine.applyInstruction(m, m.a === msg.pid ? "a" : "b", stance, minute);
    // la re-simulation a pu créer/déplacer des penalties : on remet à plat
    (m.events || []).forEach((ev) => { if (ev.pen && ev.m > minute && !ev.lpDone) ev.pending = true; });
    schedulePens(room, m);
    scheduleRoundEnd(room, room.reveal.current);
    broadcast(room);
    return { ok: true, stance };
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
