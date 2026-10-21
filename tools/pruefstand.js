#!/usr/bin/env node
/**
 * Prüfstand: misst FEHLERKLASSEN über alle echten Rezepte (Exporte + gemeldete Fälle), nicht einzelne Fälle.
 * Jede Kern-Änderung muss den Prüfstand mindestens halten. So wird eine Ursache für alle ähnlichen
 * Situationen behoben – und wir sehen sofort, wenn eine Änderung woanders etwas kaputt macht.
 *
 * Aufruf:
 *   node tools/pruefstand.js                 → Zahlen je Fehlerklasse + Vergleich mit dem gespeicherten Stand
 *   node tools/pruefstand.js --speichern     → aktuellen Stand als neue Messlatte speichern (tests/pruefstand-stand.json)
 *   node tools/pruefstand.js --zeige <klasse> → Beispiele einer Fehlerklasse anzeigen
 * Rückgabe-Code 1, wenn eine Klasse schlechter geworden ist.
 */
const fs = require("fs"), path = require("path");
const K = require("../kern/rezept-kern.js"), NW = require("../daten/naehrwerte.json");
const root = path.join(__dirname, "..");
const args = process.argv.slice(2), zeige = args.includes("--zeige") ? args[args.indexOf("--zeige") + 1] : null;

// ---- Quellen: Exporte (lokal, privat) + gemeldete Fälle (lokal, privat)
const faelle = [];
// Richtige Titel von Jakob (privat): tests/faelle/titel/titel-faelle.json – gilt für Rezepte aus den Exporten mit gleichem Link
const titelDatei = path.join(root, "tests/faelle/titel/titel-faelle.json");
const titelSoll = fs.existsSync(titelDatei) ? JSON.parse(fs.readFileSync(titelDatei, "utf8")).faelle : [];
["daten/ig-analyse.json", "daten/ig-analyse2.json"].forEach(f => {
  const p = path.join(root, f); if (!fs.existsSync(p)) return;
  require(p).filter(x => x.recipe).forEach(x => { if (!faelle.some(y => y.id === x.url)) faelle.push({ id: x.url, caption: x.caption, account: x.account, url: x.url }); });
});
titelSoll.forEach(t => { // ohne Export: Text aus der Titel-Datei nehmen
  let f = faelle.find(y => y.url === t.link);
  if (!f) { f = { id: t.link, caption: t.caption, account: t.konto, url: t.link }; faelle.push(f); }
  if (t.titel) f.titel = t.titel;
});
const fd = path.join(root, "tests/faelle");
if (fs.existsSync(fd)) fs.readdirSync(fd).filter(f => f.endsWith(".txt") && f !== "beispiel.txt").forEach(f => {
  const t = fs.readFileSync(path.join(fd, f), "utf8");
  const jp = path.join(fd, f.replace(/\.txt$/, ".json")), soll = fs.existsSync(jp) ? JSON.parse(fs.readFileSync(jp, "utf8")) : {};
  faelle.push({ id: "fall:" + f, caption: t.split(/--- Beschreibung des Beitrags ---\n?/)[1] || t, url: (t.match(/Link:\s*(\S+)/) || [])[1] || "", account: soll.konto || "", titel: soll.titel || "" });
});

// ---- Fehlerklassen (Invarianten, die für JEDES Rezept gelten sollen)
const DE_SATZ_VERB = /\b[a-zäöüß]{3,}(en|ern|eln)[.!]?\s*$/;
const EN_START = /^(add|mix|stir|cook|bake|heat|preheat|place|pour|blend|combine|chop|slice|dice|mince|toss|serve|season|bring|reduce|simmer|roast|fry|whisk|fold|transfer|top|drain|rinse|let|remove|spread|cut|grate|sprinkle|drizzle|tear|blitz|spoon)\b/i;
const MENGE_ZEILE = /^\s*[-•*]?\s*(\d+(?:[.,/]\d+)?(?:\s*[-–]\s*\d+)?|[½¼¾])\s*(g|kg|ml|l|el|tl|cups?|tbsp|tsp|stk|stück|dose|dosen|bund|zehen?|pck|prise|handvoll)?\s+[A-Za-zÄÖÜäöü]/i;
const norm = s => String(s || "").toLowerCase().replace(/[^a-zäöüß0-9]+/g, " ").trim();
const KLASSEN = {
  "schritt-verloren": "Anweisungssatz aus der Beschreibung fehlt in den Schritten",
  "zutat-verloren": "Zeile mit Menge am Anfang fehlt in den Zutaten",
  "zutat-ohne-schritt": "Zutat kommt in keinem Schritt vor",
  "vage-unaufgeloest": "„Alles …“-Schritt ohne erkennbare Zutaten",
  "titel-satz": "Titel ist ein Satz oder sehr lang",
  "titel-geraten": "Titel geraten",
  "titel-falsch": "Titel weicht vom richtigen Titel ab (nur Fälle mit bekanntem Titel)",
  "vegan-widerspruch": "Creator sagt vegan, Rezept nicht vegan",
  "ohne-naehrwert": "Zutat ohne Nährwert",
  "zeit-unplausibel": "geschätzte Zeit unter 5 oder über 180 Minuten",
  "zutat-zusammengeklebt": "Zutat mit mehreren Zutatennamen in einem Namen",
  "zutat-englisch": "englischer Zutatenname nicht übersetzt",
  "unvollstaendig": "Rezept unvollständig (Zutaten/Schritte fehlen)"
};
const zaehler = {}, beispiele = {};
Object.keys(KLASSEN).forEach(k => { zaehler[k] = 0; beispiele[k] = []; });
const treffer = (k, f, info) => { zaehler[k]++; if (beispiele[k].length < 12) beispiele[k].push(f.id + "  →  " + info); };

faelle.forEach(f => {
  const r = K.analyse({ caption: f.caption, url: f.url, account: f.account || "" }).recipe;
  K.berechneNaehrwerte(r, NW, null, {});
  const stepText = norm(r.steps.join(" ") + " " + (r.description || ""));
  // Schritte: kurze Anweisungssätze aus der Beschreibung müssen irgendwo wieder auftauchen
  if (r.ingredients.length >= 2) {
    String(f.caption).split(/\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 3 && s.length < 160).forEach(s => {
      const deutsch = DE_SATZ_VERB.test(s) && /[.!]$/.test(s) && !/^(ich|wir|du|ihr|man|es|das|die|der|heute|hier|mein|unser)\b/i.test(s);
      const englisch = EN_START.test(s.replace(/^\W*\d*[.)]?\s*/, ""));
      if (!(deutsch || englisch) || MENGE_ZEILE.test(s) || /#|@|http/i.test(s)) return;
      if (/^(falls|wenn du|so könnt|viele|um ein|dann unbedingt|lass|lasst|abspeichern|speicher|probier|meine?|wichtig|tipp|hinweis|folg|kommentier|teil|markier|viel spaß|guten)/i.test(s) || /(schmecken|ausprobieren|nachmachen|speichern)[.!]?$/i.test(s)) return; // Floskeln, keine Schritte
      if (englisch && r.lang === "de" || deutsch && !englisch && r.lang === "en") return; // zweisprachige Beschreibung: andere Hälfte bewusst weggelassen
      const kern = norm(s).split(" ").filter(w => w.length > 3).slice(0, 5).join(" ");
      if (kern && stepText.indexOf(kern) === -1 && norm(r.steps.join(" ")).indexOf(norm(s).slice(0, 25)) === -1) treffer("schritt-verloren", f, s.slice(0, 90));
    });
  }
  // Zutaten: Mengenzeilen müssen als Zutat ankommen
  const ingRaw = norm(r.ingredients.map(i => i.raw + " " + i.name + " " + (i.nameOriginal || "")).join(" | "));
  String(f.caption).split("\n").map(s => s.trim()).filter(s => MENGE_ZEILE.test(s) && s.length <= 90 && !/[.!?]$/.test(s) && !/\b(min|minuten|minutes|grad|°|portionen|servings|kcal)\b/i.test(s)).forEach(s => {
    if (r.lang && K.langOfText(s) !== "?" && K.langOfText(s) !== r.lang) return; // andere Sprachhälfte
    if (/pflanzenpunkte|tage?\b.*tag \d|\d+\s*\/\s*\d+$/i.test(s)) return;
    const p = K.parseIngredientLine(s); if (!p) return;
    const w = norm(p.name).split(" ").filter(x => x.length > 3)[0];
    if (w && ingRaw.indexOf(w) === -1) treffer("zutat-verloren", f, s.slice(0, 80));
  });
  (r.logik && r.logik.ohneSchritt || []).forEach(n => treffer("zutat-ohne-schritt", f, n));
  (r.logik && r.logik.vage || []).forEach(s => treffer("vage-unaufgeloest", f, s));
  if (r.title && (r.title.split(/\s+/).length > 7 || /\b(ich|wir|du|ist|sind|you|is|are|my|mein)\b/i.test(r.title))) treffer("titel-satz", f, r.title);
  if (r.titleGuessed) treffer("titel-geraten", f, r.title);
  if (f.titel && ![r.title, r.titleOriginal].some(x => norm(x).replace(/ /g, "") === norm(f.titel).replace(/ /g, ""))) treffer("titel-falsch", f, `„${r.title}“ statt „${f.titel}“`);
  if (/(^|[^a-z])(#?vegan|plant.?based)([^a-z]|$)/i.test(f.caption) && !/vegan\w*\s+(möglich|option)/i.test(f.caption) && r.ingredients.length >= 2 && !r.diet.includes("vegan")) treffer("vegan-widerspruch", f, JSON.stringify(r.dietEvidence));
  ((r.nutrition && r.nutrition.coverage.offen) || []).filter(o => o.grund === "unbekannt").forEach(o => treffer("ohne-naehrwert", f, o.name));
  if (r.timeEstimated && (r.timeTotal < 5 || r.timeTotal > 180)) treffer("zeit-unplausibel", f, r.timeTotal + " Min.");
  r.ingredients.forEach(i => {
    if (!i.nameOriginal && i.aisle === "Sonstiges" && /\b[a-z]+\s+[A-Z][a-z]+\s+(of|von)\b|\s[A-ZÄÖÜ][a-zäöü]+\s[A-ZÄÖÜ][a-zäöü]+\s[A-ZÄÖÜ]/.test(i.name)) treffer("zutat-zusammengeklebt", f, i.name);
    if (!i.nameOriginal && /^[A-Za-z][a-z]+(\s[a-z]+)*$/.test(i.name) && /\b(the|of|and|with|fresh|chopped|cups?|mushrooms?|onions?|cloves?|sauce|oil|powder|leaves|juice)\b/i.test(i.name)) treffer("zutat-englisch", f, i.name);
  });
  if (!K.completeness(r).enough) treffer("unvollstaendig", f, (r.elsewhere && r.elsewhere.wo) || "?");
});

// ---- Ausgabe und Vergleich mit der Messlatte
const standDatei = path.join(root, "tests/pruefstand-stand.json");
const alt = fs.existsSync(standDatei) ? JSON.parse(fs.readFileSync(standDatei, "utf8")) : null;
console.log(`Prüfstand · Kern ${K.VERSION} · ${faelle.length} echte Rezepte\n`);
let schlechter = 0;
Object.keys(KLASSEN).forEach(k => {
  const a = alt && alt.zaehler[k] != null ? alt.zaehler[k] : null, d = a == null ? "" : zaehler[k] - a;
  if (d > 0) schlechter++;
  console.log(`${String(zaehler[k]).padStart(5)}  ${k.padEnd(22)} ${KLASSEN[k]}${a == null ? "" : d === 0 ? "  (=)" : d < 0 ? `  (besser: ${d})` : `  (SCHLECHTER: +${d})`}`);
});
if (zeige && beispiele[zeige]) { console.log(`\nBeispiele „${zeige}“:`); beispiele[zeige].forEach(b => console.log("  - " + b)); }
if (args.includes("--speichern")) { fs.writeFileSync(standDatei, JSON.stringify({ kern: K.VERSION, datum: new Date().toISOString().slice(0, 10), rezepte: faelle.length, zaehler }, null, 1) + "\n"); console.log("\nMesslatte gespeichert."); }
if (schlechter) { console.log(`\n${schlechter} Fehlerklasse(n) schlechter als die Messlatte – Änderung prüfen!`); process.exit(1); }
