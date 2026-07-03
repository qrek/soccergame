/*
 * Modèle partagé (serveur + client) : formations, statistiques détaillées façon
 * FIFA, et alchimie (chemistry) façon FUT. Aucune dépendance.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------
  // Formations : chaque slot a une position (GK/DEF/MID/FWD) et des
  // coordonnées sur le terrain (x,y en %). y=100 = notre but, y=0 = but adverse.
  // ------------------------------------------------------------------
  const FORMATIONS = {
    // ---- 11 joueurs ----
    "4-3-3": { size: 11, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 12, y: 72 }, { pos: "DEF", x: 37, y: 76 }, { pos: "DEF", x: 63, y: 76 }, { pos: "DEF", x: 88, y: 72 },
      { pos: "MID", x: 25, y: 50 }, { pos: "MID", x: 50, y: 54 }, { pos: "MID", x: 75, y: 50 },
      { pos: "FWD", x: 20, y: 24 }, { pos: "FWD", x: 50, y: 18 }, { pos: "FWD", x: 80, y: 24 } ] },
    "4-4-2": { size: 11, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 12, y: 72 }, { pos: "DEF", x: 37, y: 76 }, { pos: "DEF", x: 63, y: 76 }, { pos: "DEF", x: 88, y: 72 },
      { pos: "MID", x: 12, y: 48 }, { pos: "MID", x: 37, y: 50 }, { pos: "MID", x: 63, y: 50 }, { pos: "MID", x: 88, y: 48 },
      { pos: "FWD", x: 35, y: 22 }, { pos: "FWD", x: 65, y: 22 } ] },
    "3-5-2": { size: 11, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 25, y: 74 }, { pos: "DEF", x: 50, y: 77 }, { pos: "DEF", x: 75, y: 74 },
      { pos: "MID", x: 10, y: 52 }, { pos: "MID", x: 30, y: 55 }, { pos: "MID", x: 50, y: 50 }, { pos: "MID", x: 70, y: 55 }, { pos: "MID", x: 90, y: 52 },
      { pos: "FWD", x: 38, y: 22 }, { pos: "FWD", x: 62, y: 22 } ] },
    "4-2-3-1": { size: 11, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 12, y: 72 }, { pos: "DEF", x: 37, y: 76 }, { pos: "DEF", x: 63, y: 76 }, { pos: "DEF", x: 88, y: 72 },
      { pos: "MID", x: 35, y: 60 }, { pos: "MID", x: 65, y: 60 }, { pos: "MID", x: 20, y: 38 }, { pos: "MID", x: 50, y: 34 }, { pos: "MID", x: 80, y: 38 },
      { pos: "FWD", x: 50, y: 16 } ] },
    "5-3-2": { size: 11, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 8, y: 70 }, { pos: "DEF", x: 29, y: 76 }, { pos: "DEF", x: 50, y: 78 }, { pos: "DEF", x: 71, y: 76 }, { pos: "DEF", x: 92, y: 70 },
      { pos: "MID", x: 28, y: 50 }, { pos: "MID", x: 50, y: 52 }, { pos: "MID", x: 72, y: 50 },
      { pos: "FWD", x: 38, y: 24 }, { pos: "FWD", x: 62, y: 24 } ] },
    // ---- 9 joueurs ----
    "3-3-2": { size: 9, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 22, y: 73 }, { pos: "DEF", x: 50, y: 76 }, { pos: "DEF", x: 78, y: 73 },
      { pos: "MID", x: 22, y: 50 }, { pos: "MID", x: 50, y: 52 }, { pos: "MID", x: 78, y: 50 },
      { pos: "FWD", x: 35, y: 24 }, { pos: "FWD", x: 65, y: 24 } ] },
    "3-4-1": { size: 9, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 22, y: 73 }, { pos: "DEF", x: 50, y: 76 }, { pos: "DEF", x: 78, y: 73 },
      { pos: "MID", x: 15, y: 50 }, { pos: "MID", x: 38, y: 52 }, { pos: "MID", x: 62, y: 52 }, { pos: "MID", x: 85, y: 50 },
      { pos: "FWD", x: 50, y: 22 } ] },
    // ---- 7 joueurs ----
    "2-3-1": { size: 7, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 30, y: 72 }, { pos: "DEF", x: 70, y: 72 },
      { pos: "MID", x: 20, y: 48 }, { pos: "MID", x: 50, y: 50 }, { pos: "MID", x: 80, y: 48 },
      { pos: "FWD", x: 50, y: 22 } ] },
    "3-2-1": { size: 7, slots: [
      { pos: "GK", x: 50, y: 90 },
      { pos: "DEF", x: 22, y: 72 }, { pos: "DEF", x: 50, y: 75 }, { pos: "DEF", x: 78, y: 72 },
      { pos: "MID", x: 33, y: 48 }, { pos: "MID", x: 67, y: 48 },
      { pos: "FWD", x: 50, y: 22 } ] },
    // ---- 5 joueurs ----
    "2-1-1": { size: 5, slots: [
      { pos: "GK", x: 50, y: 88 },
      { pos: "DEF", x: 30, y: 66 }, { pos: "DEF", x: 70, y: 66 },
      { pos: "MID", x: 50, y: 46 },
      { pos: "FWD", x: 50, y: 22 } ] },
    "1-2-1": { size: 5, slots: [
      { pos: "GK", x: 50, y: 88 },
      { pos: "DEF", x: 50, y: 68 },
      { pos: "MID", x: 30, y: 46 }, { pos: "MID", x: 70, y: 46 },
      { pos: "FWD", x: 50, y: 22 } ] },
  };

  const DEFAULT_FORMATION = { 5: "2-1-1", 7: "2-3-1", 9: "3-3-2", 11: "4-3-3" };

  function formationsForSize(size) {
    return Object.keys(FORMATIONS).filter((k) => FORMATIONS[k].size === size);
  }

  function positionCounts(formationKey) {
    const f = FORMATIONS[formationKey];
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    (f ? f.slots : []).forEach((s) => c[s.pos]++);
    return c;
  }

  // ------------------------------------------------------------------
  // Statistiques détaillées façon FIFA, dérivées de la note + du poste,
  // avec une variation déterministe par joueur (nom).
  // ------------------------------------------------------------------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  // Profils : décalage moyen par rapport à la note, par poste. La moyenne des
  // 6 stats reste proche de la note globale.
  const PROFILE = {
    FWD: { PAC: 4, SHO: 8, PAS: -2, DRI: 5, DEF: -22, PHY: 0 },
    MID: { PAC: 0, SHO: 0, PAS: 8, DRI: 6, DEF: -4, PHY: 0 },
    DEF: { PAC: -1, SHO: -18, PAS: -3, DRI: -6, DEF: 10, PHY: 8 },
    GK:  { DIV: 3, HAN: 2, KIC: -2, REF: 4, SPD: -12, POS: 3 },
  };
  const LABELS = {
    FWD: ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"],
    MID: ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"],
    DEF: ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"],
    GK:  ["DIV", "HAN", "KIC", "REF", "SPD", "POS"],
  };

  function clamp(v) { return Math.max(38, Math.min(99, Math.round(v))); }

  function computeStats(player) {
    const prof = PROFILE[player.pos];
    const labels = LABELS[player.pos];
    const h = hash(player.n + player.c);
    const out = [];
    labels.forEach((lab, i) => {
      const jitter = (((h >> (i * 4)) & 0xf) - 7); // -7..+8 déterministe
      out.push({ label: lab, value: clamp(player.r + prof[lab] + jitter) });
    });
    return out;
  }

  // ------------------------------------------------------------------
  // Alchimie (chemistry) : deux joueurs sont "liés" si leurs positions sur le
  // terrain sont proches. Un lien entre deux joueurs de même nationalité
  // renforce l'alchimie de chacun (façon FUT).
  // ------------------------------------------------------------------
  function placeInSlots(squad, formationKey) {
    const f = FORMATIONS[formationKey];
    if (!f) return [];
    const pool = { GK: [], DEF: [], MID: [], FWD: [] };
    squad.forEach((p) => (pool[p.pos] || pool.MID).push(p));
    Object.values(pool).forEach((a) => a.sort((x, y) => y.r - x.r));
    // Placement gauche->droite en alternant pour centrer les meilleurs.
    return f.slots.map((slot) => {
      const player = (pool[slot.pos] && pool[slot.pos].shift()) || null;
      return { slot, player };
    });
  }

  function slotLinks(formationKey) {
    const f = FORMATIONS[formationKey];
    if (!f) return [];
    const links = [];
    for (let i = 0; i < f.slots.length; i++) {
      for (let j = i + 1; j < f.slots.length; j++) {
        const a = f.slots[i], b = f.slots[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= 30) links.push([i, j]);
      }
    }
    return links;
  }

  // Retourne { placement, links:[{i,j,strong}], perChem:[0..3], teamChem:0..100, bonus:0..6 }
  function chemistry(squad, formationKey) {
    const placement = placeInSlots(squad, formationKey);
    const links = slotLinks(formationKey).map(([i, j]) => {
      const pa = placement[i] && placement[i].player;
      const pb = placement[j] && placement[j].player;
      const strong = !!(pa && pb && pa.c === pb.c);
      return { i, j, strong };
    });
    const perChem = placement.map(() => 0);
    links.forEach((l) => { if (l.strong) { perChem[l.i]++; perChem[l.j]++; } });
    for (let i = 0; i < perChem.length; i++) perChem[i] = Math.min(3, perChem[i]);
    const n = placement.filter((p) => p.player).length || 1;
    const teamChem = Math.round((perChem.reduce((s, v) => s + v, 0) / (3 * n)) * 100);
    const bonus = Math.round((teamChem / 100) * 6);
    return { placement, links, perChem, teamChem, bonus };
  }

  // ------------------------------------------------------------------
  // Valeur marchande (en M€), dérivée de la note et du poste : courbe
  // exponentielle façon marché réel (les attaquants coûtent plus cher).
  // ------------------------------------------------------------------
  const BUDGET = 350; // budget global par manager, en M€
  const POS_VALUE = { FWD: 1.15, MID: 1.0, DEF: 0.9, GK: 0.8 };
  function marketValue(p) {
    let v = 5 * Math.pow(1.163, p.r - 75) * (POS_VALUE[p.pos] || 1);
    if (v >= 10) v = Math.round(v);
    else if (v >= 1) v = Math.round(v * 2) / 2;
    else v = Math.max(0.3, Math.round(v * 10) / 10);
    return v;
  }

  const M = { FORMATIONS, DEFAULT_FORMATION, formationsForSize, positionCounts, computeStats, chemistry, placeInSlots, slotLinks, marketValue, BUDGET };
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  else root.MODEL = M;
})(typeof window !== "undefined" ? window : this);
