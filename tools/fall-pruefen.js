#!/usr/bin/env node
/**
 * Echten Fall nachstellen: Meldung aus der App („Problem an Jakob schicken“ mit Beschreibung)
 * als Textdatei speichern und hier auswerten. Zeigt, was der Kern daraus macht.
 *
 * Aufruf: node tools/fall-pruefen.js tests/faelle/<name>.txt
 * Die Fälle enthalten fremde Instagram-Texte: Ordner tests/faelle/ ist in .gitignore (nicht veröffentlichen).
 */
const fs = require("fs");
const K = require("../kern/rezept-kern.js");
const NW = require("../daten/naehrwerte.json");
const datei = process.argv[2];
if (!datei) { console.error("Aufruf: node tools/fall-pruefen.js <meldung.txt>"); process.exit(1); }
const txt = fs.readFileSync(datei, "utf8");
const link = (txt.match(/Link:\s*(\S+)/) || [])[1] || "";
let cap = txt.split(/--- Beschreibung des Beitrags ---\n?/)[1] || txt;
let de = "";
if (/--- Übersetzung ---/.test(cap)) { [cap, de] = cap.split(/\n?--- Übersetzung ---\n?/); }
// Falls die Meldung den ganzen Zwischenablage-Text enthält (REZEPTBUCH …), die Einbettung lesen
const roh = cap.match(/###TEXT###\n?([\s\S]*?)(?:\n###DEUTSCH###\n?([\s\S]*))?$/);
let account = "";
if (roh) {
  const e = K.parseInstagramEmbed(roh[1]); if (e) { cap = e.caption; account = e.account; }
  if (roh[2]) { const d = K.parseInstagramEmbed(roh[2]); de = d ? d.caption : ""; }
}
const r = K.analyse({ caption: cap, captionDe: de, url: link, account }).recipe;
K.berechneNaehrwerte(r, NW, null, {});
console.log(`Fall: ${link}\nTitel: ${r.title}${r.titleGuessed ? " (geraten)" : ""} · Sprache ${r.lang} · Zeit ${r.timeTotal || "–"}${r.timeEstimated ? " (geschätzt)" : ""} · Portionen ${r.servings || "–"}`);
console.log("Labels: " + r.labels.map(l => l.label + (l.basis !== "Zutaten" ? " [" + l.basis + "]" : "")).join(", "));
console.log("\nZutaten (" + r.ingredients.length + "):"); r.ingredients.forEach(i => console.log("  - " + K.fmtIngredient(i) + (i.nameOriginal ? `   ← ${i.nameOriginal}` : "")));
console.log("\nSchritte (" + r.steps.length + "):"); r.steps.forEach((s, n) => console.log(`  ${n + 1}. ${s}`));
if (r.logik) console.log("\nLogik: vage " + r.logik.vage.length + " · ohne Schritt: " + (r.logik.ohneSchritt.join(", ") || "–") + " · ergänzt: " + (r.schritteErgaenzt || []).length);
console.log("Ohne Nährwert: " + ((r.nutrition.coverage.offen || []).map(o => o.name).join(", ") || "–"));
