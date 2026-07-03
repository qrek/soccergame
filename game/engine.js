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

// Buts marqués par une attaque contre une défense (loi de Poisson).
function poisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// Simule un match entre deux équipes. seed rend le résultat reproductible.
function simulateMatch(teamA, teamB, seed) {
  const rng = makeRng(seed);
  const sa = teamStrength(teamA.players);
  const sb = teamStrength(teamB.players);
  // Espérance de buts : attaque de l'un vs défense de l'autre, autour de ~1.4 buts.
  const lamA = Math.max(0.2, 1.4 * Math.pow(2, (sa.atk - sb.def) / 12));
  const lamB = Math.max(0.2, 1.4 * Math.pow(2, (sb.atk - sa.def) / 12));
  let ga = poisson(lamA, rng);
  let gb = poisson(lamB, rng);
  return { ga, gb };
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
