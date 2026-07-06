/*
 * FACES — portraits des joueurs, résolus côté client.
 *
 * Les photos ne sont PAS embarquées dans le dépôt : au rendu d'une carte,
 * on interroge l'API publique de Wikipédia (image d'illustration de
 * l'article, licences libres) depuis le navigateur du joueur, puis on met
 * l'URL en cache (localStorage). Si l'article ou le réseau manque, la
 * silhouette de secours reste affichée — rien ne casse hors ligne.
 *
 * Usage : <img data-face="Nom du joueur" data-country="Pays"> ; un
 * MutationObserver hydrate automatiquement toute image ajoutée au DOM.
 * ?faces=stub : portraits factices générés localement (tests sans réseau).
 */
(function (root) {
  "use strict";

  const NS = "face2:";
  const mem = Object.create(null);   // nom -> url | "x" (introuvable)
  const jobs = Object.create(null);  // nom -> { c, els[] } en attente
  let running = 0, scanQueued = false;
  const STUB = /[?&]faces=stub\b/.test(location.search);

  const cacheGet = (k) => { try { return localStorage.getItem(NS + k); } catch (e) { return null; } };
  const cacheSet = (k, v) => { try { localStorage.setItem(NS + k, v); } catch (e) {} };

  // Portrait factice déterministe (mode test hors ligne) : cadré comme une
  // vraie photo de buste, plein cadre, pour juger le rendu en fond de carte.
  function stubUrl(name) {
    const hue = [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 80'>`
      + `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>`
      + `<stop offset='0' stop-color='hsl(${hue},38%,52%)'/><stop offset='1' stop-color='hsl(${hue},42%,22%)'/></linearGradient></defs>`
      + `<rect width='60' height='80' fill='url(#g)'/>`
      + `<ellipse cx='30' cy='30' rx='11' ry='13' fill='#e8d3ba'/>`
      + `<path d='M30 41 q13 2 17 12 l3 27 h-40 l3 -27 q4 -10 17 -12 z' fill='#2c3a46'/>`
      + `<path d='M19 24 q11 -9 22 0 l-2 -9 q-9 -7 -18 0 z' fill='#3a2e24'/></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  // Cherche l'article du joueur et retourne l'URL de sa vignette.
  async function lookup(name, country) {
    const tries = [
      ["fr", name + " footballeur " + (country || "")], // pays d'abord : lève les homonymies (Ronaldo…)
      ["fr", name + " footballeur"],
      ["en", name + " footballer"],
    ];
    for (const [lang, q] of tries) {
      try {
        const u = "https://" + lang + ".wikipedia.org/w/api.php"
          + "?action=query&generator=search&gsrsearch=" + encodeURIComponent(q.trim())
          + "&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=240&format=json&origin=*";
        const r = await fetch(u);
        if (!r.ok) continue;
        const j = await r.json();
        const pages = j.query && j.query.pages;
        const pg = pages && pages[Object.keys(pages)[0]];
        const th = pg && pg.thumbnail && pg.thumbnail.source;
        if (th) return th;
      } catch (e) { return ""; } // réseau coupé : on n'insiste pas
    }
    return "";
  }

  function show(img, url) {
    img.addEventListener("load", () => img.classList.add("on"));
    img.addEventListener("error", () => img.classList.remove("on"));
    img.src = url;
  }

  function pump() {
    while (running < 4) {
      const name = Object.keys(jobs)[0];
      if (!name) return;
      const job = jobs[name]; delete jobs[name];
      running++;
      lookup(name, job.c).then((url) => {
        running--;
        mem[name] = url || "x";
        cacheSet(name, url || "x");
        if (url) job.els.forEach((el) => show(el, url));
        pump();
      });
    }
  }

  // Facepack local (modèle Football Manager) : les images déposées dans
  // public/assets/faces/ et déclarées dans index.json passent AVANT Wikipédia.
  // index.json : { "Nom exact du joueur": "fichier.png", ... }
  let pack = {};
  const packReady = fetch("assets/faces/index.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((j) => { pack = j && typeof j === "object" ? j : {}; });

  function want(img) {
    if (img.dataset.faceDone) return;
    img.dataset.faceDone = "1";
    const name = img.dataset.face;
    if (!name) return;
    packReady.then(() => {
      if (pack[name]) { show(img, "assets/faces/" + pack[name]); return; }
      if (STUB) { show(img, stubUrl(name)); return; }
      const hit = mem[name] != null ? mem[name] : cacheGet(name);
      if (hit === "x") return;
      if (hit) { mem[name] = hit; show(img, hit); return; }
      if (jobs[name]) jobs[name].els.push(img);
      else jobs[name] = { c: img.dataset.country || "", els: [img] };
      pump();
    });
  }

  function scan(rootEl) {
    (rootEl || document).querySelectorAll("img[data-face]").forEach(want);
  }

  // Hydratation automatique : un seul scan par frame même si le DOM bouge fort.
  new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; scan(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== "loading") scan();
  else document.addEventListener("DOMContentLoaded", () => scan());

  root.FACES = { scan };
})(window);
