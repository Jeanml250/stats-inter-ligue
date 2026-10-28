// Extraction des tournois Inter Ligue du Salon de Quilles Montmorency (EZ Lexer)
// et calcul de la moyenne de référence de chaque joueur.
//
//   node extraire.mjs                  met à jour les données et le rapport
//   node extraire.mjs --rafraichir     retélécharge toutes les pages
//   node extraire.mjs joueur "Nom"     affiche les statistiques d'un joueur
//
// Moyenne de référence d'un joueur pour un tournoi : la plus haute moyenne
// parmi les ligues du salon, calculée à la date du tournoi (minimum 20 parties
// jouées avant cette date). Si aucune ligue de la saison en cours n'atteint
// 20 parties, on prend la plus haute moyenne finale de la saison précédente
// (minimum 20 parties).

import fs from 'node:fs';
import path from 'node:path';
import * as L from './lexer.mjs';

const ICI = import.meta.dirname;
const MIN_PARTIES = 20;
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

const args = process.argv.slice(2);
const RAFRAICHIR = args.includes('--rafraichir');

// ---------- Événements ----------

function lireEvenements() {
  return fs.readFileSync(path.join(ICI, 'evenements.tsv'), 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const [nom, slug, type] = l.split('\t').map(s => s.trim()); return { nom, slug, type }; });
}

// Première année de la saison (« 2025-2026 », « 2025/2026 », « 20252026 »).
function saisonEvenement(ev) {
  for (const s of [ev.nom, ev.slug]) {
    const m = /(20\d\d)\s*[-\/]?\s*(20\d\d)/.exec(s);
    if (m && +m[2] === +m[1] + 1) return +m[1];
  }
  return null;
}

// Une saison de ligue va d'août à juillet.
const saisonDe = n => { const a = Math.floor(n / 10000), m = Math.floor(n / 100) % 100; return m >= 8 ? a : a - 1; };
const libelleSaison = a => `${a}-${a + 1}`;
const numDate = (a, m, j) => a * 10000 + m * 100 + j;
const texteDate = n => `${Math.floor(n / 10000)}-${String(Math.floor(n / 100) % 100).padStart(2, '0')}-${String(n % 100).padStart(2, '0')}`;
const aujourdHui = (() => { const d = new Date(); return numDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); })();
const age = jours => RAFRAICHIR ? 0 : jours;

// Mois et année tirés du nom du tournoi (« Inter Ligue Décembre 2024 »).
function moisAnnee(nom) {
  const k = L.cle(nom);
  const annee = +(/20\d\d/.exec(k)?.[0]);
  const mois = MOIS.findIndex(m => new RegExp(`\\b${m}\\b`).test(k)) + 1 || null;
  return { annee, mois };
}

function anneeDe(d, ref) {
  if (!ref.mois) return ref.annee;
  if (d.mois - ref.mois > 6) return ref.annee - 1;
  if (ref.mois - d.mois > 6) return ref.annee + 1;
  return ref.annee;
}

// Cherche les nouveaux tournois et les nouvelles saisons de ligue dont
// l'adresse suit le modèle habituel, et les ajoute à evenements.tsv.
async function decouvrir(evs) {
  const connus = new Set(evs.map(e => e.slug));
  const ajouts = [];
  const d = new Date();
  for (let k = -3; k <= 1; k++) {
    const x = new Date(d.getFullYear(), d.getMonth() + k, 1);
    const slug = `interligue${MOIS[x.getMonth()]}${x.getFullYear()}`;
    if (!connus.has(slug) && await L.page(slug, 'index.htm', 0)) {
      const m = MOIS[x.getMonth()];
      ajouts.push({ nom: `Inter Ligue ${m[0].toUpperCase() + m.slice(1)} ${x.getFullYear()}`, slug, type: 'interligue' });
    }
  }
  const finale = `interliguefinale${d.getFullYear()}`;
  if (!connus.has(finale) && await L.page(finale, 'index.htm', 0))
    ajouts.push({ nom: `Inter Ligue Finale ${d.getFullYear()}`, slug: finale, type: 'interligue' });

  const ligues = evs.filter(e => e.type === 'ligue');
  const derniere = Math.max(...ligues.map(saisonEvenement));
  const courante = saisonDe(aujourdHui);
  if (courante > derniere) {
    for (const e of ligues.filter(e => saisonEvenement(e) === derniere)) {
      const a = derniere, b = a + 1;
      const slug = e.slug.replace(`${a}-${b}`, `${a + 1}-${b + 1}`).replace(`${a}${b}`, `${a + 1}${b + 1}`);
      const nom = e.nom.replace(`${a}-${b}`, `${a + 1}-${b + 1}`).replace(`${a}/${b}`, `${a + 1}/${b + 1}`);
      if (slug !== e.slug && !connus.has(slug) && await L.page(slug, 'index.htm', 0))
        ajouts.push({ nom, slug, type: 'ligue' });
    }
  }
  if (ajouts.length) {
    fs.appendFileSync(path.join(ICI, 'evenements.tsv'), ajouts.map(e => `${e.nom}\t${e.slug}\t${e.type}`).join('\n') + '\n');
    for (const e of ajouts) console.log(`  + nouvel événement trouvé : ${e.nom}`);
  }
  return [...evs, ...ajouts];
}

// ---------- Tournois ----------

async function lireTournoi(ev) {
  const ref = moisAnnee(ev.nom);
  // Les tournois de l'année en cours peuvent encore être corrigés : on les relit chaque semaine.
  const maxAge = age(ref.annee >= Math.floor(aujourdHui / 10000) ? 7 : Infinity);
  const [index, liste] = await Promise.all([L.page(ev.slug, 'index.htm', maxAge), L.page(ev.slug, 'teamlist.htm', maxAge)]);
  if (!index || !liste) { console.log(`  ! ${ev.nom} : pages introuvables`); return null; }

  const positions = new Map();
  for (const r of L.classementEquipes(index)) if (!positions.has(r.href)) positions.set(r.href, r.pos);
  const inscriptions = L.classementEquipes(liste).filter(r => r.qa > 0);

  const pagesJoueurs = new Map();
  const pageJoueur = href => {
    if (!pagesJoueurs.has(href)) pagesJoueurs.set(href, L.page(ev.slug, href, maxAge).then(h => h ? L.series(h) : []));
    return pagesJoueurs.get(href);
  };

  const equipes = await Promise.all(inscriptions.map(async ins => {
    const html = await L.page(ev.slug, ins.href, maxAge);
    const seriesEquipe = html ? L.series(html) : [];
    const serie = seriesEquipe.find(s => s.parties.join() === ins.parties.join()) || seriesEquipe[0];
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(ins.nom);
    const equipe = {
      pos: positions.get(ins.href) ?? ins.pos,
      nom: ins.nom,
      ligue: m ? m[1] : ins.nom,
      responsable: m ? m[2] : '',
      moyDeclaree: ins.moyDeclaree,
      parties: ins.parties,
      qa: ins.qa,
      diff: ins.diff,
      date: serie ? numDate(anneeDe(serie.d, ref), serie.d.mois, serie.d.jour) : null,
      heure: serie?.d.heure || '',
      joueurs: [],
    };
    if (!html || !serie) return equipe;
    for (const q of L.listeQuilleurs(html)) {
      const s = (await pageJoueur(q.href)).find(s => s.date === serie.date);
      if (!s) continue;
      equipe.joueurs.push({ nom: q.nom, cle: L.cle(q.nom), parties: s.parties, qa: s.qa ?? s.parties.reduce((a, b) => a + b, 0), moy: s.moy });
    }
    return equipe;
  }));

  const dates = equipes.map(e => e.date).filter(Boolean);
  if (!dates.length) { console.log(`  ! ${ev.nom} : aucune date de jeu lisible`); return null; }
  return { slug: ev.slug, nom: ev.nom, debut: Math.min(...dates), fin: Math.max(...dates), equipes };
}

// ---------- Ligues ----------

// Index des joueurs de chaque saison : clé du nom → [{ ligue, slug, href, parties, moy }]
async function indexLigues(evs, saisonsVoulues) {
  const idx = new Map();
  const courante = saisonDe(aujourdHui);
  const ligues = evs.filter(e => e.type === 'ligue' && saisonsVoulues.has(saisonEvenement(e)));
  await Promise.all(ligues.map(async ev => {
    const saison = saisonEvenement(ev);
    const html = await L.page(ev.slug, 'playerlist.htm', age(saison >= courante ? 1 : Infinity));
    if (!html) { console.log(`  ! ${ev.nom} : liste des quilleurs introuvable`); return; }
    for (const q of L.listeQuilleurs(html)) {
      if (q.parties <= 0) continue;
      const k = `${saison}|${L.cle(q.nom)}`;
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push({ nom: q.nom, ligue: ev.nom.replace(/\s*\(?\s*20\d\d\s*[-\/]?\s*20\d\d\s*\)?\s*$/, ''), slug: ev.slug, saison, href: q.href, parties: q.parties, moy: q.moy });
    }
  }));
  return idx;
}

// ---------- Noms écrits différemment ----------

// correspondances.tsv : « Nom au tournoi <tab> Nom en ligue ». Un nom en ligue
// vide interdit le rapprochement automatique pour ce joueur.
function lireCorrespondances() {
  const f = path.join(ICI, 'correspondances.tsv');
  const m = new Map();
  if (!fs.existsSync(f)) return m;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [tournoi, ligue = ''] = l.split('\t').map(s => s.trim());
    if (tournoi) m.set(L.cle(tournoi), ligue);
  }
  return m;
}

// Nom sans la précision entre parenthèses : « Pierre Cote (Soir) » → « pierre cote ».
const cleSansPrecision = nom => L.cle(nom.replace(/\([^)]*\)/g, ' '));

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++)
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = cour;
  }
  return prec[b.length];
}

// « Super Kool » ↔ « Super Kool », « Formule 1 » ↔ « La formule 1 », « SAM » ↔ « S.A.M »,
// « C. Jardin Aeroport » ↔ « Cntre Jardins Aeroport ».
const MOTS_VIDES = new Set(['la', 'le', 'les', 'l', 'ligue', 'du', 'de', 'des', 'd', 'station', 'centre', 'cntre', 'c']);
function motsLigue(nom) { return L.cle(nom).split(' ').filter(m => m && !MOTS_VIDES.has(m)).map(m => m.replace(/s$/, '')); }
function memeLigue(a, b) {
  const ma = motsLigue(a), mb = motsLigue(b);
  const ja = ma.join(''), jb = mb.join('');
  if (!ja || !jb) return false;
  if (ja.includes(jb) || jb.includes(ja)) return true;
  const communs = ma.filter(m => mb.some(n => m === n || (m.length > 4 && distance(m, n) <= 1))).length;
  return communs / Math.max(ma.length, mb.length) >= 0.5;
}

// Cherche dans les ligues des saisons voulues un nom proche de celui du tournoi.
// Renvoie le nom retenu, ou la liste des candidats si le choix est ambigu.
// liguesEquipes : ligues de toutes les équipes du joueur dans ce tournoi, pour qu'il ait
// la même moyenne de référence quelle que soit l'équipe.
function rapprocher(idxNoms, saisons, nomTournoi, liguesEquipes) {
  const ligueDuJoueur = l => liguesEquipes.some(x => memeLigue(l, x));
  const cible = cleSansPrecision(nomTournoi);
  const precision = /\(/.test(nomTournoi);
  const seuil = cible.length >= 10 ? 2 : 1;
  const trouves = new Map();
  for (const s of saisons) for (const [cleNom, entrees] of idxNoms.get(s) || []) {
    const d = distance(cible, cleSansPrecision(entrees[0].nom));
    if (d > seuil || cleNom === L.cle(nomTournoi)) continue;
    if (!trouves.has(cleNom)) trouves.set(cleNom, { cle: cleNom, nom: entrees[0].nom, d, ligues: new Set() });
    for (const e of entrees) trouves.get(cleNom).ligues.add(e.ligue);
  }
  const tous = [...trouves.values()];
  if (!precision) {
    const dansLigue = tous.filter(c => [...c.ligues].some(ligueDuJoueur));
    const retenus = dansLigue.length ? dansLigue : tous;
    return { choix: retenus.length === 1 ? retenus[0] : null, candidats: tous };
  }
  // Une précision entre parenthèses (« Richard Lapointe (Bot) ») distingue des homonymes :
  // on ne garde que les ligues désignées par la précision ou la ligue de l'équipe.
  const suffixe = /\(([^)]*)\)/.exec(nomTournoi)[1];
  const permise = l => designeLigue(suffixe, l) || ligueDuJoueur(l);
  const retenus = tous.filter(c => [...c.ligues].some(permise));
  if (retenus.length !== 1) return { choix: null, candidats: tous };
  const choix = { ...retenus[0], ligues: new Set([...retenus[0].ligues].filter(permise)) };
  return { choix, liguesPermises: [...choix.ligues], candidats: tous };
}

// « PT » → Passe-Temps, « Bot » → Bottines Roulantes, « Ret » → Retraités…, « mixte » → Mixte du jeudi.
function designeLigue(suffixe, ligue) {
  const s = L.cle(suffixe).replace(/ /g, '');
  if (s.length < 2) return motsLigue(ligue).map(m => m[0]).join('') === s;
  const mots = L.cle(ligue).split(' ').filter(m => m && !MOTS_VIDES.has(m));
  return mots.some(m => m.startsWith(s)) || mots.map(m => m[0]).join('') === s;
}

// ---------- Homonymes ----------

// homonymes.tsv : « Nom <tab> Ligue, Ligue… ». Chaque ligne décrit une personne :
// ce nom, dans ces ligues. Les ligues non citées appartiennent à l'autre personne.
function lireHomonymes() {
  const f = path.join(ICI, 'homonymes.tsv');
  const m = new Map();
  if (!fs.existsSync(f)) return m;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [nom, ligues = ''] = l.split('\t').map(s => s.trim());
    const liste = ligues.split(',').map(s => s.trim()).filter(Boolean);
    if (!nom || !liste.length) continue;
    if (!m.has(L.cle(nom))) m.set(L.cle(nom), []);
    m.get(L.cle(nom)).push({ ligues: liste });
  }
  return m;
}

// Pour un nom déclaré homonyme : la personne dont une ligue correspond à une équipe
// du joueur (ou à sa précision entre parenthèses), sinon « l'autre » personne.
function choisirHomonyme(homonymes, cleNom, liguesEquipes, nomTournoi, liguesDuNom) {
  const groupes = homonymes.get(cleNom);
  if (!groupes) return null;
  const suffixe = /\(([^)]*)\)/.exec(nomTournoi)?.[1];
  const dansGroupe = (g, l) => g.ligues.some(gl => memeLigue(l, gl));
  const groupe = groupes.find(g => g.ligues.some(gl => liguesEquipes.some(x => memeLigue(gl, x)) || (suffixe && designeLigue(suffixe, gl))));
  const connues = [...(liguesDuNom.get(cleNom) || [])];
  if (groupe) return { permises: connues.filter(l => dansGroupe(groupe, l)), etiquette: groupe.ligues.join(', ') };
  return { permises: connues.filter(l => !groupes.some(g => dansGroupe(g, l))), etiquette: null };
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Créneaux de jeu de chaque ligue (jour de la semaine + heure de début), tirés des
// dates avec heure de sa page d'accueil : « saison|ligue » → { creneaux: [{ jour, minutes }], texte }
async function horairesLigues(evs, saisons) {
  const res = new Map();
  const courante = saisonDe(aujourdHui);
  await Promise.all(evs.filter(e => e.type === 'ligue' && saisons.has(saisonEvenement(e))).map(async ev => {
    const saison = saisonEvenement(ev);
    const index = await L.page(ev.slug, 'index.htm', age(saison >= courante ? 7 : Infinity));
    if (!index) return;
    const creneaux = new Map();
    for (const m of L.texte(index).matchAll(/\b(\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}):(\d{2})\s*([AP]M)?/gi)) {
      const mois = +m[1], jour = +m[2];
      if (mois < 1 || mois > 12 || jour < 1 || jour > 31) continue;
      const h = +m[3] % 12 + (m[5] ? (/p/i.test(m[5]) ? 12 : 0) : +m[3] >= 12 ? 12 : 0);
      const c = { jour: new Date(mois >= 8 ? saison : saison + 1, mois - 1, jour).getDay(), minutes: h * 60 + +m[4] };
      creneaux.set(`${c.jour}|${c.minutes}`, c);
    }
    if (!creneaux.size) return;
    const ligue = ev.nom.replace(/\s*\(?\s*20\d\d\s*[-\/]?\s*20\d\d\s*\)?\s*$/, '');
    const liste = [...creneaux.values()];
    res.set(`${saison}|${ligue}`, { creneaux: liste, texte: liste.map(c => `${JOURS[c.jour]} ${Math.floor(c.minutes / 60)} h ${String(c.minutes % 60).padStart(2, '0')}`).join(', ') });
  }));
  return res;
}

// Un même nom dans deux ligues qui jouent au même moment, ou avec des moyennes
// très différentes, désigne probablement deux personnes.
function detecterHomonymes(idx, horaires, participants, homonymes) {
  const parNom = new Map();
  for (const [k, entrees] of idx) {
    const cleNom = k.slice(k.indexOf('|') + 1);
    if (!participants.has(cleNom) || homonymes.has(cleNom) || entrees.length < 2) continue;
    for (let a = 0; a < entrees.length; a++) for (let b = a + 1; b < entrees.length; b++) {
      const x = entrees[a], y = entrees[b];
      if (x.ligue === y.ligue) continue;
      const hx = horaires.get(`${x.saison}|${x.ligue}`), hy = horaires.get(`${y.saison}|${y.ligue}`);
      const conflit = hx && hy && hx.creneaux.some(a => hy.creneaux.some(b => a.jour === b.jour && Math.abs(a.minutes - b.minutes) < 150));
      let raison = null;
      if (conflit && x.parties >= 6 && y.parties >= 6)
        raison = `horaires en conflit : ${x.ligue} (${hx.texte}) et ${y.ligue} (${hy.texte})`;
      else if (x.parties >= 12 && y.parties >= 12 && Math.abs(x.moy - y.moy) >= 30)
        raison = `écart de moyenne : ${x.ligue} ${x.moy} et ${y.ligue} ${y.moy}`;
      if (!raison) continue;
      if (!parNom.has(cleNom)) parNom.set(cleNom, { nom: x.nom, raisons: new Set(), ligues: new Set() });
      const p = parNom.get(cleNom);
      p.raisons.add(`${libelleSaison(x.saison)} — ${raison}`);
      p.ligues.add(x.ligue).add(y.ligue);
    }
  }
  return [...parNom.values()];
}

const seriesLigue = new Map();
function seriesDeLigue(c) {
  const k = `${c.slug}/${c.href}`;
  if (!seriesLigue.has(k)) {
    const courante = saisonDe(aujourdHui);
    seriesLigue.set(k, L.page(c.slug, c.href, age(c.saison >= courante ? 1 : Infinity)).then(h => h ? L.series(h) : []));
  }
  return seriesLigue.get(k);
}

// Moyenne de référence d'un joueur à une date donnée.
async function moyenneReference(idx, cleNom, date, liguesPermises = null) {
  const saison = saisonDe(date);
  const candidats = [];
  const permise = c => !liguesPermises || liguesPermises.includes(c.ligue);
  for (const c of idx.get(`${saison}|${cleNom}`) || []) {
    if (c.parties < MIN_PARTIES || !permise(c)) continue;
    const avant = (await seriesDeLigue(c)).filter(s => {
      const a = s.d.mois >= 8 ? c.saison : c.saison + 1;
      return numDate(a, s.d.mois, s.d.jour) < date;
    }).at(-1);
    if (avant && avant.pCum >= MIN_PARTIES)
      candidats.push({ ligue: c.ligue, saison: libelleSaison(c.saison), parties: avant.pCum, moy: +(avant.qaCum / avant.pCum).toFixed(2), methode: 'à la date' });
  }
  if (!candidats.length)
    for (const c of idx.get(`${saison - 1}|${cleNom}`) || [])
      if (c.parties >= MIN_PARTIES && permise(c))
        candidats.push({ ligue: c.ligue, saison: libelleSaison(c.saison), parties: c.parties, moy: c.moy, methode: 'saison précédente' });
  if (!candidats.length) return null;
  candidats.sort((a, b) => b.moy - a.moy);
  return { ...candidats[0], autres: candidats.slice(1).map(c => `${c.ligue} ${c.moy}`) };
}

// ---------- Programme principal ----------

async function extraire() {
  const t0 = Date.now();
  let evs = lireEvenements();
  console.log('Recherche de nouveaux événements…');
  evs = await decouvrir(evs);

  const evTournois = evs.filter(e => e.type === 'interligue');
  console.log(`Lecture de ${evTournois.length} tournois Inter Ligue…`);
  const tournois = [];
  for (const ev of evTournois) {
    const t = await lireTournoi(ev);
    if (!t) continue;
    const nb = t.equipes.reduce((n, e) => n + e.joueurs.length, 0);
    console.log(`  ${t.nom} : ${t.equipes.length} équipes, ${nb} participations`);
    tournois.push(t);
  }
  tournois.sort((a, b) => a.debut - b.debut);

  const saisons = new Set();
  for (const t of tournois) { saisons.add(saisonDe(t.debut)); saisons.add(saisonDe(t.debut) - 1); }
  console.log(`Lecture des ligues (saisons ${[...saisons].sort().map(libelleSaison).join(', ')})…`);
  const idx = await indexLigues(evs, saisons);

  // Noms de joueurs par saison, pour les rapprochements : saison → clé → entrées
  const idxNoms = new Map();
  for (const [k, entrees] of idx) {
    const [s, cleNom] = [+k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
    if (!idxNoms.has(s)) idxNoms.set(s, new Map());
    idxNoms.get(s).set(cleNom, entrees);
  }
  const correspondances = lireCorrespondances();
  const homonymes = lireHomonymes();
  // Ligues où figure chaque nom, toutes saisons confondues
  const liguesDuNom = new Map();
  for (const [k, entrees] of idx) {
    const cleNom = k.slice(k.indexOf('|') + 1);
    if (!liguesDuNom.has(cleNom)) liguesDuNom.set(cleNom, new Set());
    for (const c of entrees) liguesDuNom.get(cleNom).add(c.ligue);
  }
  const participants = new Set();

  console.log('Calcul des moyennes de référence…');
  const memo = new Map();
  const ref = (cleNom, date, liguesPermises = null) => {
    const k = `${cleNom}|${date}|${liguesPermises?.join() ?? ''}`;
    if (!memo.has(k)) memo.set(k, moyenneReference(idx, cleNom, date, liguesPermises));
    return memo.get(k);
  };
  const aVerifier = [];
  for (const t of tournois) {
    const liguesDuJoueur = new Map();
    for (const e of t.equipes) for (const j of e.joueurs) {
      if (!liguesDuJoueur.has(j.cle)) liguesDuJoueur.set(j.cle, new Set());
      liguesDuJoueur.get(j.cle).add(e.ligue);
    }
    for (const e of t.equipes) {
      for (const j of e.joueurs) {
        const saison = saisonDe(t.debut);
        const liguesEquipes = [...liguesDuJoueur.get(j.cle)];
        const corr = correspondances.get(j.cle);
        // Nom à chercher en ligue : celui du tournoi, ou celui inscrit à la main (prioritaire).
        let cleCible = corr ? L.cle(corr) : j.cle;
        let homo = choisirHomonyme(homonymes, cleCible, liguesEquipes, j.nom, liguesDuNom);
        j.ref = await ref(cleCible, t.debut, homo?.permises);
        if (j.ref && corr) j.ref = { ...j.ref, nomLigue: corr, rapprochement: 'manuel' };
        let fusionner = !!corr;

        if (!j.ref && !correspondances.has(j.cle)) {
          const { choix, liguesPermises, candidats } = rapprocher(idxNoms, [saison, saison - 1], j.nom, liguesEquipes);
          const homoChoix = choix && choisirHomonyme(homonymes, choix.cle, liguesEquipes, j.nom, liguesDuNom);
          const permises = liguesPermises && homoChoix ? liguesPermises.filter(l => homoChoix.permises.includes(l)) : liguesPermises || homoChoix?.permises;
          const r = choix && await ref(choix.cle, t.debut, permises);
          if (r) {
            j.ref = { ...r, nomLigue: choix.nom, rapprochement: 'automatique' };
            aVerifier.push({ t, e, j, statut: 'rapproché automatiquement', proposition: choix.nom, ligues: [...choix.ligues] });
            cleCible = choix.cle;
            homo = homoChoix;
            // Un nom avec précision reste un joueur distinct dans la vue Joueur.
            fusionner = !liguesPermises;
          } else if (choix) {
            aVerifier.push({ t, e, j, statut: 'rapproché, moins de 20 parties', proposition: choix.nom, ligues: [...choix.ligues] });
          } else if (candidats.length) {
            aVerifier.push({ t, e, j, statut: 'à confirmer', proposition: candidats.map(c => c.nom).join(' | '), ligues: [...new Set(candidats.flatMap(c => [...c.ligues]))] });
          }
        }
        participants.add(cleCible);
        if (homo?.etiquette) {
          // Homonyme déclaré : fiche distincte dans la vue Joueur.
          j.cle = `${cleCible} [${L.cle(homo.etiquette)}]`;
          j.nom = `${j.nom} [${homo.etiquette}]`;
        } else if (fusionner) j.cle = cleCible;
      }
      const refs = e.joueurs.map(j => j.ref);
      e.sommeRef = refs.length && refs.every(Boolean) ? refs.reduce((s, r) => s + Math.floor(r.moy), 0) : null;
    }
  }

  console.log('Recherche des homonymes probables…');
  const horaires = await horairesLigues(evs, saisons);
  const probables = detecterHomonymes(idx, horaires, participants, homonymes);
  console.log(`Homonymes probables : ${probables.length} (voir resultats/noms-a-verifier.csv).`);

  const donnees = { genere: new Date().toISOString(), minParties: MIN_PARTIES, tournois };
  fs.mkdirSync(path.join(ICI, 'resultats'), { recursive: true });
  fs.writeFileSync(path.join(ICI, 'resultats', 'donnees.json'), JSON.stringify(donnees));
  ecrireCSV(tournois);
  ecrireAVerifier(aVerifier, probables);
  ecrireRapport(donnees);
  const nbAuto = new Set(aVerifier.filter(a => a.statut === 'rapproché automatiquement').map(a => a.j.nom)).size;
  const nbConfirmer = new Set(aVerifier.filter(a => a.statut === 'à confirmer').map(a => a.j.nom)).size;
  console.log(`Noms écrits différemment : ${nbAuto} rapprochés automatiquement, ${nbConfirmer} à confirmer (voir resultats/noms-a-verifier.csv).`);

  const total = tournois.reduce((n, t) => n + t.equipes.reduce((m, e) => m + e.joueurs.length, 0), 0);
  const sansRef = tournois.reduce((n, t) => n + t.equipes.reduce((m, e) => m + e.joueurs.filter(j => !j.ref).length, 0), 0);
  console.log(`\nTerminé en ${Math.round((Date.now() - t0) / 1000)} s — ${L.compteurs.reseau} pages téléchargées, ${L.compteurs.cache} lues du cache.`);
  console.log(`${total} participations, dont ${sansRef} sans moyenne de référence trouvée.`);
  console.log(`Rapport : ${path.join(ICI, 'resultats', 'rapport.html')}`);
}

// ---------- Sorties ----------

function ecrireCSV(tournois) {
  const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const nb = v => v === null || v === undefined ? '' : String(v).replace('.', ',');
  const lignes = [['Tournoi', 'Date', 'Équipe', 'Ligue (équipe)', 'Pos. équipe', 'Moy. équipe déclarée', 'Total équipe', 'Diff. équipe', 'Somme des moy. de référence',
    'Joueur', 'Parties', 'Quilles', 'Moyenne jouée', 'Moyenne de référence', 'Écart (jouée - référence)', 'Ligue de référence', 'Saison', 'Parties en ligue', 'Méthode', 'Nom en ligue (si différent)', 'Autres ligues']];
  for (const t of tournois) for (const e of t.equipes) for (const j of e.joueurs) {
    const r = j.ref;
    lignes.push([t.nom, e.date ? texteDate(e.date) : '', e.nom, e.ligue, e.pos, e.moyDeclaree, e.qa, e.diff, e.sommeRef,
      j.nom, j.parties.length, j.qa, nb(j.moy), nb(r ? Math.floor(r.moy) : null), nb(r ? +(j.moy - Math.floor(r.moy)).toFixed(2) : null),
      r?.ligue, r?.saison, r?.parties, r?.methode, r?.nomLigue ? `${r.nomLigue} (rapprochement ${r.rapprochement})` : '', r?.autres.join(' | ')]);
  }
  // Point-virgule et BOM : s'ouvre directement dans Excel en français.
  fs.writeFileSync(path.join(ICI, 'resultats', 'participations.csv'), '﻿' + lignes.map(l => l.map(esc).join(';')).join('\r\n'));
}

// Un nom par ligne : les rapprochements automatiques à vérifier et les noms
// pour lesquels plusieurs candidats existent.
function ecrireAVerifier(aVerifier, probables) {
  const vus = new Map();
  for (const a of aVerifier) {
    const k = `${a.j.nom}|${a.e.ligue}`;
    if (!vus.has(k)) vus.set(k, { ...a, tournois: new Set() });
    vus.get(k).tournois.add(a.t.nom);
  }
  const esc = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lignes = [['Statut', 'Nom au tournoi', 'Ligue de l\'équipe', 'Nom(s) trouvé(s) en ligue', 'Ligue(s) où ce nom figure', 'Tournois', 'Détail']];
  for (const a of [...vus.values()].sort((x, y) => x.statut.localeCompare(y.statut) || x.j.nom.localeCompare(y.j.nom, 'fr')))
    lignes.push([a.statut, a.j.nom, a.e.ligue, a.proposition, a.ligues.join(' | '), [...a.tournois].join(' | '), '']);
  for (const p of probables.sort((x, y) => x.nom.localeCompare(y.nom, 'fr')))
    lignes.push(['homonyme probable', p.nom, '', '', [...p.ligues].join(' | '), '', [...p.raisons].join(' / ')]);
  fs.writeFileSync(path.join(ICI, 'resultats', 'noms-a-verifier.csv'), '﻿' + lignes.map(l => l.map(esc).join(';')).join('\r\n'));
}

function ecrireRapport(donnees) {
  const modele = fs.readFileSync(path.join(ICI, 'rapport-modele.html'), 'utf8');
  const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
  fs.writeFileSync(path.join(ICI, 'resultats', 'rapport.html'), modele.replace('/*DONNEES*/null', json));
}

function afficherJoueur(nom) {
  const fichier = path.join(ICI, 'resultats', 'donnees.json');
  if (!fs.existsSync(fichier)) { console.log('Lancez d’abord : node extraire.mjs'); return; }
  const { tournois } = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const k = L.cle(nom);
  const trouves = new Map();
  for (const t of tournois) for (const e of t.equipes) for (const j of e.joueurs)
    if (j.cle.includes(k) || L.cle(j.nom).includes(k)) { if (!trouves.has(j.cle)) trouves.set(j.cle, []); trouves.get(j.cle).push({ t, e, j }); }
  if (!trouves.size) { console.log(`Aucun joueur trouvé pour « ${nom} ».`); return; }
  for (const lignes of trouves.values()) {
    const parties = lignes.reduce((n, l) => n + l.j.parties.length, 0), qa = lignes.reduce((n, l) => n + l.j.qa, 0);
    console.log(`\n${lignes[0].j.nom} — ${new Set(lignes.map(l => l.t.slug)).size} tournois, ${parties} parties, moyenne jouée ${(qa / parties).toFixed(2)}`);
    for (const { t, e, j } of lignes) {
      const r = j.ref;
      const refTxt = r ? `réf. ${Math.floor(r.moy)} (${r.ligue} ${r.saison}, ${r.methode}) écart ${(j.moy - Math.floor(r.moy)).toFixed(2)}` : 'réf. introuvable';
      console.log(`  ${e.date ? texteDate(e.date) : '?'}  ${t.nom.padEnd(26)} ${e.nom.padEnd(34)} jouée ${j.moy.toFixed(2)}  ${refTxt}`);
      console.log(`      équipe : ${e.pos}e, ${e.qa} quilles, moy. déclarée ${e.moyDeclaree}, diff. ${e.diff >= 0 ? '+' : ''}${e.diff}`);
    }
  }
}

// ---------- Lancement ----------

if (args[0] === 'joueur') afficherJoueur(args.slice(1).join(' '));
else await extraire();
