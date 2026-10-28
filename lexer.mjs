// Lecture et analyse des pages de résultats EZ Lexer (bowling.lexerbowling.com).
// Les pages sont du HTML statique fait de tableaux : on les découpe en
// tableaux → lignes → cellules, puis on repère chaque tableau par ses en-têtes.

import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'https://bowling.lexerbowling.com/salondequillesmontmorency';

// ---------- Téléchargement avec cache disque ----------

const CACHE = path.join(import.meta.dirname, 'cache');
let actifs = 0;
const attente = [];
const MAX_PARALLELE = 4;

async function creneau() {
  if (actifs < MAX_PARALLELE) { actifs++; return; }
  await new Promise(r => attente.push(r));
  actifs++;
}
function libere() { actifs--; const r = attente.shift(); if (r) r(); }

export const compteurs = { reseau: 0, cache: 0 };

// maxAgeJours : au-delà, la page est retéléchargée (Infinity = jamais).
export async function page(slug, fichier, maxAgeJours = Infinity) {
  const dest = path.join(CACHE, slug, fichier);
  if (fs.existsSync(dest)) {
    const age = (Date.now() - fs.statSync(dest).mtimeMs) / 86400000;
    if (age < maxAgeJours) { compteurs.cache++; return fs.readFileSync(dest, 'utf8'); }
  }
  await creneau();
  try {
    for (let essai = 1; ; essai++) {
      try {
        const rep = await fetch(`${BASE}/${slug}/${fichier}`);
        if (rep.status === 404 || rep.status === 403) return null;
        if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
        const html = await rep.text();
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, html);
        compteurs.reseau++;
        return html;
      } catch (e) {
        if (essai >= 3) throw new Error(`${slug}/${fichier} : ${e.message}`);
        await new Promise(r => setTimeout(r, 1500 * essai));
      }
    }
  } finally { libere(); }
}

// ---------- Texte ----------

const ACCENTS = { acute: '́', grave: '̀', circ: '̂', uml: '̈', cedil: '̧', tilde: '̃', ring: '̊' };
const ENTITES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ', laquo: '«', raquo: '»', deg: '°', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…' };

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    if (ENTITES[e] !== undefined) return ENTITES[e];
    const a = /^([a-zA-Z])(acute|grave|circ|uml|cedil|tilde|ring)$/.exec(e);
    if (a) return (a[1] + ACCENTS[a[2]]).normalize('NFC');
    return m;
  });
}

export function texte(html) {
  return decode(html.replace(/<sup>[\s\S]*?<\/sup>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Clé de comparaison des noms : sans accents, minuscules, ponctuation retirée.
export function cle(nom) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------- Tableaux ----------

// Renvoie les tableaux « feuilles » (sans tableau imbriqué) : { caption, entetes, lignes }
// où chaque ligne est une liste de cellules { t: texte, href }.
export function tableaux(html) {
  const res = [];
  const re = /<(\/?)table\b[^>]*>/gi;
  const pile = [];
  let m;
  while ((m = re.exec(html))) {
    if (!m[1]) pile.push({ debut: re.lastIndex, feuille: true });
    else {
      const t = pile.pop();
      if (!t) continue;
      if (pile.length) pile[pile.length - 1].feuille = false;
      if (t.feuille) res.push(analyseTableau(html.slice(t.debut, m.index)));
    }
  }
  return res;
}

function analyseTableau(h) {
  const cap = /<caption[^>]*>([\s\S]*?)<\/caption>/i.exec(h);
  const tab = { caption: cap ? texte(cap[1]) : '', entetes: null, lignes: [] };
  for (const tr of h.split(/<tr\b[^>]*>/i).slice(1)) {
    const cellules = [];
    let entete = false;
    for (const c of tr.matchAll(/<t([dh])\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      if (c[1].toLowerCase() === 'h') entete = true;
      const a = /href="\.\/([^"]+)"/i.exec(c[2]);
      cellules.push({ t: texte(c[2]), href: a ? a[1] : null });
    }
    if (!cellules.length) continue;
    if (entete && !tab.entetes) tab.entetes = cellules.map(c => c.t);
    else if (!entete) tab.lignes.push(cellules);
  }
  return tab;
}

function col(tab, ...noms) {
  if (!tab.entetes) return -1;
  for (const n of noms) {
    const i = tab.entetes.findIndex(e => e.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

const nombre = s => { const m = /-?\d+(?:[.,]\d+)?/.exec(s || ''); return m ? parseFloat(m[0].replace(',', '.')) : null; };

// « 4/18 1:30 PM » ou « 04-18 13:30 » → { mois, jour, heure }
export function dateLexer(s) {
  const m = /(\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?))?/i.exec(s || '');
  return m ? { mois: +m[1], jour: +m[2], heure: m[3] || '' } : null;
}

// Tableau « Ensemble des séries » : en-têtes Date, Allée, 1..n, Moy., P. cum., QA cum.
export function series(html) {
  const t = tableaux(html).find(t => col(t, 'Date') >= 0 && col(t, 'P. cum.') >= 0);
  if (!t) return [];
  const iDate = col(t, 'Date'), iAllee = col(t, 'Allée'), iMoy = col(t, 'Moy.');
  const iPc = col(t, 'P. cum.'), iQc = col(t, 'QA cum.'), iQa = col(t, 'QA');
  const iParties = t.entetes.map((e, i) => /^\d+$/.test(e) ? i : -1).filter(i => i >= 0);
  return t.lignes.map(l => ({
    date: l[iDate].t,
    d: dateLexer(l[iDate].t),
    allee: l[iAllee]?.t || '',
    parties: iParties.map(i => nombre(l[i]?.t)).filter(x => x !== null),
    moy: nombre(l[iMoy]?.t),
    qa: nombre(l[iQa]?.t),
    pCum: nombre(l[iPc]?.t),
    qaCum: nombre(l[iQc]?.t),
  })).filter(s => s.d);
}

// Valeur d'une étiquette dans le bloc « Informations » (tableau clé/valeur).
export function info(html, etiquette) {
  for (const t of tableaux(html)) for (const l of t.lignes)
    for (let i = 0; i < l.length - 1; i++)
      if (l[i].t.toLowerCase() === etiquette.toLowerCase()) return l[i + 1];
  return null;
}

// Classement / liste des équipes : Pos., Nom, Moyenne, P1..Pn, QA, Diff.
export function classementEquipes(html) {
  const res = [];
  for (const t of tableaux(html)) {
    const iNom = col(t, 'Nom'), iMoy = col(t, 'Moyenne'), iQa = col(t, 'QA'), iDiff = col(t, 'Diff.');
    if (iNom < 0 || iMoy < 0 || iQa < 0) continue;
    const iP = t.entetes.map((e, i) => /^P\d+$/.test(e) ? i : -1).filter(i => i >= 0);
    for (const l of t.lignes) {
      if (!l[iNom]?.href) continue;
      res.push({
        pos: nombre(l[0].t),
        nom: l[iNom].t,
        href: l[iNom].href,
        moyDeclaree: nombre(l[iMoy].t),
        parties: iP.map(i => nombre(l[i]?.t)).filter(x => x !== null),
        qa: nombre(l[iQa].t),
        diff: iDiff >= 0 ? nombre(l[iDiff].t) : null,
      });
    }
  }
  return res;
}

// Liste des quilleurs d'une page (playerlist ou équipe) : Nom (+ lien), Parties, Moy.
export function listeQuilleurs(html) {
  const res = [];
  for (const t of tableaux(html)) {
    const iNom = col(t, 'Nom'), iP = col(t, 'Pties', 'Parties'), iMoy = col(t, 'Moy.');
    if (iNom < 0 || iP < 0 || iMoy < 0) continue;
    for (const l of t.lignes) {
      if (!l[iNom]?.href || !/^pl/i.test(l[iNom].href)) continue;
      res.push({ nom: l[iNom].t, href: l[iNom].href, parties: nombre(l[iP].t) || 0, moy: nombre(l[iMoy].t) || 0, section: t.caption });
    }
  }
  return res;
}
