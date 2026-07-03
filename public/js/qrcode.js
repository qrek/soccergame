/*
 * Générateur de QR code minimal et autonome (aucune dépendance).
 * Supporte : mode octet (UTF-8), versions 1 à 5, niveau de correction L,
 * bloc unique — largement suffisant pour une URL de session courte.
 * Expose QRCode.matrix(text) -> tableau 2D de booléens (true = module noir).
 */
(function (root) {
  "use strict";

  // --- GF(256), polynôme primitif 0x11D ---
  const EXP = new Array(512);
  const LOG = new Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenPoly(degree) {
    let poly = [1];
    for (let d = 0; d < degree; d++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let i = 0; i < poly.length; i++) {
        next[i] ^= poly[i];
        next[i + 1] ^= gmul(poly[i], EXP[d]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenPoly(ecLen);
    const res = data.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
      }
    }
    return res.slice(data.length);
  }

  // Capacités niveau L, bloc unique : [version] = {ec, data, align}
  const VERSIONS = {
    1: { ec: 7, data: 19, align: [] },
    2: { ec: 10, data: 34, align: [6, 18] },
    3: { ec: 15, data: 55, align: [6, 22] },
    4: { ec: 20, data: 80, align: [6, 26] },
    5: { ec: 26, data: 108, align: [6, 30] },
  };

  function toUtf8Bytes(str) {
    const out = [];
    for (const ch of str) {
      let cp = ch.codePointAt(0);
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) {
        out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      } else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }
    return out;
  }

  function chooseVersion(len) {
    for (let v = 1; v <= 5; v++) if (VERSIONS[v].data - 2 >= len) return v;
    throw new Error("Données trop longues pour le QR (max ~106 octets)");
  }

  // Construit le flux de codewords (données + correction d'erreur).
  function buildCodewords(bytes, version) {
    const info = VERSIONS[version];
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);          // mode octet
    push(bytes.length, 8);    // compteur (8 bits pour v1-9)
    for (const b of bytes) push(b, 8);
    // terminateur
    const cap = info.data * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    // codewords
    const dataCw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataCw.push(byte);
    }
    // remplissage
    const pads = [0xec, 0x11];
    let pi = 0;
    while (dataCw.length < info.data) dataCw.push(pads[pi++ % 2]);
    const ecCw = rsEncode(dataCw, info.ec);
    return dataCw.concat(ecCw);
  }

  // --- Matrice ---
  function makeMatrix(version) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));

    function setFn(r, c, v) { m[r][c] = v; fn[r][c] = true; }

    // Motifs de détection (finder) + séparateurs
    function finder(r, c) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6);
          const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFn(rr, cc, inRing || inCore);
        }
      }
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing
    for (let i = 8; i < size - 8; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }

    // Alignement
    const al = VERSIONS[version].align;
    for (const r of al) {
      for (const c of al) {
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setFn(r + dr, c + dc, on);
          }
        }
      }
    }

    // Module sombre
    setFn(version * 4 + 9, 8, true);

    // Réserver les zones de format
    for (let i = 0; i < 9; i++) {
      if (!fn[8][i]) fn[8][i] = true;
      if (!fn[i][8]) fn[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
      if (!fn[8][size - 1 - i]) fn[8][size - 1 - i] = true;
      if (!fn[size - 1 - i][8]) fn[size - 1 - i][8] = true;
    }
    return { m, fn, size };
  }

  function placeData(m, fn, size, codewords) {
    const bits = [];
    for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    let idx = 0, upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // sauter la colonne de timing
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (fn[row][cc]) continue;
          m[row][cc] = idx < bits.length ? bits[idx] === 1 : false;
          idx++;
        }
      }
      upward = !upward;
    }
  }

  function maskFn(id, r, c) {
    switch (id) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
    return false;
  }

  // BCH pour le format info (niveau L = 01).
  function formatBits(mask) {
    const data = (0b01 << 3) | mask; // 5 bits : niveau L + masque
    let rem = data << 10;
    const g = 0b10100110111;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= g << (i - 10);
    let bits = ((data << 10) | rem) ^ 0b101010000010010;
    return bits & 0x7fff;
  }

  function placeFormat(m, size, mask) {
    const fmt = formatBits(mask);
    const bit = (i) => ((fmt >> i) & 1) === 1;
    // Bande horizontale/verticale près du finder haut-gauche
    for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
    m[8][7] = bit(6);
    m[8][8] = bit(7);
    m[7][8] = bit(8);
    for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);
    // Copies près des autres finders
    for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = bit(i);
    for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = bit(i);
  }

  function penalty(m, size) {
    let p = 0;
    // Règle 1 : séries de 5+
    for (let r = 0; r < size; r++) {
      let runC = 1, runR = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { runC++; if (runC === 5) p += 3; else if (runC > 5) p++; }
        else runC = 1;
        if (m[c][r] === m[c - 1][r]) { runR++; if (runR === 5) p += 3; else if (runR > 5) p++; }
        else runR = 1;
      }
    }
    // Règle 2 : blocs 2x2
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++)
        if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
    // Règle 4 : équilibre noir/blanc
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
    const ratio = (dark * 100) / (size * size);
    p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
    return p;
  }

  function matrix(text) {
    const bytes = toUtf8Bytes(text);
    const version = chooseVersion(bytes.length);
    const codewords = buildCodewords(bytes, version);
    const { m, fn, size } = makeMatrix(version);
    placeData(m, fn, size, codewords);

    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const cand = m.map((row) => row.slice());
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (!fn[r][c] && maskFn(mask, r, c)) cand[r][c] = !cand[r][c];
      placeFormat(cand, size, mask);
      const score = penalty(cand, size);
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    return best.map((row) => row.map((v) => v === true));
  }

  const QRCode = { matrix };
  if (typeof module !== "undefined" && module.exports) module.exports = QRCode;
  else root.QRCode = QRCode;
})(typeof window !== "undefined" ? window : this);
