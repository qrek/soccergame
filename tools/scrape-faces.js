#!/usr/bin/env node
/*
 * Scrape les photos Wikipédia de TOUS les joueurs vers le facepack local.
 *
 * À lancer depuis TA machine (le conteneur de dev n'a pas accès à Wikipédia) :
 *   node tools/scrape-faces.js            # tous les joueurs manquants
 *   node tools/scrape-faces.js --force    # re-télécharge aussi les existants
 *
 * Pour chaque joueur de public/data/players.js :
 *   1. recherche l'article (fr puis en, requête désambiguïsée par pays) ;
 *   2. télécharge la vignette (480 px) dans public/assets/faces/ ;
 *   3. met à jour index.json (nom -> fichier) et credits.json
 *      (fichier -> licence/auteur, requis par les licences CC des photos).
 *
 * Reprise sur erreur : les joueurs déjà présents dans index.json sont sautés
 * (sauf --force). Respecte l'étiquette Wikimedia : 1 requête à la fois,
 * User-Agent identifié, ~200 ms de pause entre requêtes, et back-off
 * exponentiel qui honore l'en-tête Retry-After sur throttling (HTTP 429/503).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const PLAYERS = require("../public/data/players.js");
const OUT_DIR = path.join(__dirname, "..", "public", "assets", "faces");
const INDEX_F = path.join(OUT_DIR, "index.json");
const CREDITS_F = path.join(OUT_DIR, "credits.json");
const UA = "FootballDraftGame/1.0 (jeu privé entre amis ; facepack Wikipédia)";
const FORCE = process.argv.includes("--force");
const PACE = 200;        // pause de base entre requêtes (ms)
const MAX_RETRY = 6;     // nombre de tentatives sur throttling / erreur réseau
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return dflt; } };

// fetch avec back-off exponentiel : réessaie sur 429/503 (throttling) et sur
// erreur réseau, en respectant l'en-tête Retry-After quand il est présent.
// Ne lève qu'après MAX_RETRY échecs, ou immédiatement sur une erreur non
// transitoire (404, etc.).
async function fetchRetry(url, label) {
  let wait = 1000;
  for (let attempt = 1; ; attempt++) {
    let r;
    try {
      r = await fetch(url, { headers: { "User-Agent": UA } });
    } catch (e) {
      if (attempt > MAX_RETRY) throw new Error(`réseau: ${e.message}`);
      console.log(`  … ${label} : erreur réseau, nouvelle tentative ${attempt}/${MAX_RETRY} dans ${Math.round(wait / 1000)}s`);
      await sleep(wait); wait = Math.min(wait * 2, 30000); continue;
    }
    if (r.status === 429 || r.status === 503) {
      if (attempt > MAX_RETRY) throw new Error(`throttling persistant (HTTP ${r.status})`);
      const ra = parseInt(r.headers.get("retry-after") || "", 10);
      const delay = Number.isFinite(ra) ? ra * 1000 : wait;
      console.log(`  … ${label} : throttling (HTTP ${r.status}), pause ${Math.round(delay / 1000)}s puis tentative ${attempt}/${MAX_RETRY}`);
      await sleep(delay); wait = Math.min(wait * 2, 30000); continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }
}

async function api(lang, params) {
  const u = `https://${lang}.wikipedia.org/w/api.php?format=json&` + new URLSearchParams(params);
  const r = await fetchRetry(u, `${lang}.wikipedia`);
  return r.json();
}

// Cherche l'article et retourne { thumb, file, lang, title } ou null.
async function findImage(name, country) {
  const tries = [
    ["fr", `${name} footballeur ${country || ""}`],
    ["fr", `${name} footballeur`],
    ["en", `${name} footballer`],
  ];
  for (const [lang, q] of tries) {
    const j = await api(lang, {
      action: "query", generator: "search", gsrsearch: q.trim(), gsrlimit: 1,
      prop: "pageimages", piprop: "thumbnail|name", pithumbsize: 480,
    });
    await sleep(PACE);
    const pages = j.query && j.query.pages;
    const pg = pages && pages[Object.keys(pages)[0]];
    if (pg && pg.thumbnail && pg.thumbnail.source) {
      return { thumb: pg.thumbnail.source, file: pg.pageimage, lang, title: pg.title };
    }
  }
  return null;
}

// Licence + auteur de l'image (extmetadata Commons).
async function imageCredits(lang, file) {
  try {
    const j = await api(lang, {
      action: "query", titles: "File:" + file, prop: "imageinfo",
      iiprop: "extmetadata|url",
    });
    await sleep(PACE);
    const pages = j.query && j.query.pages;
    const pg = pages && pages[Object.keys(pages)[0]];
    const md = pg && pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].extmetadata;
    const strip = (h) => (h && h.value ? h.value.replace(/<[^>]+>/g, "").trim() : "");
    return {
      license: strip(md && md.LicenseShortName) || "inconnue",
      artist: strip(md && md.Artist) || "inconnu",
      source: (pg && pg.imageinfo[0].descriptionurl) || "",
    };
  } catch (e) { return { license: "inconnue", artist: "inconnu", source: "" }; }
}

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const index = readJson(INDEX_F, {});
  const credits = readJson(CREDITS_F, {});
  let ok = 0, miss = 0, skip = 0;

  for (const p of PLAYERS) {
    if (!FORCE && index[p.n]) { skip++; continue; }
    try {
      const found = await findImage(p.n, p.c);
      if (!found) { console.log(`✗ ${p.n} (${p.c}) : pas de photo`); miss++; continue; }
      const ext = (found.thumb.match(/\.(jpe?g|png|webp|gif)/i) || [, "jpg"])[1].toLowerCase();
      const fname = `${slug(p.n)}.${ext === "jpeg" ? "jpg" : ext}`;
      const r = await fetchRetry(found.thumb, `téléchargement ${p.n}`);
      fs.writeFileSync(path.join(OUT_DIR, fname), Buffer.from(await r.arrayBuffer()));
      index[p.n] = fname;
      credits[fname] = Object.assign({ article: `${found.lang}.wikipedia.org — ${found.title}` },
        await imageCredits(found.lang, found.file));
      ok++;
      console.log(`✓ ${p.n} -> ${fname} [${credits[fname].license}]`);
      // sauvegarde incrémentale : interruptible sans rien perdre
      fs.writeFileSync(INDEX_F, JSON.stringify(index, null, 1));
      fs.writeFileSync(CREDITS_F, JSON.stringify(credits, null, 1));
      await sleep(PACE);
    } catch (e) {
      console.log(`! ${p.n} : ${e.message}`);
      miss++;
      await sleep(1000);
    }
  }
  console.log(`\nTerminé : ${ok} téléchargées, ${miss} introuvables/erreurs, ${skip} déjà présentes.`);
  console.log(`-> commit public/assets/faces/ puis déploie : les cartes les utiliseront en priorité.`);
})();
