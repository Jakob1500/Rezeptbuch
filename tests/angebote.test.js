// Tests für den Angebote-Kern. Ausführen: node tests/angebote.test.js
// Alle Angebote sind ausgedacht (keine echten Händlerdaten).
const K = require("../kern/rezept-kern.js");
const A = require("../kern/angebote-kern.js");
const NW = require("../daten/naehrwerte.json");
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) pass++; else { fail++; console.log("✗ " + name + (info !== undefined ? "  → " + JSON.stringify(info) : "")); }
}

// ---------------------------------------------------------------- Mengen und Grundpreise
check("500 g", A.parseMenge("500 g").g === 500);
check("1kg", A.parseMenge("Basmati Reis 1kg").g === 1000);
check("1,5 l", A.parseMenge("1,5 l").ml === 1500);
check("6 x 1,5 l", A.parseMenge("6 x 1,5 l").ml === 9000);
check("4 Stück", A.parseMenge("4 Stück").stk === 4);
check("lose", A.parseMenge("lose").lose === true);
check("Grundpreis €/1 kg", (g => g.preis === 3.38 && g.je === 1000 && g.einheit === "g")(A.parseGrundpreis("(3,38 €/1 kg)")));
check("Grundpreis 1kg = €", (g => g.preis === 13.3 && g.je === 1000)(A.parseGrundpreis("1kg = € 13,30")));
check("Grundpreis 1 l = 2,02 €", (g => g.preis === 2.02 && g.einheit === "ml")(A.parseGrundpreis("1 l = 2,02 €")));
let a = A.angebot({ haendler: "X", name: "Kichererbsen", preis: "0,79 €", grundpreis: "(3,16 €/1 kg)" });
check("Packung aus Preis/Grundpreis", a.menge && a.menge.g === 250, a.menge);
a = A.angebot({ haendler: "X", name: "Reis", menge: "1 kg", preis: 1.79, streichpreis: 1.79 });
check("Streichpreis = Preis zählt nicht", a.streichpreis === null);

// ---------------------------------------------------------------- Zuordnen
const ang = (name, extra) => A.angebot(Object.assign({ haendler: "X", name: name, preis: 1 }, extra || {}));
const P = (key, name) => A.passt(key, ang(name)).passt;
check("Datteltomaten → tomate", P("tomate", "Datteltomaten 500 g") === "ja");
check("Rispentomaten → tomate", P("tomate", "Rispentomaten") === "ja");
check("Tomatenmark ≠ tomate", P("tomate", "Tomatenmark 200 g") === "nein");
check("Tomaten Ketchup ≠ tomate", P("tomate", "Tomaten Ketchup") === "nein");
check("Paprika Chips ≠ rote paprika", P("rote paprika", "Paprika Chips 175 g") === "nein");
check("Kartoffel vs. festkochende = vielleicht (Sorte)", P("kartoffel", "Speisekartoffeln festkochend 2 kg") === "vielleicht");
check("Speisekartoffeln → kartoffel", P("kartoffel", "Speisekartoffeln 2 kg") === "ja");
check("Speisemöhren → möhre", P("möhre", "Speisemöhren 2 kg") === "ja");
check("rote Zwiebel = Rote Zwiebeln", P("rote zwiebel", "Rote Zwiebeln 1 kg") === "ja");
check("rote Zwiebel ≠ weiße Zwiebeln", P("rote zwiebel", "Weiße Zwiebeln 1 kg") === "nein");
check("Zwiebel vs. Rote Zwiebeln = vielleicht", P("zwiebel", "Rote Zwiebeln 1 kg") === "vielleicht");
check("Basmati Reis", P("basmati reis", "Basmati Reis 1 kg") === "ja");
check("Basmati ≠ Milchreis", P("basmati reis", "Milchreis 500 g") === "nein");
check("Reis passt nicht zu Reiswaffeln", P("reis", "Reiswaffeln 100 g") === "nein");
check("Äpfel → apfel", P("apfel", "Tafeläpfel Elstar 1 kg") === "ja");
check("Apfelsaft ≠ apfel", P("apfel", "Apfelsaft 1 l") === "nein");
check("Feta", P("feta", "Hirtenkäse Feta 200 g") === "ja");
check("Kokosmilch", P("kokosmilch", "Kokosmilch 400 ml") === "ja");

// ---------------------------------------------------------------- Menge und Kosten
const rezept = { title: "Test", servings: 2, ingredients: ["600 g Kartoffeln", "2 rote Zwiebeln", "3 Tomaten", "200 g Feta", "400 ml Kokosmilch", "250 g Basmati Reis", "1 Prise Salz"].map(K.parseIngredientLine) };
const liste = K.shoppingList([{ recipe: rezept, servings: 2 }], {}, NW);
const zeile = k => liste.filter(i => i.key === k)[0];
let k = A.kosten(zeile("kartoffel"), A.angebot({ haendler: "X", name: "Kartoffeln", menge: "2 kg", preis: 1.99, streichpreis: 2.49 }));
check("2-kg-Sack für 600 g: 1 Packung", k.packungen === 1 && k.kosten === 1.99 && k.ersparnis === 0.5, k);
k = A.kosten(zeile("feta"), A.angebot({ haendler: "X", name: "Feta", menge: "150 g", preis: 1.29 }));
check("200 g Feta aus 150-g-Packungen: 2", k.packungen === 2 && k.kosten === 2.58, k);
k = A.kosten(zeile("tomate"), A.angebot({ haendler: "X", name: "Tomaten lose", menge: "lose", preis: 2.99, grundpreis: "(2,99 €/1 kg)" }));
check("Lose Tomaten nach Gewicht", k.lose === true && k.kosten > 0 && k.kosten < 2, k);
check("Salz (Grundvorrat) nicht offen", zeile("salz") ? zeile("salz").have === true : true);

// ---------------------------------------------------------------- Abgleich und Empfehlung
const roh = [
  { haendler: "Laden A", name: "Speisekartoffeln", menge: "2 kg", preis: 1.99, streichpreis: 2.99, gueltigVon: "2026-10-19", gueltigBis: "2026-10-24" },
  { haendler: "Laden A", name: "Rote Zwiebeln", menge: "1 kg", preis: 1.29, streichpreis: 1.79, gueltigVon: "2026-10-19", gueltigBis: "2026-10-24" },
  { haendler: "Laden A", name: "Tomatenmark", menge: "200 g", preis: 0.49, streichpreis: 0.89, gueltigVon: "2026-10-19", gueltigBis: "2026-10-24" },
  { haendler: "Laden B", name: "Feta", menge: "200 g", preis: 1.49, streichpreis: 2.49, gueltigVon: "2026-10-19", gueltigBis: "2026-10-24" },
  { haendler: "Laden B", name: "Kokosmilch", menge: "400 ml", preis: 0.99, streichpreis: 1.99, gueltigVon: "2026-10-19", gueltigBis: "2026-10-24" },
  { haendler: "Laden B", name: "Basmati Reis", menge: "1 kg", preis: 1.79, streichpreis: 2.99, gueltigVon: "2026-10-19", gueltigBis: "2026-10-24" },
  { haendler: "Laden C", name: "Rote Zwiebeln", menge: "500 g", preis: 0.79, streichpreis: 0.99, gueltigVon: "2026-10-12", gueltigBis: "2026-10-17" }
].map(A.angebot);
let r = A.abgleich(liste, roh, { heute: "2026-10-21" });
check("abgelaufenes Angebot entfernt", r.angebote === 6, r.angebote);
check("Tomatenmark nicht bei Tomaten", !Object.keys(r.zeilen.tomate.besteJeHaendler).length);
check("Empfehlung Laden B (mehr gespart)", r.empfehlung && r.empfehlung.laden === "Laden B" && r.empfehlung.anzahl === 3 && r.empfehlung.ersparnis === 3.2, r.empfehlung);
check("Laden A zusätzlich nicht empfohlen (Ersparnis unter 3 €)", r.empfehlung.zusatz === null, r.empfehlung.zusatz);
r = A.abgleich(liste, roh, { heute: "2026-10-21", schwelle: 1 });
check("mit Schwelle 1 €: Laden A dazu", r.empfehlung.zusatz && r.empfehlung.zusatz.laden === "Laden A" && r.empfehlung.zusatz.anzahl === 2, r.empfehlung.zusatz);
check("Text der Empfehlung", /^Diese Woche: Laden B – 3 von \d+ Zutaten im Angebot, ca\. 3,20 € gespart\. Mit Laden A zusätzlich: 2 Zutaten, ca\. 1,50 €\.$/.test(r.empfehlung.text), r.empfehlung.text);
r = A.abgleich(liste, roh, { heute: "2026-10-25" });
check("nach Ablauf keine Empfehlung", r.empfehlung === null && r.angebote === 0, r);

// ---------------------------------------------------------------- Leser ALDI Nord (Aufbau wie die echte Antwort, Werte ausgedacht)
const woche = { offers: [{ content: [
  { title: "Frische-Aktion: Obst & Gemüse", productIds: ["1", "2"] },
  { title: "Damenmode", productIds: ["9"] },
  { title: "Gekühlte & tiefgekühlte Produkte", productIds: ["3", "1"] }] }] };
check("ALDI: nur Lebensmittel-Abschnitte, ohne Doppelte", JSON.stringify(A.aldiNordNummern(woche)) === '["1","2","3"]', A.aldiNordNummern(woche));
const prod = [
  { objectID: "1", name: "Feldsalat", salesUnit: "150-g-Schale", additionalAttributes: ["150 g"], productSlug: "feldsalat-1",
    promotionPrices: [{ priceValue: 0.99, strikePrice: { strikePriceValue: 1.29 }, basePrice: [{ basePriceValue: 6.6, basePriceScale: "kg" }], validFromLocalDate: "2026-10-19", validUntilLocalDate: "2026-10-24" }] },
  { objectID: "2", name: "Lachsfiletportionen", brandName: "MEER", salesUnit: "4x125-g-Packung",
    promotionPrices: [{ priceValue: 7.99, strikePrice: { strikePriceValue: 9.49 }, basePrice: [{ basePriceValue: 15.98, basePriceScale: "kg" }], validFromLocalDate: "2026-10-19", validUntilLocalDate: "2026-10-24" }] },
  { objectID: "3", name: "Hokkaido-Kürbis", salesUnit: "kg-Preis",
    promotionPrices: [{ priceValue: 0.99, basePrice: [{ basePriceValue: 0.99, basePriceScale: "kg" }], validFromLocalDate: "2026-10-19", validUntilLocalDate: "2026-10-24" }] },
  { objectID: "4", name: "Frische Eier", salesUnit: "12er-Packung", promotionPrices: [{ priceValue: 2.49, validFromLocalDate: "2026-10-22", validUntilLocalDate: "2026-10-28" }] },
  { objectID: "5", name: "Saft", salesUnit: "1-L-Flasche", currentPrice: { priceValue: 1.49, basePrice: [{ basePriceValue: 1.49, basePriceScale: "Liter" }] } }];
const al = A.ausAldiNord(prod);
check("ALDI: Feldsalat 150 g, Streichpreis, gültig bis", al[0].menge.g === 150 && al[0].streichpreis === 1.29 && al[0].gueltigBis === "2026-10-24" && /feldsalat-1/.test(al[0].link), al[0]);
check("ALDI: 4x125 g = 500 g", al[1].menge.g === 500 && al[1].marke === "MEER", al[1].menge);
check("ALDI: kg-Preis = lose", al[2].menge.lose === true, al[2].menge);
check("ALDI: 12er-Packung = 12 Stück", al[3].menge.stk === 12, al[3].menge);
check("ALDI: Liter-Grundpreis", al[4].menge.ml === 1000 && al[4].grundpreis.einheit === "ml", al[4]);
check("Lachsfiletportionen → lachsfilet", A.passt("lachsfilet", al[1]).passt === "ja");
check("Rahm-Spinat ≠ spinat", P("spinat", "Rahm-Spinat 750 g") === "nein");
check("Weizenmehl → mehl", P("mehl", "Weizenmehl XXL 2 kg") === "ja");
check("Tomaten passiert → passierte tomate", P("passierte tomate", "Tomaten passiert 3x200 g") === "ja");

console.log(`\nAngebote-Kern ${A.VERSION}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
