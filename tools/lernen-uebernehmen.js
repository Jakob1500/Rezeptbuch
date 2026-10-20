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
 *             --ohne "text"  einzelne Regel (genauer Text) nicht übernehmen, mehrfach möglich
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
const unbekannt = {}; let ok = 0;

files.forEach(f => {
  let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.log(`✗ ${f}: keine gültige Datei`); return; }
  if (j.app !== "rezeptbuch-lernen" || !j.regeln) { console.log(`✗ ${f}: keine Rezeptbuch-Lerndatei`); return; }
  ok++;
  const R = j.regeln;
  KEYS.forEach(k => (R[k] || []).forEach(x => { x = String(x).trim(); if (x) zaehler[k][x] = (zaehler[k][x] || 0) + 1; }));
  Object.keys(R.zutatAlias || {}).forEach(x => { const id = x + " → " + R.zutatAlias[x]; zaehler.zutatAlias[id] = (zaehler.zutatAlias[id] || 0) + 1; });
  Object.keys(R.floskeln || {}).forEach(a => (R.floskeln[a] || []).forEach(x => { const id = a + "\u0000" + x; zaehler.floskeln[id] = (zaehler.floskeln[id] || 0) + 1; }));
  Object.keys(j.unbekannt || {}).forEach(u => { unbekannt[u] = (unbekannt[u] || 0) + j.unbekannt[u]; });
});

const neu = [];
const nimm = (art, text, n, fn) => { if (n < min || ohne[K.lernNorm(text)]) return; neu.push(`${art}: ${text} (${n}×)`); if (schreiben) fn(); };
KEYS.forEach(k => Object.keys(zaehler[k]).forEach(x => { if ((zentral[k] || {})[x]) return; nimm(k, x, zaehler[k][x], () => { (zentral[k] = zentral[k] || {})[x] = 1; }); }));
Object.keys(zaehler.zutatAlias).forEach(id => { const [a, b] = id.split(" → "); if ((zentral.zutatAlias || {})[a]) return; nimm("zutatAlias", id, zaehler.zutatAlias[id], () => { (zentral.zutatAlias = zentral.zutatAlias || {})[a] = b; }); });
Object.keys(zaehler.floskeln).forEach(id => { const [a, x] = id.split("\u0000"); if (((zentral.floskeln || {})[a] || []).includes(x)) return; nimm("Floskel @" + a, x, zaehler.floskeln[id], () => { zentral.floskeln = zentral.floskeln || {}; (zentral.floskeln[a] = zentral.floskeln[a] || []).push(x); }); });

console.log(`${ok} von ${files.length} Dateien gelesen · ${neu.length} neue Regeln${min > 1 ? ` (ab ${min} Nutzern)` : ""}`);
neu.forEach(x => console.log("  + " + x));
const unb = Object.entries(unbekannt).sort((a, b) => b[1] - a[1]);
if (unb.length) console.log(`\nZutaten ohne Nährwert (für das Nährwert-Training, ${unb.length}):\n  ` + unb.slice(0, 60).map(([k, n]) => `${k} (${n}×)`).join(", "));
if (schreiben) {
  zentral.stand = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(ZPFAD, JSON.stringify(zentral, null, 1) + "\n");
  console.log(`\nGespeichert in daten/gelernt-zentral.json – jetzt „node tools/build-app.js“ und veröffentlichen.`);
} else if (neu.length) console.log(`\nNur Bericht. Zum Übernehmen: --schreiben anhängen (einzelne Regeln mit --ohne "text" auslassen).`);
