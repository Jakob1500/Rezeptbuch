#!/usr/bin/env node
/**
 * Echte, gemeldete Fälle als Regressionstests: tests/faelle/<name>.txt (Meldung mit Beschreibung)
 * + tests/faelle/<name>.json (was richtig ist). Der Ordner bleibt lokal (fremde Instagram-Texte),
 * eine Kopie liegt im privaten claude.ai-Projekt („rezeptspeicher-faelle.md“).
 * Aufruf: node tests/faelle-pruefen.js
 */
const fs = require("fs"), path = require("path");
const K = require("../kern/rezept-kern.js"), NW = require("../daten/naehrwerte.json");
const dir = path.join(__dirname, "faelle");
if (!fs.existsSync(dir)) { console.log("Keine Fälle vorhanden."); process.exit(0); }
let ok = 0, bad = 0;
fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(f => {
  const soll = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const txt = fs.readFileSync(path.join(dir, f.replace(/\.json$/, ".txt")), "utf8");
  let cap = txt.split(/--- Beschreibung des Beitrags ---\n?/)[1] || txt;
  const r = K.analyse({ caption: cap, url: (txt.match(/Link:\s*(\S+)/) || [])[1] || "", account: soll.konto || "" }).recipe;
  K.berechneNaehrwerte(r, NW, null, {});
  const fehler = [];
  const st = r.steps.filter(s => !/^## /.test(s)), heads = r.steps.filter(s => /^## /.test(s)).map(s => s.slice(3));
  if (soll.titel && r.title !== soll.titel) fehler.push(`Titel „${r.title}“ statt „${soll.titel}“`);
  if (soll.zutaten && r.ingredients.length !== soll.zutaten) fehler.push(`${r.ingredients.length} Zutaten statt ${soll.zutaten}`);
  if (soll.schritte && st.length !== soll.schritte) fehler.push(`${st.length} Schritte statt ${soll.schritte}`);
  if (soll.abschnitte && soll.abschnitte.join("|") !== heads.join("|")) fehler.push(`Abschnitte ${JSON.stringify(heads)} statt ${JSON.stringify(soll.abschnitte)}`);
  if (soll.ernaehrung && !r.diet.includes(soll.ernaehrung)) fehler.push(`Ernährung ${r.diet} ohne ${soll.ernaehrung}`);
  if (soll.kategorie && r.category !== soll.kategorie) fehler.push(`Kategorie ${r.category} statt ${soll.kategorie}`);
  (soll.zutatNamen || []).forEach(n => { if (!r.ingredients.some(i => i.name === n)) fehler.push(`Zutat „${n}“ fehlt`); });
  (soll.schrittEnthaelt || []).forEach(x => { if (!r.steps.some(s => s.includes(x))) fehler.push(`kein Schritt enthält „${x}“`); });
  if (soll.ohneNaehrwert && JSON.stringify((r.nutrition.coverage.offen || []).map(o => o.name)) !== JSON.stringify(soll.ohneNaehrwert)) fehler.push(`ohne Nährwert ${JSON.stringify((r.nutrition.coverage.offen || []).map(o => o.name))}`);
  if (soll.zeitMax && r.timeTotal > soll.zeitMax) fehler.push(`Zeit ${r.timeTotal} > ${soll.zeitMax}`);
  if (fehler.length) { bad++; console.log(`✗ ${f.replace(".json", "")}: ${fehler.join("; ")}`); } else { ok++; console.log(`✓ ${f.replace(".json", "")}`); }
});
console.log(`\n${ok} echte Fälle richtig, ${bad} abweichend`);
process.exit(bad ? 1 : 0);
