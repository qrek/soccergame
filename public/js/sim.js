/*
 * SIM — moteur de simulation du terrain, réécrit de zéro (v31).
 *
 * Architecture inspirée du moteur open-source « footballsim »
 * (intention -> action -> physique), adaptée à notre besoin : le résultat du
 * match est déjà connu (moteur Poisson d'engine.js), la simulation doit donc
 * ÊTRE GUIDÉE — elle joue un vrai match de football dont les temps forts
 * tombent exactement aux minutes prévues.
 *
 * Principe :
 *  1. buildTimeline() construit UNE FOIS, de façon déterministe (seed),
 *     la trajectoire complète du ballon : conduites, passes, interceptions,
 *     montées vers chaque occasion, tir, relance ou engagement.
 *  2. draw(clock) rend l'instant demandé : le ballon est une pure fonction
 *     du temps de match (on peut sauter, revenir, changer d'onglet — rien ne
 *     dérive), et les 22 joueurs gravitent autour avec des courses plafonnées
 *     (porteur, receveur, pressing, soutiens, blocs qui coulissent, gardiens).
 *  3. Les gels de l'horloge sont des scènes dédiées : célébration de but,
 *     et fenêtre de penalty (mise en place, élan, tir du côté choisi,
 *     plongeon du gardien, joie ou dépit) sans jamais révéler l'issue
 *     en avance.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SIM = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rngOf(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------
  // Timeline du ballon : liste de segments {t0,t1,x0,y0,x1,y1,mode,h}
  // mode = carry (au pied), fly (passe), shot (frappe), dead (posé).
  // h = index du joueur concerné (porteur, ou receveur d'une passe).
  // Tous les temps sont en minutes de match (flottants).
  // ------------------------------------------------------------------
  function buildTimeline(dots, events, dur, rng, penLive) {
    const segs = [];
    const outfield = (s) => dots.filter((d) => d.side === s && d.pos !== "GK");
    const gkOf = (s) => dots.find((d) => d.side === s && d.pos === "GK") || dots[0];
    const dirOf = (s) => (s === "a" ? 1 : -1);
    const rank = (list, p) => list.slice().sort((u, v) =>
      Math.hypot(u.hx - p.x, u.hy - p.y) - Math.hypot(v.hx - p.x, v.hy - p.y));

    let t = 0, ball = { x: 50, y: 32 };
    let poss = events.length ? events[0].side : (rng() < 0.5 ? "a" : "b");
    let holder = rank(outfield(poss), ball)[0];

    const push = (mode, d, to, h) => {
      segs.push({ t0: t, t1: t + d, x0: ball.x, y0: ball.y, x1: to.x, y1: to.y, mode, h: h ? h.idx : -1 });
      t += d; ball = { x: to.x, y: to.y };
    };
    const carry = (to, d) => push("carry", d, to, holder);
    const flyTo = (rec, to, speed, maxD) => {
      const d = Math.min(maxD || 9, clamp(Math.hypot(to.x - ball.x, to.y - ball.y) / (speed || 32), 0.2, 0.9));
      push("fly", d, to, rec);
      holder = rec;
    };

    // Coupe la fin de la timeline (deux occasions très rapprochées).
    const trimTo = (tt) => {
      while (segs.length && segs[segs.length - 1].t0 >= tt) {
        const s = segs.pop();
        ball = { x: s.x0, y: s.y0 };
      }
      if (segs.length) {
        const s = segs[segs.length - 1];
        if (s.t1 > tt) s.t1 = tt;
        ball = { x: s.x1, y: s.y1 };
      }
      t = tt;
    };

    // Circulation : conduites + passes, librement (pertes de balle possibles)
    // ou orientée vers `aim` = {x, y, side} (montée vers une occasion).
    function circulate(endT, aim) {
      while (t < endT - 0.03 && segs.length < 1800) {
        const oriented = aim && poss === aim.side;
        const adv = oriented
          ? { x: clamp(ball.x + (aim.x - ball.x) * 0.30 + (rng() - 0.5) * 4, 3, 97),
              y: clamp(ball.y + (aim.y - ball.y) * 0.30 + (rng() - 0.5) * 4, 4, 60) }
          : { x: clamp(ball.x + dirOf(poss) * (2 + rng() * 5), 4, 96),
              y: clamp(ball.y + (rng() - 0.5) * 7, 5, 59) };
        carry(adv, Math.min(endT - t, 0.5 + rng() * 1.1));
        if (t >= endT - 0.03) break;
        let rec;
        if (!aim && rng() < 0.18) {
          // interception : la possession change de camp
          poss = poss === "a" ? "b" : "a";
          rec = rank(outfield(poss), ball)[0];
        } else {
          const goalward = oriented ? aim : { x: clamp(ball.x + dirOf(poss) * 16, 4, 96), y: ball.y };
          const mates = outfield(poss).filter((d) => d !== holder);
          const ranked = rank(mates, goalward);
          rec = ranked[Math.floor(rng() * Math.min(3, ranked.length))] || holder;
        }
        const spot = {
          x: clamp((rec.hx + ball.x) / 2 + dirOf(poss) * 4 + (rng() - 0.5) * 6, 3, 97),
          y: clamp((rec.hy + ball.y) / 2 + (rng() - 0.5) * 6, 4, 60),
        };
        flyTo(rec, spot, 32, Math.max(0.2, endT - t));
      }
    }

    // engagement du coup d'envoi
    push("dead", 0.25, { x: 50, y: 32 }, holder);

    for (const ev of events) {
      const isPen = penLive && ev.pen;
      const LEAD = isPen ? 0 : 0.7;   // durée de vol de la frappe
      const arrive = ev.m - LEAD;     // le tireur doit avoir le ballon ici
      const spot = { x: ev.x, y: ev.y };
      const shooter = ev.shooter || rank(outfield(ev.side), spot)[0];
      ev.shooter = shooter;
      if (arrive - 0.9 < t) trimTo(Math.max(0.1, arrive - 0.9));
      // jeu libre, puis montée de l'équipe qui va se créer l'occasion
      circulate(Math.min(Math.max(t, ev.m - 5), arrive - 0.55), null);
      poss = ev.side;
      circulate(arrive - 0.55, { x: spot.x, y: spot.y, side: ev.side });
      // passe décisive : le tireur reçoit sur le point de tir
      if (holder !== shooter || Math.hypot(ball.x - spot.x, ball.y - spot.y) > 2.5) {
        flyTo(shooter, spot, 40, Math.max(0.18, arrive - 0.12 - t));
      }
      if (t < arrive) carry(spot, arrive - t); // il arme sa frappe / pose le ballon
      // issue de la frappe
      const right = ev.side === "a";
      let end;
      if (ev.type === "goal") end = { x: right ? 99.4 : 0.6, y: 29 + rng() * 6 };
      else if (ev.type === "saved") end = { x: right ? 96.6 : 3.4, y: 29.5 + rng() * 5 };
      else if (ev.type === "post") end = { x: right ? 98.6 : 1.4, y: rng() < 0.5 ? 26.4 : 37.6 };
      else end = { x: right ? 99.6 : 0.4, y: rng() < 0.5 ? 17 : 45 };
      ev.end = end;
      if (isPen) { t = ev.m; ball = end; } // la scène du gel joue l'élan et le tir
      else push("shot", Math.max(0.1, ev.m - t), end, null);
      // la suite : engagement, relance du gardien ou dégagement du rebond
      const def = right ? "b" : "a";
      poss = def;
      if (ev.type === "goal") {
        holder = rank(outfield(def), { x: 50, y: 32 })[0];
        flyTo(holder, { x: 50, y: 32 }, 44, 0.5);
        push("dead", 0.55, { x: 50, y: 32 }, holder);
      } else if (ev.type === "post") {
        holder = rank(outfield(def), ball)[0];
        flyTo(holder, { x: clamp(holder.hx, 4, 96), y: clamp(holder.hy, 5, 59) }, 30, 0.6);
      } else {
        holder = gkOf(def);
        flyTo(holder, { x: holder.hx, y: holder.hy }, 40, 0.5);
        push("dead", 0.7, { x: holder.hx, y: holder.hy }, holder);
      }
    }
    circulate(dur - 0.2, null);
    push("dead", 2, ball, holder);
    return segs;
  }

  // Segment actif à l'instant t (cache d'index : lecture séquentielle).
  function segAt(st, tf) {
    const segs = st.segs;
    let i = clamp(st.segIdx, 0, segs.length - 1);
    while (i > 0 && tf < segs[i].t0) i--;
    while (i < segs.length - 1 && tf >= segs[i].t1) i++;
    st.segIdx = i;
    return segs[i];
  }
  function ballAt(seg, tf) {
    const d = seg.t1 - seg.t0;
    let u = d > 0 ? clamp((tf - seg.t0) / d, 0, 1) : 1;
    // inertie : le ballon part vite puis freine (frottement)
    if (seg.mode === "fly") u = 1 - Math.pow(1 - u, 1.7);
    else if (seg.mode === "shot") u = 1 - Math.pow(1 - u, 1.45);
    return { x: seg.x0 + (seg.x1 - seg.x0) * u, y: seg.y0 + (seg.y1 - seg.y0) * u };
  }

  // Motif SVG reprenant le maillot (rayures, cerceaux, écharpe, moitiés).
  function kitPattern(id, kit) {
    const p = kit.p, sc = kit.s || "#ffffff", pat = kit.pat || "plain";
    let inner = `<rect width="1" height="1" fill="${p}"/>`;
    if (pat === "stripes") inner += `<rect x="0.12" width="0.16" height="1" fill="${sc}"/><rect x="0.44" width="0.16" height="1" fill="${sc}"/><rect x="0.76" width="0.16" height="1" fill="${sc}"/>`;
    else if (pat === "hoops") inner += `<rect y="0.12" width="1" height="0.16" fill="${sc}"/><rect y="0.44" width="1" height="0.16" fill="${sc}"/><rect y="0.76" width="1" height="0.16" fill="${sc}"/>`;
    else if (pat === "sash") inner += `<rect x="-0.3" y="0.38" width="1.6" height="0.24" transform="rotate(45 0.5 0.5)" fill="${sc}"/>`;
    else if (pat === "halves") inner += `<rect x="0.5" width="0.5" height="1" fill="${sc}"/>`;
    return `<pattern id="${id}" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1">${inner}</pattern>`;
  }

  // ------------------------------------------------------------------
  // Montage : construit la scène (22 joueurs + ballon) et retourne
  // l'instance { draw(clock, now, livePen), dots, penLive, penDone }.
  // ------------------------------------------------------------------
  function mount(stage, cfg) {
    const rng = rngOf(cfg.seed >>> 0);
    const mk = (team, side) => team.dots.map((d) => ({
      name: d.n, pos: d.pos, side, hx: d.p.x, hy: d.p.y, x: d.p.x, y: d.p.y,
      w1: 0.4 + rng() * 0.6, w2: 0.4 + rng() * 0.6, ph1: rng() * 6.28, ph2: rng() * 6.28,
    }));
    const dots = mk(cfg.a, "a").concat(mk(cfg.b, "b"));
    dots.forEach((d, i) => { d.idx = i; });
    // Continuité : lors d'un rebuild en cours de match (penalty résolu,
    // consigne tactique…), chacun repart de sa position actuelle.
    if (cfg.prev) {
      for (const d of dots) {
        const o = cfg.prev.find((x) => x.name === d.name && x.side === d.side);
        if (o) { d.x = o.x; d.y = o.y; }
      }
    }
    const events = (cfg.events || [])
      .filter((e) => e.type === "goal" || e.type === "saved" || e.type === "off" || e.type === "post")
      .slice().sort((u, v) => u.m - v.m)
      .map((e) => ({
        m: e.m, type: e.type, side: e.side, pen: !!e.pen, scorer: e.scorer,
        x: clamp(e.x, 4, 96), y: clamp(e.y * 0.64, 6, 58),
        shooter: dots.find((d) => d.side === e.side && d.name === e.scorer) || null,
        end: null,
      }));

    const svgDots = dots.map((d, i) => {
      // gardien en couleur unie cerclée de jaune pour rester lisible
      const fill = d.pos === "GK" ? (d.side === "a" ? cfg.a.kit : cfg.b.kit) : `url(#simkit${d.side})`;
      return `<circle id="simd${i}" cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="2" fill="${fill}" stroke="${d.pos === "GK" ? "#ffd54a" : "rgba(255,255,255,.6)"}" stroke-width="${d.pos === "GK" ? 0.6 : 0.4}"/>`;
    }).join("");
    stage.innerHTML = `<div class="fm-pitch replay"><svg viewBox="0 0 100 64" preserveAspectRatio="none">
      <defs>${kitPattern("simkita", cfg.a.kitFull)}${kitPattern("simkitb", cfg.b.kitFull)}</defs>
      ${cfg.linesSvg || ""}${svgDots}
      <circle id="sim-ball" cx="50" cy="32" r="1.15" fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width="0.3"/>
    </svg></div>`;
    dots.forEach((d, i) => { d.el = stage.querySelector("#simd" + i); });

    const st = {
      dots, events, dur: cfg.dur || 90,
      segs: buildTimeline(dots, events, cfg.dur || 90, rng, !!cfg.penLive),
      segIdx: 0, lastNow: 0, presserIdx: -1, poss: "a",
      ballEl: stage.querySelector("#sim-ball"),
      penLive: !!cfg.penLive, penKey: null, penT0: 0, penDone: false,
      onPenReveal: cfg.onPenReveal || function () {},
    };

    const setBall = (x, y) => {
      st.ballEl.setAttribute("cx", clamp(x, 0.5, 99.5).toFixed(2));
      st.ballEl.setAttribute("cy", clamp(y, 2, 62).toFixed(2));
    };
    // Course vers (tx,ty), plafonnée à sp unités/seconde, avec INERTIE :
    // accélération progressive, virages arrondis, arrivée amortie — et un
    // léger transfert d'appuis à l'arrêt (lent, pas un tremblement).
    // d.vx/d.vy = vitesse courante (unités/s), sert aussi à orienter le ballon.
    const step = (d, tx, ty, sp, dt, now, wob) => {
      const w = wob == null ? 0.35 : wob;
      tx += Math.sin((now / 1500) * (0.6 + d.w1) + d.ph1) * w;
      ty += Math.cos((now / 1700) * (0.6 + d.w2) + d.ph2) * w;
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 0.0001;
      const want = Math.min(dist * 3.2, sp); // on freine en approche
      const k = 1 - Math.exp(-dt * 5.5);     // inertie de course
      d.vx = (d.vx || 0) + ((dx / dist) * want - (d.vx || 0)) * k;
      d.vy = (d.vy || 0) + ((dy / dist) * want - (d.vy || 0)) * k;
      d.x = clamp(d.x + d.vx * dt, 2.5, 97.5);
      d.y = clamp(d.y + d.vy * dt, 3, 61);
      d.el.setAttribute("cx", d.x.toFixed(2));
      d.el.setAttribute("cy", d.y.toFixed(2));
    };
    const resetR = (d) => { if (d.el.getAttribute("r") !== "2") d.el.setAttribute("r", "2"); };

    // ---- Scène : célébration d'un but (l'horloge est figée) ----
    function celebrate(mc, now, dt) {
      const h = mc.holding;
      const ev = st.events.find((e) => e.type === "goal" && e.m === h.m && e.side === h.side);
      const end = (ev && ev.end) || { x: 50, y: 32 };
      const scorer = ev && ev.shooter;
      const right = ev ? ev.side === "a" : true;
      const cel = { x: clamp(end.x - (right ? 12 : -12), 4, 96), y: end.y < 32 ? 11 : 53 };
      const mates = scorer ? st.dots.filter((d) => d.side === scorer.side && d !== scorer && d.pos !== "GK")
        .sort((u, v) => Math.hypot(u.x - cel.x, u.y - cel.y) - Math.hypot(v.x - cel.x, v.y - cel.y)).slice(0, 2) : [];
      for (const d of st.dots) {
        if (d === scorer) {
          d.el.setAttribute("r", (2 + Math.abs(Math.sin(mc.holdT * Math.PI * 3)) * 0.9).toFixed(2));
          step(d, cel.x, cel.y, 10, dt, now, 0.3);
        } else if (mates.indexOf(d) >= 0) {
          resetR(d);
          step(d, cel.x + (d.idx % 2 ? 3 : -3), cel.y + (d.idx % 3) - 1, 8.5, dt, now, 0.3);
        } else if (ev && d.side === ev.side) {
          resetR(d);
          step(d, d.x + (cel.x - d.x) * 0.15, d.y + (cel.y - d.y) * 0.15, 3, dt, now, 0.4);
        } else {
          resetR(d); // les battus regagnent leur camp, tête basse
          step(d, d.hx, d.hy, 2.5, dt, now, 0.3);
        }
      }
      setBall(end.x, end.y);
    }

    // ---- Scène : fenêtre de penalty (suspense puis révélation) ----
    function penScene(mc, now, dt, lp) {
      const ev = mc.holding;
      const right = ev.side === "a", dir = right ? 1 : -1;
      const spot = { x: right ? 90 : 10, y: 32 };
      const key = ev.m + "|" + ev.side;
      if (st.penKey !== key) { st.penKey = key; st.penT0 = 0; st.penDone = false; }
      const kicker = st.dots.find((d) => d.side === ev.side && d.name === ev.scorer)
        || st.dots.find((d) => d.side === ev.side && d.pos === "FWD")
        || st.dots.find((d) => d.side === ev.side && d.pos !== "GK");
      const gk = st.dots.find((d) => d.side !== ev.side && d.pos === "GK");

      let ball = { x: spot.x, y: spot.y };
      let kickTo = { x: spot.x - dir * 5, y: spot.y + 0.6 }, kickSp = 9;
      let gkTo = { x: right ? 96.9 : 3.1, y: 32 + Math.sin(now / 260) * 1.5 }, gkSp = 4.5;
      const resolved = !ev.pending && ev.type !== "pen";
      if (resolved) {
        if (!st.penT0) st.penT0 = now;
        const tt = (now - st.penT0) / 1000;
        const yOf = (c) => (c === "L" ? 27.2 : c === "R" ? 36.8 : 32);
        const dirC = (lp && lp.dir) || (ev.type === "off" ? "R" : "C");
        const diveC = (lp && lp.dive) || (ev.type === "saved" ? dirC : (dirC === "L" ? "R" : "L"));
        let end;
        if (ev.type === "goal") end = { x: right ? 99.2 : 0.8, y: yOf(dirC) };
        else if (ev.type === "saved") end = { x: right ? 96.6 : 3.4, y: yOf(dirC) };
        else end = { x: right ? 99.7 : 0.3, y: dirC === "L" ? 19.5 : 44.5 };
        const RUN = 1.0, FLY = 0.45; // secondes réelles : élan puis vol
        if (tt < RUN) { kickTo = { x: spot.x - dir * (5 - 4 * (tt / RUN)), y: spot.y }; kickSp = 11; }
        else {
          kickTo = { x: spot.x - dir * 1.4, y: spot.y }; kickSp = 8;
          const u = clamp((tt - RUN) / FLY, 0, 1);
          const uu = 1 - Math.pow(1 - u, 1.5);
          ball = { x: spot.x + (end.x - spot.x) * uu, y: spot.y + (end.y - spot.y) * uu };
          gkTo = { x: right ? 96.9 : 3.1, y: yOf(diveC) }; gkSp = 15;
          if (u >= 1) {
            if (!st.penDone) { st.penDone = true; st.onPenReveal(ev.type); }
            if (ev.type === "saved") { ball = end; gkTo.y = end.y; }
            if (ev.type === "goal") { kickTo = { x: clamp(spot.x - dir * 16, 4, 96), y: 13 }; kickSp = 11; }
          }
        }
        if (st.penDone && ev.type === "goal" && kicker && kicker.el)
          kicker.el.setAttribute("r", (2 + Math.abs(Math.sin(tt * 6)) * 0.8).toFixed(2));
      }

      // Placement réaliste : la foule épouse l'entrée de la surface (ligne des
      // 16 mètres + arc de cercle), pendant que quelques joueurs restent en
      // couverture vers le rond central (défenseurs du tireur, contres).
      const edge = right ? 84.6 : 15.4;
      const others = st.dots.filter((d) => d !== kicker && d !== gk && d.pos !== "GK");
      const guards = others.filter((d) => d.side === ev.side && d.pos === "DEF").slice(0, 3)
        .concat(others.filter((d) => d.side !== ev.side && d.pos === "FWD").slice(0, 2));
      const crowd = others.filter((d) => guards.indexOf(d) < 0).sort((u, v) => u.hy - v.hy);
      const nC = Math.max(1, crowd.length - 1);
      for (const d of st.dots) {
        if (!(st.penDone && d === kicker)) resetR(d);
        if (d === kicker) step(d, kickTo.x, kickTo.y, kickSp, dt, now, 0.25);
        else if (d === gk) step(d, gkTo.x, gkTo.y, gkSp, dt, now, 0.2);
        else if (d.pos === "GK") step(d, d.hx, d.hy, 4, dt, now, 0.4); // l'autre gardien reste chez lui
        else if (guards.indexOf(d) >= 0) {
          const gi = guards.indexOf(d);
          step(d, 50 + dir * (8 + gi * 4), 20 + gi * 6 + (d.ph1 - 3.1) * 1.2, 8, dt, now, 0.5);
        } else {
          const i = crowd.indexOf(d);
          const ty = 15 + (i / nC) * 34 + (d.ph2 - 3.1) * 0.5;
          // bosse de l'arc de réparation au centre, double rang léger
          const bulge = 3.4 * Math.exp(-Math.pow((ty - 32) / 7, 2)) + (d.idx % 2) * 1.7;
          step(d, edge - dir * bulge + (d.ph1 - 3.1) * 0.25, ty, 11, dt, now, 0.35);
        }
      }
      setBall(ball.x, ball.y);
    }

    // ---- Frame courante ----
    st.draw = function (mc, now, lp) {
      const dt = Math.min(0.08, Math.max(0, (now - (st.lastNow || now)) / 1000));
      st.lastNow = now;

      if (mc.holding && mc.holding.pen && st.penLive) return penScene(mc, now, dt, lp);
      if (st.penKey) { st.penKey = null; st.penT0 = 0; st.penDone = false; }
      if (mc.holding) return celebrate(mc, now, dt);

      const tf = mc.ft ? st.dur : mc.minuteF;
      const seg = segAt(st, tf);
      const tb = ballAt(seg, tf);
      const holder = seg.h >= 0 && seg.mode !== "fly" ? st.dots[seg.h] : null;
      const receiver = seg.mode === "fly" && seg.h >= 0 ? st.dots[seg.h] : null;
      if (holder) st.poss = holder.side;
      else if (receiver) st.poss = receiver.side;
      const poss = st.poss;

      // anticipation : le receveur de la prochaine passe part vers son point de chute
      let nextRec = null, nextSpot = null;
      for (let j = st.segIdx + 1; j < Math.min(st.segIdx + 4, st.segs.length); j++) {
        const s2 = st.segs[j];
        if (s2.mode === "fly") {
          if (s2.h >= 0 && s2.t0 - tf < 1.6) { nextRec = st.dots[s2.h]; nextSpot = { x: s2.x1, y: s2.y1 }; }
          break;
        }
        if (s2.mode === "shot") break;
      }
      // anticipation d'occasion : si une frappe arrive bientôt, les attaquants
      // du camp concerné plongent vers la surface adverse sans attendre le ballon
      let nextShot = null, shotSide = null;
      for (let j = st.segIdx; j < st.segs.length; j++) {
        const s2 = st.segs[j];
        if (s2.t0 - tf > 8) break;
        if (s2.mode === "shot") { nextShot = s2; shotSide = s2.x1 > 50 ? "a" : "b"; break; }
      }
      // pressing : le défenseur le plus proche vient au duel (avec hystérésis)
      const defSide = poss === "a" ? "b" : "a";
      let presser = null, best = 1e9;
      for (const d of st.dots) {
        if (d.side !== defSide || d.pos === "GK") continue;
        const q = Math.hypot(d.x - tb.x, d.y - tb.y);
        if (q < best) { best = q; presser = d; }
      }
      const prev = st.dots[st.presserIdx];
      if (prev && prev.side === defSide && prev.pos !== "GK"
        && Math.hypot(prev.x - tb.x, prev.y - tb.y) < best * 1.45) presser = prev;
      st.presserIdx = presser ? presser.idx : -1;
      // soutiens : deux coéquipiers proposent une solution courte
      let sup1 = null, sup2 = null;
      if (holder && seg.mode === "carry") {
        const mates = st.dots.filter((d) => d.side === holder.side && d !== holder && d.pos !== "GK")
          .sort((u, v) => Math.hypot(u.x - holder.x, u.y - holder.y) - Math.hypot(v.x - holder.x, v.y - holder.y));
        sup1 = mates[0] || null; sup2 = mates[1] || null;
      }

      // dernier rideau de chaque équipe : sert de ligne de hors-jeu visuelle
      // et permet à la défense de monter/descendre EN BLOC, alignée
      const defsA = [], defsB = [];
      for (const d of st.dots) if (d.pos === "DEF") (d.side === "a" ? defsA : defsB).push(d);
      const lineA = defsA.length ? Math.min.apply(null, defsA.map((d) => d.x)) : 12; // a défend à gauche
      const lineB = defsB.length ? Math.max.apply(null, defsB.map((d) => d.x)) : 88; // b défend à droite
      const meanA = defsA.reduce((s, d) => s + d.hx, 0) / (defsA.length || 1);
      const meanB = defsB.reduce((s, d) => s + d.hx, 0) / (defsB.length || 1);

      // les blocs coulissent avec le ballon ; l'équipe en possession pousse
      const slideX = clamp((tb.x - 50) * 0.55, -21, 21);
      for (const d of st.dots) {
        const shiftK = d.pos === "MID" ? 0.32 : d.pos === "FWD" ? 0.22 : 0.26;
        const dirD = d.side === "a" ? 1 : -1;
        const push = (d.side === poss ? 3.5 : -5) * (d.pos === "DEF" ? 0.55 : 1);
        let tx = clamp(d.hx + slideX + dirD * push + clamp((tb.x - d.hx) * shiftK, -12, 12) * 0.5, 3, 97);
        let ty = d.hy + clamp((tb.y - d.hy) * (shiftK + 0.12), -16, 16);
        let sp = 5.2;
        if (d.pos === "GK") {
          tx = d.hx; ty = clamp(32 + (tb.y - 32) * 0.25, 25, 39); sp = 5;
          if (seg.mode === "shot" && d.side === defSide) { ty = clamp(seg.y1, 25.5, 38.5); sp = 16; } // il plonge
        } else if (d === holder) { tx = seg.x1; ty = seg.y1; sp = 8; }
        else if (d === receiver) { tx = seg.x1; ty = seg.y1; sp = 10; }
        else if (d === nextRec) { tx = nextSpot.x; ty = nextSpot.y; sp = 6.5; }
        else if (d === presser) { tx = tb.x + (d.x - tb.x) * 0.1; ty = tb.y + (d.y - tb.y) * 0.1; sp = 8.5; }
        else if (d === sup1 || d === sup2) {
          const dir = holder.side === "a" ? 1 : -1;
          tx = clamp(holder.x + dir * (d === sup1 ? 9 : -5), 3, 97);
          ty = clamp(holder.y + (d === sup1 ? -7 : 7), 4, 60);
          sp = 6;
        } else {
          if (d.pos === "DEF") {
            // ligne à plat : les défenseurs bougent ensemble, resserrés, et la
            // ligne SUIT le ballon (monte au rond central quand il s'éloigne,
            // recule quand il approche) au lieu de rester ancrée à la surface
            const mean = d.side === "a" ? meanA : meanB;
            const follow = d.side === "a"
              ? Math.max(mean + slideX * 0.85, tb.x - 27)
              : Math.min(mean + slideX * 0.85, tb.x + 27);
            const lineX = clamp(follow + dirD * push,
              d.side === "a" ? 6 : 52, d.side === "a" ? 48 : 94);
            tx = lineX + (d.hx - mean) * 0.4;
          } else if (d.pos === "FWD"
            && ((d.side === shotSide && nextShot)
              || (d.side === poss && ((poss === "a" && tb.x > 62) || (poss === "b" && tb.x < 38))))) {
            // appel dans la surface : l'attaquant plonge vers le point de tir
            // à venir (ou au niveau du ballon), dans son couloir, prêt à
            // conclure — le hors-jeu le borne plus bas
            const aimX = nextShot && d.side === shotSide ? nextShot.x0 : tb.x;
            const aimY = nextShot && d.side === shotSide ? nextShot.y0 : tb.y;
            const lane = d.hy < 24 ? -7 : d.hy > 40 ? 7 : 0;
            tx = clamp(d.side === "a" ? Math.max(tb.x + 4, aimX - 2) : Math.min(tb.x - 4, aimX + 2), 3, 97);
            ty = clamp(32 + lane + (aimY - 32) * 0.35, 4, 60);
            sp = 9;
          } else if (d.pos === "MID" && d.side === poss
            && ((poss === "a" && tb.x > 58) || (poss === "b" && tb.x < 42))) {
            // le milieu accompagne l'attaque jusqu'à l'entrée de la surface
            const depth = poss === "a" ? tb.x - 50 : 50 - tb.x;
            tx = clamp(d.hx + slideX + dirD * (3.5 + depth * 0.55), 3, 97);
            sp = 5.5;
          } else if (d.pos === "FWD" && d.side !== poss) {
            // l'attaquant qui subit ne redescend pas défendre dans sa surface
            tx = d.side === "a" ? Math.max(tx, 36) : Math.min(tx, 64);
          }
          if (d.pos === "FWD" && (d.side === poss || (nextShot && d.side === shotSide))) {
            // discipline de hors-jeu : on reste au niveau du dernier défenseur
            // (sauf si le ballon a déjà cassé la ligne)
            if (d.side === "a") tx = Math.min(tx, Math.max(lineB + 0.4, tb.x));
            else tx = Math.max(tx, Math.min(lineA - 0.4, tb.x));
          }
        }
        resetR(d);
        step(d, tx, ty, sp, dt, now);
      }
      // ballon : au pied du porteur pendant une conduite, sinon sur sa trajectoire
      if (holder && (seg.mode === "carry" || seg.mode === "dead")) {
        const vn = Math.hypot(holder.vx || 0, holder.vy || 0);
        if (vn > 0.4) setBall(holder.x + (holder.vx / vn) * 1.2, holder.y + (holder.vy / vn) * 1.2);
        else setBall(holder.x + (holder.side === "a" ? 1 : -1), holder.y);
      } else setBall(tb.x, tb.y);
    };

    return st;
  }

  return { mount };
});
