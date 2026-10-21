#!/usr/bin/env node
/**
 * Übernimmt Gelerntes, das Nutzer aus der App geschickt haben („An Jakob schicken“),
 * in die zentral geprüften Regeln daten/gelernt-zentral.json. Nach dem nächsten Build
 * bekommen alle Nutzer diese Regeln mit dem App-Update.
 *
 * Aufruf:
 *   node tools/lernen-uebernehmen.js eingang/*.json            → nur Bericht (nichts wird geändert)
 *   node tools/lernen-uebernehmen.js eingang/*.json --schreiben → Regeln übernehmen
 *   Optionen: --min 2   Regel erst übernehmen, wenn sie von mindestens 2 Nutzern kommt (Standard 1)
 *             --ohne "text"  einzelne Regel oder Zutat nicht übernehmen, mehrfach möglich
 *             --ersetzen     zentral vorhandene Nährwerte durch neue Angaben ersetzen
 *
 * Die Dateien enthalten nur Regeln und Zutatennamen, keine Rezepte und keine Personendaten.
 */
const fs = require("fs"), path = require("path");
const K = require("../kern/rezept-kern.js");
const ZPFAD = path.join(__dirname, "../daten/gelernt-zentral.json");

const args = process.argv.slice(2), files = [], ohne = {};
let schreiben = false, min = 1;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--schreiben") schreiben = true;
  else if (args[i] === "--min") min = +args[++i] || 1;
  else if (args[i] === "--ohne") ohne[K.lernNorm(args[++i])] = 1;
  else files.push(args[i]);
}
if (!files.length) { console.error("Aufruf: node tools/lernen-uebernehmen.js <dateien.json …> [--schreiben] [--min N] [--ohne \"text\"]"); process.exit(1); }

const zentral = JSON.parse(fs.readFileSync(ZPFAD, "utf8"));
const KEYS = ["ignorieren", "keinSchritt", "istSchritt", "keineZutat", "keineFloskel"];
const zaehler = { floskeln: {}, zutatAlias: {} }; KEYS.forEach(k => zaehler[k] = {});
const unbekannt = {}, nwEin = {}, tFehler = [], titelEin = []; let ok = 0;
const BLS = require("../daten/bls-suche.json");

files.forEach(f => {
  let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.log(`✗ ${f}: keine gültige Datei`); return; }
  if (j.app !== "rezeptbuch-lernen" || !j.regeln) { console.log(`✗ ${f}: keine Rezeptbuch-Lerndatei`); return; }
  ok++;
  const R = j.regeln;
  KEYS.forEach(k => (R[k] || []).forEach(x => { x = String(x).trim(); if (x) zaehler[k][x] = (zaehler[k][x] || 0) + 1; }));
  Object.keys(R.zutatAlias || {}).forEach(x => { const id = x + " → " + R.zutatAlias[x]; zaehler.zutatAlias[id] = (zaehler.zutatAlias[id] || 0) + 1; });
  Object.keys(R.floskeln || {}).forEach(a => (R.floskeln[a] || []).forEach(x => { const id = a + "\u0000" + x; zaehler.floskeln[id] = (zaehler.floskeln[id] || 0) + 1; }));
  Object.keys(j.unbekannt || {}).forEach(u => { unbekannt[u] = (unbekannt[u] || 0) + j.unbekannt[u]; });
  (j.titel || []).forEach(t => titelEin.push(Object.assign({ datei: path.basename(f) }, t)));
  (j.teilenFehler || []).forEach(f => tFehler.push(Object.assign({ datei: path.basename(f.datei || "") || "" }, f)));
  Object.keys(j.naehrwerte || {}).forEach(k => { (nwEin[k] = nwEin[k] || []).push(Object.assign({ datei: path.basename(f) }, j.naehrwerte[k])); });
});

const neu = [];
const nimm = (art, text, n, fn) => { if (n < min || ohne[K.lernNorm(text)]) return; neu.push(`${art}: ${text} (${n}×)`); if (schreiben) fn(); };
KEYS.forEach(k => Object.keys(zaehler[k]).forEach(x => { if ((zentral[k] || {})[x]) return; nimm(k, x, zaehler[k][x], () => { (zentral[k] = zentral[k] || {})[x] = 1; }); }));
Object.keys(zaehler.zutatAlias).forEach(id => { const [a, b] = id.split(" → "); if ((zentral.zutatAlias || {})[a]) return; nimm("zutatAlias", id, zaehler.zutatAlias[id], () => { (zentral.zutatAlias = zentral.zutatAlias || {})[a] = b; }); });
Object.keys(zaehler.floskeln).forEach(id => { const [a, x] = id.split("\u0000"); if (((zentral.floskeln || {})[a] || []).includes(x)) return; nimm("Floskel @" + a, x, zaehler.floskeln[id], () => { zentral.floskeln = zentral.floskeln || {}; (zentral.floskeln[a] = zentral.floskeln[a] || []).push(x); }); });

// Nährwerte: Zuordnungen zum BLS nach Stimmen, eigene Angaben als Median – jede Angabe wird erneut geprüft
const median = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const nwBericht = [];
zentral.naehrwerte = zentral.naehrwerte || {};
Object.keys(nwEin).forEach(k => {
  const list = nwEin[k], name = list[0].zutat || k;
  if (zentral.naehrwerte[k] && !args.includes("--ersetzen")) { nwBericht.push(`= ${name}: schon zentral vorhanden (mit --ersetzen überschreiben)`); return; }
  if (ohne[K.lernNorm(k)] || ohne[K.lernNorm(name)]) return;
  const stks = list.map(x => x.stk).filter(x => x != null), stk = stks.length ? median(stks) : undefined;
  const bls = list.filter(x => x.bls), eig = list.filter(x => (x.art === "eigen" || x.art === "off") && x.n);
  let eintrag = null, zeile = "";
  if (bls.length >= eig.length && bls.length) {
    const st = {}; bls.forEach(x => { st[x.bls] = st[x.bls] || { n: 0, x }; st[x.bls].n++; });
    const best = Object.values(st).sort((a, b) => b.n - a.n)[0];
    const e = BLS.eintraege.find(r => r[0] === best.x.bls);
    if (!e) { nwBericht.push(`✗ ${name}: BLS-Code ${best.x.bls} nicht gefunden`); return; }
    const nObj = {}; for (let i = 3; i < BLS.felder.length; i++) if (e[i] != null) nObj[BLS.felder[i]] = e[i];
    eintrag = { bls: e[0], name: e[1], n: nObj, art: "bls" };
    zeile = `${name} → BLS ${e[0]} „${e[1]}“ (${best.n} von ${list.length} Stimmen)`;
  } else if (eig.length) {
    const n = {}; K.NW_FELDER.forEach(f => { const m = median(eig.map(x => x.n[f])); if (m != null) n[f] = Math.round(m * 10) / 10; });
    const pr = K.pruefeNaehrwerte(n, { name, suche: BLS, stk });
    const streu = eig.length > 1 ? Math.round((Math.max(...eig.map(x => x.n.kcal)) - Math.min(...eig.map(x => x.n.kcal)))) : 0;
    if (!pr.ok) { nwBericht.push(`✗ ${name}: eigene Angabe nicht plausibel – ${pr.fehler.join(" ")}`); return; }
    const ausOff = eig.some(x => x.art === "off");
    eintrag = { bls: null, name: name + (ausOff ? " (Open Food Facts / Nutzer)" : " (Angabe von Nutzern)"), n, art: ausOff ? "off" : "eigen", quelle: [...new Set(eig.map(x => x.quelle).filter(Boolean))].join(", ") };
    if (ausOff) eintrag.lizenz = "Enthält Daten von Open Food Facts, verfügbar unter der Open Database License (ODbL 1.0)";
    zeile = `${name}: eigene Angabe von ${eig.length} Nutzer(n), ${n.kcal} kcal · ${n.protein ?? "–"} g Eiweiß · ${n.carbs ?? "–"} g KH · ${n.fat ?? "–"} g Fett je 100 g` +
      (streu > 50 ? ` · ACHTUNG: Angaben streuen um ${streu} kcal` : "") + (pr.hinweise.length ? ` · Hinweise: ${pr.hinweise.join(" ")}` : "") +
      (eig.some(x => x.notiz) ? ` · Produkt: ${[...new Set(eig.map(x => x.notiz).filter(Boolean))].join(", ")}` : "");
  } else if (list.some(x => x.art === "stueck")) {
    const hit = K.findNutrientEntry(k, require("../daten/naehrwerte.json").zutaten);
    if (!hit) { nwBericht.push(`✗ ${name}: Stückgewicht ohne bekannte Zutat`); return; }
    zeile = `${name}: Stückgewicht für „${hit.entry.name}“`;
    eintrag = Object.assign({}, hit.entry, { art: "stueck" });
  }
  if (!eintrag) return;
  if (list.length < min) { nwBericht.push(`· ${zeile} – erst ${list.length} Nutzer, braucht ${min}`); return; }
  nwBericht.push("+ " + zeile + (stk != null ? ` · 1 Stück = ${stk} g` : ""));
  if (schreiben) {
    if (stk != null) eintrag.stk = stk;
    eintrag.geprueft = true; eintrag.zutat = name;
    zentral.naehrwerte[k] = eintrag;
  }
});

console.log(`${ok} von ${files.length} Dateien gelesen · ${neu.length} neue Regeln${min > 1 ? ` (ab ${min} Nutzern)` : ""}`);
neu.forEach(x => console.log("  + " + x));
if (titelEin.length) {
  console.log(`\nGeänderte Titel (${titelEin.length}) – Eingang fürs Titel-Training (automatisch → neu):`);
  const byK = {}; titelEin.forEach(t => (byK[t.konto || "(ohne Konto)"] = byK[t.konto || "(ohne Konto)"] || []).push(t));
  Object.keys(byK).sort((a, b) => byK[b].length - byK[a].length).forEach(k => {
    console.log(`  @${k} (${byK[k].length}×)`);
    byK[k].forEach(t => console.log(`    - „${t.automatisch || "–"}“ → „${t.neu}“${t.original ? ` (Original: „${t.original}“)` : ""}${t.link ? "  " + t.link : ""}`));
  });
}
if (tFehler.length) {
  console.log(`\nProbleme beim Teilen (${tFehler.length}) – zum Nachstellen und Beheben im Kern:`);
  const byG = {}; tFehler.forEach(f => (byG[f.grund] = byG[f.grund] || []).push(f));
  Object.keys(byG).sort((a, b) => byG[b].length - byG[a].length).forEach(g => {
    console.log(`  ${g} (${byG[g].length}×)`);
    byG[g].slice(0, 8).forEach(f => { const d = f.diagnose || {}; console.log(`    - ${f.link || "ohne Link"} · App ${f.app} · ${d.laenge ?? "?"} Zeichen · Text ${d.text ?? "?"} · DE ${d.deutsch ?? "?"}` + (f.notiz ? ` · „${f.notiz}“` : "") + (d.kopf && d.kopf.length ? `\n      Kopf: ${d.kopf.join(" | ")}` : "") + (d.fuss && d.fuss.length ? `\n      Fuß: ${d.fuss.join(" | ")}` : "")); });
  });
}
if (nwBericht.length) console.log(`\nNährwerte (${nwBericht.length}):\n  ` + nwBericht.join("\n  "));
const unb = Object.entries(unbekannt).sort((a, b) => b[1] - a[1]);
if (unb.length) console.log(`\nZutaten ohne Nährwert (für das Nährwert-Training, ${unb.length}):\n  ` + unb.slice(0, 60).map(([k, n]) => `${k} (${n}×)`).join(", "));
if (schreiben) {
  zentral.stand = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(ZPFAD, JSON.stringify(zentral, null, 1) + "\n");
  console.log(`\nGespeichert in daten/gelernt-zentral.json – jetzt „node tools/build-app.js“ und veröffentlichen.`);
} else if (neu.length) console.log(`\nNur Bericht. Zum Übernehmen: --schreiben anhängen (einzelne Regeln mit --ohne "text" auslassen).`);
