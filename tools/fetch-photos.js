#!/usr/bin/env node
/*
 * Télécharge une photo pour chaque joueur depuis Wikipedia (source libre et
 * fiable via son API) et l'enregistre dans public/photos/<id>.jpg.
 *
 * À lancer sur une machine avec accès Internet (l'environnement cloud de dev
 * bloque Wikipedia) :
 *
 *     node tools/fetch-photos.js
 *
 * Le jeu charge automatiquement public/photos/<id>.jpg pour chaque joueur ;
 * en l'absence de fichier, un avatar généré (initiales) est affiché.
 *
 * Options :
 *   --force   retélécharge même si le fichier existe déjà
 *   --lang=fr,en   ordre des Wikipédia à interroger (défaut fr,en)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const PLAYERS = require("../public/data/players.js");
const OUT = path.join(__dirname, "..", "public", "photos");
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const LANGS = (args.find((a) => a.startsWith("--lang=")) || "--lang=fr,en").split("=")[1].split(",");

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "FootballDraft/1.0 (educational project)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function thumbUrl(name, lang) {
  const api = `https://${lang}.wikipedia.org/w/api.php?action=query&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=256&format=json&titles=${encodeURIComponent(name)}`;
  const data = JSON.parse((await get(api)).toString("utf8"));
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  for (const k of Object.keys(pages)) {
    const t = pages[k].thumbnail;
    if (t && t.source) return t.source;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ok = 0, skip = 0, miss = 0;
  for (let i = 0; i < PLAYERS.length; i++) {
    const p = PLAYERS[i];
    const file = path.join(OUT, i + ".jpg");
    if (!FORCE && fs.existsSync(file)) { skip++; continue; }
    let url = null;
    for (const lang of LANGS) {
      try { url = await thumbUrl(p.n, lang); if (url) break; } catch (_) {}
    }
    if (!url) { miss++; console.log(`✗ ${p.n} (aucune image)`); await sleep(120); continue; }
    try {
      const img = await get(url);
      fs.writeFileSync(file, img);
      ok++; console.log(`✓ ${p.n} -> photos/${i}.jpg`);
    } catch (e) { miss++; console.log(`✗ ${p.n} (${e.message})`); }
    await sleep(150);
  }
  console.log(`\nTerminé : ${ok} téléchargées, ${skip} déjà présentes, ${miss} introuvables.`);
})();
