/*
 * Moteur de jeu — partagé entre le serveur (Node) et le client (navigateur,
 * pour le mode « 1 téléphone »). Simulation de matchs, temps forts,
 * championnat, phases finales et tirage des équipes du draft.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./model.js"));
  else root.ENGINE = factory(root.MODEL);
})(typeof window !== "undefined" ? window : this, function (MODEL) {
  "use strict";

  // Force d'une équipe : attaque et défense pondérées par poste.
  function teamStrength(players) {
    if (!players.length) return { overall: 0, atk: 0, def: 0 };
    const avg = (arr) => (arr.length ? arr.reduce((s, p) => s + p.r, 0) / arr.length : 0);
    const gk = players.filter((p) => p.pos === "GK");
    const def = players.filter((p) => p.pos === "DEF");
    const mid = players.filter((p) => p.pos === "MID");
    const fwd = players.filter((p) => p.pos === "FWD");
    const overall = Math.round(avg(players));
    const atk = Math.round(avg(fwd) * 0.55 + avg(mid) * 0.35 + overall * 0.10);
    const dfn = Math.round(avg(gk) * 0.35 + avg(def) * 0.45 + avg(mid) * 0.20);
    return { overall, atk, def: dfn };
  }

  // Générateur pseudo-aléatoire déterministe (mulberry32).
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function poisson(lambda, rng) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  }

  // Choisit un tireur de façon cohérente : les attaquants finissent les
  // actions, et la qualité de frappe (SHO) pèse fortement — un 95 en tir
  // marque bien plus souvent qu'un 70.
  function pickShooter(players, rng) {
    const outfield = players.filter((p) => p.pos !== "GK");
    const pool = outfield.length ? outfield : players;
    const weights = pool.map((p) => {
      const posW = p.pos === "FWD" ? 6 : p.pos === "MID" ? 2.5 : p.pos === "DEF" ? 0.8 : 0.1;
      return posW * Math.pow(shoOf(p) / 100, 2.5);
    });
    let total = weights.reduce((s, w) => s + w, 0), r = rng() * total;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  const shoOf = (p) => { const s = MODEL.computeStats(p).find((x) => x.label === "SHO"); return s ? s.value : p.r; };

  // Occasions d'une équipe : les buts + quelques tirs ratés/arrêtés.
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
      const pen = type !== "post" && rng() < (type === "goal" ? 0.055 : 0.018);
      evs.push({ side, type, pen, scorer: shooter.n, code: shooter.code, sho: shoOf(shooter), gkName, defR: defStrength.def, teamName: att.name });
    }
    return evs;
  }

  function commentary(ev) {
    const short = ev.scorer.split(" ").slice(-1)[0];
    const pick = (arr) => arr[(ev.m * 31 + ev.scorer.length * 7) % arr.length];
    if (ev.type === "yellow") return pick([
      `🟨 Carton jaune pour ${short} après une faute rugueuse.`,
      `🟨 ${short} prend un jaune pour un tacle en retard.`,
      `🟨 Avertissement logique pour ${short}, coupable d'un tirage de maillot.`,
    ]);
    if (ev.type === "red") return pick([
      `🟥 ROUGE ! ${short} laisse les siens à dix après un tacle dangereux !`,
      `🟥 Expulsion de ${short} — le geste était grossier. Il sera suspendu.`,
    ]);
    if (ev.pen) {
      if (ev.type === "goal") return pick([
        `⚽ PENALTY transformé ! ${ev.scorer} prend ${ev.gkName} à contre-pied.`,
        `⚽ Faute en surface... et ${ev.scorer} ne tremble pas sur le penalty !`,
      ]);
      if (ev.type === "saved") return `🧤 PENALTY ARRÊTÉ ! ${ev.gkName} s'envole et détourne la tentative de ${short} !`;
      return `❌ Penalty MANQUÉ ! ${short} envoie le ballon dans les nuages...`;
    }
    switch (ev.type) {
      case "goal": return pick([
        `⚽ BUT ! ${ev.scorer} (${ev.teamName}) conclut du plat du pied. Frappe ${ev.sho} face à une défense à ${ev.defR}.`,
        `⚽ BUUUT ! Frappe imparable de ${ev.scorer} sous la barre !`,
        `⚽ BUT ! ${ev.scorer} surgit au bon endroit et trompe ${ev.gkName} !`,
        `⚽ BUT ! Action collective superbe conclue par ${ev.scorer} (${ev.teamName}).`,
      ]);
      case "saved": return pick([
        `🧤 ${ev.gkName} repousse la frappe de ${short} (tir ${ev.sho} vs défense ${ev.defR}).`,
        `🧤 Quel réflexe de ${ev.gkName} devant ${short} !`,
        `🧤 ${short} pensait l'avoir mise au fond... ${ev.gkName} en décide autrement.`,
      ]);
      case "post": return pick([
        `🪵 ${short} trouve le poteau ! (tir ${ev.sho})`,
        `🪵 La barre sauve le gardien sur cette tentative de ${short} !`,
      ]);
      default: return pick([
        `❌ ${short} manque le cadre (tir ${ev.sho} vs défense ${ev.defR}).`,
        `❌ ${short} dévisse complètement, ça ne cadre pas.`,
        `❌ La tentative lointaine de ${short} frôle la lucarne... sans danger.`,
      ]);
    }
  }

  // Minute + position sur le terrain (A attaque à droite, B à gauche).
  function finalizeEvents(rawA, rawB, rng, m0) {
    const start = m0 || 1;
    const all = rawA.concat(rawB).map((ev) => {
      const attackRight = ev.side === "a";
      const goalish = ev.type === "goal" || ev.type === "post";
      const isCard = ev.type === "yellow" || ev.type === "red";
      // Les tirs partent des abords de la surface (fini les frappes de 40 m).
      let x = attackRight ? (goalish ? 82 + rng() * 12 : 72 + rng() * 20) : (goalish ? 6 + rng() * 12 : 8 + rng() * 20);
      let y = 18 + rng() * 64;
      if (ev.pen) { x = attackRight ? 89 : 11; y = 50; }
      if (isCard) { x = 25 + rng() * 50; y = 18 + rng() * 64; }
      return Object.assign(ev, { m: Math.min(89, start + Math.floor(rng() * Math.max(1, 89 - start))), x: Math.round(x), y: Math.round(y) });
    });
    all.sort((p, q) => p.m - q.m);
    return all.map((ev) => Object.assign(ev, { text: commentary(ev) }));
  }

  // Simule un match (reproductible via seed). bonus = alchimie.
  function simulateMatch(teamA, teamB, seed) {
    const rng = makeRng(seed);
    const sa = teamStrength(teamA.players);
    const sb = teamStrength(teamB.players);
    const ba = teamA.bonus || 0, bb = teamB.bonus || 0;
    sa.atk += ba; sa.def += ba;
    sb.atk += bb; sb.def += bb;
    // /8 (au lieu de /12) : la qualité du draft pèse vraiment sur le résultat.
    const lamA = Math.max(0.18, 1.32 * Math.pow(2, (sa.atk - sb.def) / 8));
    const lamB = Math.max(0.18, 1.32 * Math.pow(2, (sb.atk - sa.def) / 8));
    const ga = Math.min(6, poisson(lamA, rng));
    const gb = Math.min(6, poisson(lamB, rng));
    // Cartons : les fautifs sont plutôt des défenseurs/milieux.
    const pickFouler = (players) => {
      const pool = players.filter((p) => p.pos !== "GK");
      const w = pool.map((p) => (p.pos === "DEF" ? 3 : p.pos === "MID" ? 2 : 1));
      let tot = w.reduce((u, v) => u + v, 0), r = rng() * tot;
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
      return pool[0];
    };
    const cardEvs = { a: [], b: [] };
    for (const [tm, side] of [[teamA, "a"], [teamB, "b"]]) {
      const ny = Math.min(4, poisson(1.6, rng));
      for (let i = 0; i < ny; i++) {
        const pl = pickFouler(tm.players);
        cardEvs[side].push({ side, type: "yellow", scorer: pl.n, code: pl.code, playerId: pl.id, sho: 0, gkName: "", defR: 0, teamName: tm.name });
      }
      if (rng() < 0.03) {
        const pl = pickFouler(tm.players);
        cardEvs[side].push({ side, type: "red", scorer: pl.n, code: pl.code, playerId: pl.id, sho: 0, gkName: "", defR: 0, teamName: tm.name });
      }
    }
    const events = finalizeEvents(
      teamChances(teamA, teamB, ga, "a", sb, rng).concat(cardEvs.a),
      teamChances(teamB, teamA, gb, "b", sa, rng).concat(cardEvs.b),
      rng
    );
    return { ga, gb, events };
  }

  // Élimination directe : tirs au but si égalité.
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

  // Calendrier round-robin (méthode du cercle).
  function roundRobin(teamIds) {
    const ids = teamIds.slice();
    if (ids.length % 2 === 1) ids.push(null);
    const n = ids.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) {
        const a = ids[i], b = ids[n - 1 - i];
        if (a !== null && b !== null) round.push([a, b]);
      }
      rounds.push(round);
      ids.splice(1, 0, ids.pop());
    }
    return rounds;
  }

  function computeStandings(teams, matches) {
    const table = {};
    teams.forEach((t) => { table[t.id] = { id: t.id, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, played: 0 }; });
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

  const seedFor = (a, b, salt) => ((a * 73856093) ^ (b * 19349663) ^ (salt * 83492791)) >>> 0;

  // Tire une équipe nationale au sort pour le tour de draft courant.
  // Retourne TOUS les joueurs du pays : les déjà draftés marqués `taken`,
  // les inabordables marqués `expensive`.
  // budget = { left, needCounts } : un joueur est abordable si, après achat,
  // il reste de quoi payer les joueurs les MOINS CHERS disponibles à chaque
  // poste encore manquant (réserve exacte, +1 M€ de marge par slot).
  function drawTeamForTurn(allPlayers, draftedIds, neededPos, budget) {
    const byCountry = new Map();
    for (const p of allPlayers) {
      if (!byCountry.has(p.c)) byCountry.set(p.c, []);
      byCountry.get(p.c).push(p);
    }
    const free = (p) => !draftedIds.has(p.id);

    let afford = () => true;
    if (budget) {
      const cheap = { GK: [], DEF: [], MID: [], FWD: [] };
      for (const p of allPlayers) if (free(p)) cheap[p.pos].push(MODEL.marketValue(p));
      for (const k in cheap) cheap[k].sort((a, b) => a - b);
      const cheapAny = Math.min(...["GK", "DEF", "MID", "FWD"].map((k) => (cheap[k][0] != null ? cheap[k][0] : 2)));
      const minCostAfter = (pos) => {
        let total = 0, needAfter = 0;
        for (const k of ["GK", "DEF", "MID", "FWD"]) {
          let n = budget.needCounts[k] || 0;
          if (k === pos && n > 0) n--; // le slot que ce pick remplit
          needAfter += n;
          for (let i = 0; i < n; i++) total += (cheap[k][i] != null ? cheap[k][i] : 2) + 1;
        }
        // places de banc restantes : garder de quoi payer les moins chers
        const extra = Math.max(0, (budget.slotsLeft || needAfter + 1) - 1 - needAfter);
        total += extra * (cheapAny + 1);
        return total;
      };
      afford = (p) => MODEL.marketValue(p) <= budget.left - minCostAfter(p.pos);
    }
    const needed = (p) => neededPos.has(p.pos);
    const entries = [...byCountry.entries()];

    // Repli hiérarchique : le POSTE prime sur le budget pour garder des
    // formations valides — le budget ne cède qu'en dernier recours.
    const stages = [
      { test: (p) => free(p) && afford(p) && needed(p), pos: true, bud: true },
      { test: (p) => free(p) && afford(p), pos: false, bud: true },
      { test: (p) => free(p) && needed(p), pos: true, bud: false },
      { test: (p) => free(p), pos: false, bud: false },
    ];
    let stage = stages[stages.length - 1];
    let candidates = [];
    for (const st of stages) {
      candidates = entries.filter(([, l]) => l.some(st.test));
      if (candidates.length) { stage = st; break; }
    }

    const [country, list] = candidates[Math.floor(Math.random() * candidates.length)];
    const options = list
      .map((p) => {
        const taken = draftedIds.has(p.id);
        const price = MODEL.marketValue(p);
        const affordable = !stage.bud || afford(p);
        return Object.assign({}, p, {
          taken, price,
          expensive: !taken && stage.bud && !afford(p),
          eligible: !taken && affordable && (!stage.pos || needed(p)),
        });
      })
      .sort((a, b) => (a.taken - b.taken) || (b.r - a.r));
    return { country, code: list[0].code, options, relaxed: !stage.pos };
  }

  // Diffusion par JOURNÉE : tous les matchs d'une même journée se jouent en
  // simultané (comme un vrai multiplex FM), puis les tours de phases finales.
  function buildRounds(t) {
    const rounds = [];
    const byRound = new Map();
    t.matches.forEach((m) => {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round).push(m);
    });
    [...byRound.keys()].sort((a, b) => a - b).forEach((r) =>
      rounds.push({ stage: "Journée " + r, type: "league", matches: byRound.get(r) }));
    if (t.knockout) {
      t.knockout.rounds.forEach((round, i) => {
        const label = ({ 1: "Finale", 2: "Demi-finales", 3: "Quarts de finale" })[t.knockout.rounds.length - i] || "Tour";
        rounds.push({ stage: label, type: "ko", matches: round });
      });
    }
    return rounds;
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
        const res = simulateKnockout(teamById[a], teamById[b], seedFor(a, b, salt++));
        roundMatches.push({ a, b, an: nameOf(a), bn: nameOf(b), ga: res.ga, gb: res.gb, pens: res.pens, winner: res.winner, events: res.events });
        winners.push(res.winner);
      }
      roundsOut.push(roundMatches);
      if (winners.length === 1) return { rounds: roundsOut, champion: { id: winners[0], name: nameOf(winners[0]) } };
      current = [];
      for (let i = 0; i < winners.length; i += 2) current.push([winners[i], winners[i + 1]]);
    }
    return { rounds: roundsOut, champion: null };
  }

  // Championnat aller simple + phases finales. teams = [{id, name, players, bonus}]
  function runTournament(teams) {
    const teamById = {};
    teams.forEach((t) => { teamById[t.id] = t; });
    const rounds = roundRobin(teams.map((t) => t.id));
    const matches = [];
    rounds.forEach((round, ri) => {
      round.forEach(([a, b]) => {
        const res = simulateMatch(teamById[a], teamById[b], seedFor(a, b, ri + 1));
        matches.push({ a, b, ga: res.ga, gb: res.gb, round: ri + 1, events: res.events, an: teamById[a].name, bn: teamById[b].name });
      });
    });
    const standings = computeStandings(teams, matches).map((s) => Object.assign({}, s, { name: teamById[s.id].name }));
    const N = teams.length;
    const K = N >= 8 ? 8 : N >= 4 ? 4 : N >= 2 ? 2 : 0;
    const knockout = buildKnockout(standings, teamById, K);

    // Classement des buteurs (championnat + phases finales).
    const goals = new Map();
    const addEvents = (evs) => (evs || []).forEach((e) => {
      if (e.type !== "goal") return;
      const k = e.scorer + "|" + e.code;
      const g = goals.get(k) || { n: e.scorer, code: e.code, team: e.teamName, goals: 0 };
      g.goals++; g.team = e.teamName;
      goals.set(k, g);
    });
    matches.forEach((m) => addEvents(m.events));
    if (knockout) knockout.rounds.forEach((r) => r.forEach((m) => addEvents(m.events)));
    const scorers = [...goals.values()].sort((a, b) => b.goals - a.goals).slice(0, 12);

    return {
      standings, matches, knockout, scorers,
      champion: knockout ? knockout.champion
        : (standings[0] ? { id: standings[0].id, name: teamById[standings[0].id].name } : null),
    };
  }

  // ---------- Tournoi progressif : rotation, forme, instructions ----------
  // Instruction tactique : impact plafonné à ±6 % sur les probabilités.
  const stanceLam = (st) => st === "off" ? { own: 1.06, opp: 1.03 } : st === "def" ? { own: 0.97, opp: 0.94 } : { own: 1, opp: 1 };

  // Forme : -2 de note par match enchaîné au-delà du premier (max -6).
  const formMalus = (fat) => Math.min(6, Math.max(0, ((fat || 0) - 1) * 2));
  const effRating = (p, fat) => p.r - formMalus(fat);

  // Onze de départ : à chaque poste, les mieux notés EN FORME titulaires.
  function selectLineup(team, fatigue) {
    const adj = team.players.map((p) => Object.assign({}, p, {
      r: effRating(p, fatigue[p.id]), r0: p.r, fat: fatigue[p.id] || 0,
    }));
    const placement = MODEL.placeInSlots(adj, team.formationKey || "4-3-3");
    const starters = placement.filter((s) => s.player).map((s) => s.player);
    const bench = adj.filter((p) => starters.indexOf(p) < 0);
    return { starters, bench };
  }

  function createTournament(teams) {
    const t = {
      teams,
      leagueRounds: roundRobin(teams.map((x) => x.id)),
      playedLeague: [], koRounds: [], koPairs: null,
      fatigue: {}, suspended: {}, stageNum: 0, koStage: 0, champion: null, done: false,
    };
    t.koSize = teams.length >= 8 ? 8 : teams.length >= 4 ? 4 : 2;
    t.totalRounds = t.leagueRounds.length + Math.round(Math.log2(t.koSize));
    return t;
  }
  const teamOf = (t, id) => t.teams.find((x) => x.id === id);

  // Prolongation : 30 minutes supplémentaires à intensité réduite.
  function extraTime(m, seed) {
    const rng = makeRng(seed ^ 0x51ed270b);
    const sa = teamStrength(m._ta.players), sb = teamStrength(m._tb.players);
    sa.atk += m._ta.bonus || 0; sb.atk += m._tb.bonus || 0;
    sa.def += m._ta.bonus || 0; sb.def += m._tb.bonus || 0;
    const lamA = Math.max(0.05, 1.32 * Math.pow(2, (sa.atk - sb.def) / 8) * (30 / 90) * 0.85);
    const lamB = Math.max(0.05, 1.32 * Math.pow(2, (sb.atk - sa.def) / 8) * (30 / 90) * 0.85);
    const ga = Math.min(2, poisson(lamA, rng)), gb = Math.min(2, poisson(lamB, rng));
    const evs = finalizeEvents(
      teamChances(m._ta, m._tb, ga, "a", sb, rng),
      teamChances(m._tb, m._ta, gb, "b", sa, rng),
      rng, 91
    ).map((ev) => Object.assign(ev, { m: Math.min(119, Math.max(91, ev.m)) }));
    m.events = (m.events || []).concat(evs).sort((x, y) => x.m - y.m);
    m.ga += ga; m.gb += gb;
    m.dur = 120;
  }

  function playMatchPair(t, a, b, salt, ko) {
    const A = teamOf(t, a), B = teamOf(t, b);
    const avail = (team) => {
      const ok = team.players.filter((p) => !(t.suspended[p.id] > 0));
      return ok.length >= 11 ? Object.assign({}, team, { players: ok }) : team; // garde-fou
    };
    const la = selectLineup(avail(A), t.fatigue), lb = selectLineup(avail(B), t.fatigue);
    const ca = MODEL.chemistry(la.starters, A.formationKey || "4-3-3");
    const cb = MODEL.chemistry(lb.starters, B.formationKey || "4-3-3");
    const ta = { id: a, name: A.name, players: la.starters, bonus: ca.bonus };
    const tb = { id: b, name: B.name, players: lb.starters, bonus: cb.bonus };
    const res = simulateMatch(ta, tb, seedFor(a, b, salt));
    const m = { a, b, an: A.name, bn: B.name, ga: res.ga, gb: res.gb, events: res.events,
      ko: !!ko, salt, dur: 90, stanceA: "bal", stanceB: "bal", instr: {},
      _ta: ta, _tb: tb, _benchA: la.bench, _benchB: lb.bench };
    if (ko && m.ga === m.gb) extraTime(m, seedFor(a, b, salt)); // prolongation
    // tireur de penalty désigné : il frappe les penalties du match
    const takerOf = (team, tk) => (tk && team.players.find((p) => p.id === tk)) ||
      team.players.filter((p) => p.pos !== "GK").sort((u, v) => shoOf(v) - shoOf(u))[0];
    m._tkA = takerOf(ta, A.penTaker); m._tkB = takerOf(tb, B.penTaker);
    retagPenalties(m);
    return m;
  }

  // Réattribue chaque penalty au tireur désigné de l'équipe.
  function retagPenalties(m) {
    (m.events || []).forEach((ev) => {
      if (!ev.pen) return;
      const tk = ev.side === "a" ? m._tkA : m._tkB;
      if (tk) { ev.scorer = tk.n; ev.code = tk.code; ev.sho = shoOf(tk); ev.text = commentary(ev); }
    });
  }

  function applyFatigue(t, m) {
    for (const p of m._ta.players.concat(m._tb.players)) t.fatigue[p.id] = Math.min(4, (t.fatigue[p.id] || 0) + 1);
    for (const p of (m._benchA || []).concat(m._benchB || [])) t.fatigue[p.id] = Math.max(0, (t.fatigue[p.id] || 0) - 1);
  }

  // Purge puis enregistre suspensions (rouge) et blessures légères.
  function applySuspensions(t, matches) {
    for (const k in t.suspended) t.suspended[k] = Math.max(0, t.suspended[k] - 1);
    matches.forEach((m) => (m.events || []).forEach((ev) => {
      if (ev.type === "red" && ev.playerId != null) t.suspended[ev.playerId] = 1;
    }));
    // blessures : déterministes par match, ~2 % par titulaire
    matches.forEach((m) => {
      const rng = makeRng(seedFor(m.a, m.b, m.salt) ^ 0xb105e55);
      m._ta.players.concat(m._tb.players).forEach((p) => {
        if (rng() < 0.02) { t.suspended[p.id] = 1; m.injured = (m.injured || []).concat([{ n: p.n, id: p.id }]); }
      });
    });
  }

  // Joue la journée / le tour suivant. Retourne { stage, type, matches } ou null.
  function playNextRound(t) {
    if (t.done) return null;
    if (t.stageNum < t.leagueRounds.length) {
      const matches = t.leagueRounds[t.stageNum].map(([a, b]) => {
        const m = playMatchPair(t, a, b, t.stageNum + 1, false);
        m.round = t.stageNum + 1;
        return m;
      });
      matches.forEach((m) => { applyFatigue(t, m); t.playedLeague.push(m); });
      applySuspensions(t, matches);
      t.stageNum++;
      return { stage: "Journée " + t.stageNum, type: "league", matches };
    }
    if (!t.koPairs) {
      const st = computeStandings(t.teams, t.playedLeague);
      const seeds = st.slice(0, t.koSize).map((s) => s.id);
      const pairMaps = { 2: [[0, 1]], 4: [[0, 3], [1, 2]], 8: [[0, 7], [3, 4], [1, 6], [2, 5]] };
      t.koPairs = pairMaps[t.koSize].map(([i, j]) => [seeds[i], seeds[j]]);
    }
    if (!t.koPairs.length) { t.done = true; return null; }
    const salt = 100 + t.koStage * 10;
    const matches = t.koPairs.map(([a, b], i) => playMatchPair(t, a, b, salt + i, true));
    matches.forEach((m) => applyFatigue(t, m));
    applySuspensions(t, matches);
    const left = Math.round(Math.log2(t.koSize)) - t.koStage;
    const label = ({ 1: "Finale", 2: "Demi-finales", 3: "Quarts de finale" })[left] || "Tour";
    t.koRounds.push(matches);
    t.koStage++;
    return { stage: label, type: "ko", matches };
  }

  // Fin de tour KO : tirs au but si égalité, qualification, champion.
  function settleRound(t, round) {
    if (!round || round.type !== "ko") return;
    const winners = [];
    for (const m of round.matches) {
      if (m.winner != null) { winners.push(m.winner); continue; } // séance interactive déjà jouée
      if (m.ga === m.gb) {
        const rng = makeRng(seedFor(m.a, m.b, m.salt) ^ 0x9e3779b9);
        let pa = 0, pb = 0;
        for (let i = 0; i < 5; i++) { if (rng() < 0.75) pa++; if (rng() < 0.75) pb++; }
        while (pa === pb) { if (rng() < 0.75) pa++; if (rng() < 0.75) pb++; }
        m.pens = { pa, pb };
        m.winner = pa > pb ? m.a : m.b;
      } else m.winner = m.ga > m.gb ? m.a : m.b;
      winners.push(m.winner);
    }
    if (winners.length === 1) { t.champion = winners[0]; t.done = true; t.koPairs = []; }
    else { t.koPairs = []; for (let i = 0; i < winners.length; i += 2) t.koPairs.push([winners[i], winners[i + 1]]); }
  }

  // Instruction en cours de match : re-simule les minutes restantes.
  function applyInstruction(m, side, stance, minute) {
    if (side === "a") m.stanceA = stance; else m.stanceB = stance;
    const kept = (m.events || []).filter((ev) => ev.m <= minute);
    let ka = 0, kb = 0;
    kept.forEach((ev) => { if (ev.type === "goal") { if (ev.side === "a") ka++; else kb++; } });
    const sa = teamStrength(m._ta.players), sb = teamStrength(m._tb.players);
    sa.atk += m._ta.bonus || 0; sa.def += m._ta.bonus || 0;
    sb.atk += m._tb.bonus || 0; sb.def += m._tb.bonus || 0;
    const la = stanceLam(m.stanceA), lb = stanceLam(m.stanceB);
    const frac = Math.max(0, (90 - minute) / 90);
    const rng = makeRng(seedFor(m.a, m.b, m.salt) ^ Math.imul(minute + 1, 2654435761));
    const lamA = Math.max(0.04, 1.32 * Math.pow(2, (sa.atk - sb.def) / 8) * la.own * lb.opp * frac);
    const lamB = Math.max(0.04, 1.32 * Math.pow(2, (sb.atk - sa.def) / 8) * lb.own * la.opp * frac);
    const gaN = Math.min(4, poisson(lamA, rng));
    const gbN = Math.min(4, poisson(lamB, rng));
    const newEvs = finalizeEvents(
      teamChances(m._ta, m._tb, gaN, "a", sb, rng),
      teamChances(m._tb, m._ta, gbN, "b", sa, rng),
      rng, Math.min(88, minute + 1)
    );
    m.events = kept.concat(newEvs).sort((x, y) => x.m - y.m);
    m.ga = ka + gaN;
    m.gb = kb + gbN;
    // en KO, la prolongation dépend du nouveau score après 90'
    if (m.ko) {
      m.dur = 90;
      if (m.ga === m.gb) extraTime(m, seedFor(m.a, m.b, m.salt));
    }
    retagPenalties(m);
  }

  // ---- Tirs au but interactifs ----
  // dirTir/dirPlongeon dans {"L","C","R"} ; sho = note de tir, gkr = note gardien.
  function resolvePenalty(shotDir, diveDir, sho, gkr, rngv) {
    const same = shotDir === diveDir;
    let p;
    if (same) p = Math.max(0.05, Math.min(0.2, 0.10 + (sho - gkr) / 400));
    else p = Math.max(0.68, Math.min(0.95, 0.85 + (sho - gkr) / 300));
    return rngv < p;
  }
  function publicShootout(so) {
    return { pa: so.pa, pb: so.pb, turn: so.turn, phase: so.phase, done: so.done,
      kicker: so.kicker ? { side: so.kicker.side, name: so.kicker.name } : null,
      deadline: so.deadline || 0,
      kicks: so.kicks.map((k) => ({ side: k.side, name: k.name, scored: k.scored, dir: k.dir, dive: k.dive })) };
  }

  // Vue publique d'un match (sans les champs internes _ta/_tb).
  function publicMatch(m) {
    return { a: m.a, b: m.b, an: m.an, bn: m.bn, ga: m.ga, gb: m.gb, round: m.round,
      events: m.events, pens: m.pens || null, winner: m.winner, ko: m.ko, dur: m.dur || 90,
      injured: m.injured || null,
      stanceA: m.stanceA, stanceB: m.stanceB, instr: m.instr || {}, shootout: m.shootout ? publicShootout(m.shootout) : null };
  }

  function computeScorers(allMatches) {
    const goals = new Map();
    for (const m of allMatches) {
      for (const ev of m.events || []) {
        if (ev.type !== "goal") continue;
        const k = ev.scorer + "|" + ev.code;
        const g = goals.get(k) || { n: ev.scorer, code: ev.code, team: ev.teamName, goals: 0 };
        g.goals++; g.team = ev.teamName;
        goals.set(k, g);
      }
    }
    return [...goals.values()].sort((x, y) => y.goals - x.goals).slice(0, 12);
  }

  function finalizeTournament(t) {
    const standings = computeStandings(t.teams, t.playedLeague).map((s) => Object.assign({}, s, { name: teamOf(t, s.id).name }));
    const koRounds = t.koRounds.map((r) => r.map(publicMatch));
    const knockout = t.koRounds.length
      ? { rounds: koRounds, champion: t.champion != null ? { id: t.champion, name: teamOf(t, t.champion).name } : null }
      : null;
    const scorers = computeScorers(t.playedLeague.concat(t.koRounds.flat()));
    return {
      standings,
      matches: t.playedLeague.map(publicMatch),
      knockout, scorers,
      champion: knockout && knockout.champion ? knockout.champion
        : (standings[0] ? { id: standings[0].id, name: teamOf(t, standings[0].id).name } : null),
    };
  }

  return { teamStrength, simulateMatch, simulateKnockout, roundRobin, computeStandings, seedFor, drawTeamForTurn, runTournament, buildRounds,
    createTournament, playNextRound, settleRound, applyInstruction, publicMatch, finalizeTournament, formMalus,
    resolvePenalty, publicShootout, shoOf, makeRng };
});
