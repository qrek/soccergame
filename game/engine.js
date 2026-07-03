/*
 * Moteur de jeu : formations, force des équipes, simulation de matchs,
 * championnat (round-robin) et phases finales (élimination directe).
 * Utilisé côté serveur (autorité) — logique déterministe et testable.
 */

// Formations selon la taille d'effectif choisie par l'hôte.
const FORMATIONS = {
  5:  { GK: 1, DEF: 2, MID: 1, FWD: 1 },
  7:  { GK: 1, DEF: 2, MID: 2, FWD: 2 },
  9:  { GK: 1, DEF: 3, MID: 3, FWD: 2 },
  11: { GK: 1, DEF: 4, MID: 3, FWD: 3 },
};

function formationFor(size) {
  return FORMATIONS[size] || FORMATIONS[11];
}

// Somme des slots -> nombre de joueurs à drafter.
function squadSizeFromFormation(f) {
  return f.GK + f.DEF + f.MID + f.FWD;
}

// Force d'une équipe à partir des joueurs draftés.
// Retourne overall (moyenne), attaque et défense pondérées par poste.
function teamStrength(players) {
  if (!players.length) return { overall: 0, atk: 0, def: 0 };
  const avg = (arr) => arr.length ? arr.reduce((s, p) => s + p.r, 0) / arr.length : 0;
  const gk = players.filter((p) => p.pos === "GK");
  const def = players.filter((p) => p.pos === "DEF");
  const mid = players.filter((p) => p.pos === "MID");
  const fwd = players.filter((p) => p.pos === "FWD");

  const overall = Math.round(avg(players));
  // Attaque : attaquants (55%) + milieux (35%) + le reste (10%).
  const atk = Math.round(avg(fwd) * 0.55 + avg(mid) * 0.35 + overall * 0.10);
  // Défense : gardien (35%) + défenseurs (45%) + milieux (20%).
  const dfn = Math.round(avg(gk) * 0.35 + avg(def) * 0.45 + avg(mid) * 0.20);
  return { overall, atk, def: dfn };
}

// Générateur pseudo-aléatoire déterministe (mulberry32) pour des matchs reproductibles.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODEL = require("../public/js/model.js");

// Buts marqués par une attaque contre une défense (loi de Poisson).
function poisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// Choisit un tireur pondéré par le poste et la note (les attaquants tirent plus).
function pickShooter(players, rng) {
  const outfield = players.filter((p) => p.pos !== "GK");
  const pool = outfield.length ? outfield : players;
  const weights = pool.map((p) => (p.pos === "FWD" ? 5 : p.pos === "MID" ? 3 : p.pos === "DEF" ? 1 : 0.2) * (p.r / 100));
  let total = weights.reduce((s, w) => s + w, 0), r = rng() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

const shoOf = (p) => { const s = MODEL.computeStats(p).find((x) => x.label === "SHO"); return s ? s.value : p.r; };

// Génère les occasions d'une équipe : les buts + quelques tirs ratés/arrêtés.
function teamChances(att, def, goals, side, defStrength, rng) {
  const gk = def.players.find((p) => p.pos === "GK");
  const gkName = gk ? gk.n : "le gardien";
  const extra = Math.min(4, 1 + poisson(1.1, rng));
  const total = Math.min(7, goals + extra);
  const evs = [];
  for (let i = 0; i < total; i++) {
    const shooter = pickShooter(att.players, rng);
    let type;
    if (i < goals) type = "goal";
    else { const r = rng(); type = r < 0.5 ? "saved" : r < 0.85 ? "off" : "post"; }
    evs.push({ side, type, scorer: shooter.n, code: shooter.code, sho: shoOf(shooter), gkName, defR: defStrength.def, teamName: att.name });
  }
  return evs;
}

function commentary(ev) {
  const short = ev.scorer.split(" ").slice(-1)[0];
  switch (ev.type) {
    case "goal": return `⚽ BUT ! ${ev.scorer} (${ev.teamName}) conclut. Frappe ${ev.sho} face à une défense à ${ev.defR}.`;
    case "saved": return `🧤 ${ev.gkName} repousse la frappe de ${short} (tir ${ev.sho} vs défense ${ev.defR}).`;
    case "post": return `🪵 ${short} trouve le poteau ! (tir ${ev.sho})`;
    default: return `❌ ${short} manque le cadre (tir ${ev.sho} vs défense ${ev.defR}).`;
  }
}

// Attribue minute + position sur le terrain (FM : A attaque à droite, B à gauche).
function finalizeEvents(rawA, rawB, rng) {
  const all = rawA.concat(rawB).map((ev) => {
    const attackRight = ev.side === "a";
    const goalish = ev.type === "goal" || ev.type === "post";
    const x = attackRight ? (goalish ? 82 + rng() * 12 : 62 + rng() * 28) : (goalish ? 6 + rng() * 12 : 10 + rng() * 28);
    const y = 18 + rng() * 64;
    return Object.assign(ev, { m: 1 + Math.floor(rng() * 89), x: Math.round(x), y: Math.round(y) });
  });
  all.sort((p, q) => p.m - q.m);
  return all.map((ev) => Object.assign(ev, { text: commentary(ev) }));
}

// Simule un match entre deux équipes. seed rend le résultat reproductible.
function simulateMatch(teamA, teamB, seed) {
  const rng = makeRng(seed);
  const sa = teamStrength(teamA.players);
  const sb = teamStrength(teamB.players);
  // Bonus d'alchimie : renforce attaque et défense.
  const ba = teamA.bonus || 0, bb = teamB.bonus || 0;
  sa.atk += ba; sa.def += ba;
  sb.atk += bb; sb.def += bb;
  // Espérance de buts : attaque de l'un vs défense de l'autre, autour de ~1.4 buts.
  const lamA = Math.max(0.2, 1.4 * Math.pow(2, (sa.atk - sb.def) / 12));
  const lamB = Math.max(0.2, 1.4 * Math.pow(2, (sb.atk - sa.def) / 12));
  let ga = poisson(lamA, rng);
  let gb = poisson(lamB, rng);
  const events = finalizeEvents(
    teamChances(teamA, teamB, ga, "a", sb, rng),
    teamChances(teamB, teamA, gb, "b", sa, rng),
    rng
  );
  return { ga, gb, events };
}

// Simule un match à élimination directe : pas de nul, tirs au but si égalité.
function simulateKnockout(teamA, teamB, seed) {
  const res = simulateMatch(teamA, teamB, seed);
  let pens = null;
  if (res.ga === res.gb) {
    const rng = makeRng(seed ^ 0x9e3779b9);
    let pa = 0, pb = 0;
    for (let i = 0; i < 5; i++) { if (rng() < 0.75) pa++; if (rng() < 0.75) pb++; }
    while (pa === pb) { if (rng() < 0.75) pa++; if (rng() < 0.75) pb++; }
    pens = { pa, pb };
    res.winner = pa > pb ? teamA.id : teamB.id;
  } else {
    res.winner = res.ga > res.gb ? teamA.id : teamB.id;
  }
  res.pens = pens;
  return res;
}

// Calendrier round-robin (cercle) — chaque équipe rencontre toutes les autres une fois.
function roundRobin(teamIds) {
  const ids = teamIds.slice();
  if (ids.length % 2 === 1) ids.push(null); // équipe fantôme = repos
  const n = ids.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    // rotation en gardant le premier fixe
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}

// Classement à partir des résultats de matchs.
function computeStandings(teams, matches) {
  const table = {};
  teams.forEach((t) => {
    table[t.id] = { id: t.id, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, played: 0 };
  });
  matches.forEach((m) => {
    const A = table[m.a], B = table[m.b];
    A.played++; B.played++;
    A.gf += m.ga; A.ga += m.gb; B.gf += m.gb; B.ga += m.ga;
    if (m.ga > m.gb) { A.w++; B.l++; A.pts += 3; }
    else if (m.ga < m.gb) { B.w++; A.l++; B.pts += 3; }
    else { A.d++; B.d++; A.pts += 1; B.pts += 1; }
  });
  const arr = Object.values(table);
  arr.forEach((r) => { r.gd = r.gf - r.ga; });
  arr.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
  return arr;
}

module.exports = {
  FORMATIONS,
  formationFor,
  squadSizeFromFormation,
  teamStrength,
  simulateMatch,
  simulateKnockout,
  roundRobin,
  computeStandings,
};
