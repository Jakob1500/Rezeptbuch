// Tests für den Rezept-Kern. Ausführen: node tests/kern.test.js
const K = require("../kern/rezept-kern.js");
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; } else { fail++; console.log("✗ " + name + (info !== undefined ? "  → " + JSON.stringify(info) : "")); }
}

// ---------------------------------------------------------------- Zutatenzeilen
const L = K.parseIngredientLine;
let i;
i = L("200 g rote Linsen, gewaschen");
check("Menge+Einheit+Notiz", i.qty === 200 && i.unit === "g" && i.name === "Rote Linsen" && i.note === "gewaschen", i);
i = L("• 1½ EL Olivenöl");
check("Bruch mit Aufzählung", i.qty === 1.5 && i.unit === "EL" && i.name === "Olivenöl", i);
i = L("Haferflocken 50g");
check("Menge am Ende", i.qty === 50 && i.unit === "g" && i.name === "Haferflocken", i);
i = L("2 Zwiebeln");
check("Zahl ohne Einheit", i.qty === 2 && i.unit === "" && i.key === "zwiebel", i);
i = L("zwei Knoblauchzehen");
check("Zahlwort", i.qty === 2 && i.key === "knoblauch", i);
i = L("1 cup oat milk");
check("cup -> ml, deutsch", i.qty === 240 && i.unit === "ml" && /1 Tasse/.test(i.note) && i.name === "Haferdrink" && i.nameOriginal === "Oat milk", i);
i = L("2-3 EL Sojasauce");
check("Bereich", i.qty === 2 && i.qtyMax === 3 && i.unit === "EL", i);
i = L("1 Prise Salz");
check("Prise + Grundvorrat", i.unit === "Prise" && i.staple === true, i);
i = L("ca. 400 ml Kokosmilch (Dose)");
check("ca. + Klammer", i.qty === 400 && i.unit === "ml" && i.note === "Dose" && i.aisle === "Trockenware & Konserven", i);
i = L("1 Gurke");
check("Einheit g nicht in Gurke", i.unit === "" && i.name === "Gurke", i);
i = L("Salz und Pfeffer nach Geschmack");
check("ohne Menge", i.qty === null && i.staple === true, i);

// ---------------------------------------------------------------- Dauer
check("ISO", K.parseDuration("PT1H30M") === 90);
check("Freitext", K.parseDuration("1 Std. 20 Min") === 80);
check("Minuten", K.parseDuration("25 Minuten") === 25);

// ---------------------------------------------------------------- Caption DE
const capDE = `Cremiges Linsen-Curry in 30 Minuten 🍛🔥
Perfekt für die Woche – proteinreich & vegan!

Zutaten (für 4 Portionen):
• 250 g rote Linsen
• 1 Zwiebel
• 2 Knoblauchzehen
• 1 Stück Ingwer (2 cm)
• 1 EL Currypaste
• 400 ml Kokosmilch
• 1 Dose gehackte Tomaten
• 100 g Babyspinat
• Salz & Pfeffer

Zubereitung:
1. Zwiebel, Knoblauch und Ingwer fein hacken und in etwas Öl 3 Minuten andünsten.
2. Currypaste kurz mitrösten, dann Linsen, Kokosmilch und Tomaten dazugeben.
3. Alles 20 Minuten köcheln lassen, bis die Linsen weich sind.
4. Spinat unterheben und mit Salz und Pfeffer abschmecken.

#vegan #curry #mealprep #linsen #rezept`;
let a = K.analyse({ caption: capDE, url: "https://www.instagram.com/p/ABC123/", account: "@kochmitlisa" });
let r = a.recipe;
check("DE Titel", r.title === "Cremiges Linsen-Curry in 30 Minuten", r.title);
check("DE Zutaten", r.ingredients.length === 10 && r.ingredients.some(x => x.name === "Salz") && r.ingredients.some(x => x.name === "Pfeffer"), r.ingredients.map(x => x.raw)); // "Salz & Pfeffer" -> zwei Zutaten
check("DE Schritte", r.steps.length === 4, r.steps);
check("DE Portionen", r.servings === 4, r.servings);
check("DE Zeit aus Titel", r.timeTotal === 30, r.timeTotal);
check("DE vegan", r.diet.includes("vegan"), r.diet);
check("DE Kategorie", r.category === "Hauptgericht" || r.category === "Suppe & Eintopf", r.category);
check("DE vollständig", a.completeness.enough && !a.next, a.completeness);
check("DE Creator-Angabe", r.focus.some(f => f.label === "proteinreich" && f.basis === "laut Creator"), r.focus);
check("DE Account", r.source.account === "kochmitlisa");
check("DE Ablauf", a.trace.find(t => t.step === "caption").status === "verwendet", a.trace);

// ---------------------------------------------------------------- Caption EN
const capEN = `High protein chicken pasta 💪 Serves 2
Ingredients:
- 200g pasta
- 2 chicken breasts
- 1 cup spinach
- 2 tbsp parmesan
- 1 tsp garlic powder
Instructions: 1. Cook the pasta according to the package. 2. Fry the chicken in a pan for 8 minutes per side. 3. Combine everything with spinach and parmesan and serve.`;
a = K.analyse({ caption: capEN });
r = a.recipe;
check("EN Zutaten", r.ingredients.length === 5, r.ingredients.map(x => x.raw));
check("EN Schritte inline", r.steps.length === 3, r.steps);
check("EN Fleisch", r.diet.includes("mit Fleisch"), r.diet);
check("EN Allergene", r.allergens.includes("Gluten") && r.allergens.includes("Milch"), r.allergens);
check("EN Pfanne", r.equipment.includes("Pfanne"), r.equipment);
check("EN Portionen", r.servings === 2);
check("EN Zeit geschätzt", r.timeTotal > 0 && r.timeEstimated === true, r.timeTotal);

// ---------------------------------------------------------------- Link in Bio
a = K.analyse({ caption: "Die besten Zimtschnecken meines Lebens 😍 Rezept findet ihr wie immer über den Link in Bio! #backen #zimtschnecken" });
check("Bio unvollständig", !a.completeness.enough);
check("Bio nächster Schritt", a.next && a.next.action === "blogsuche", a.next);
check("Bio Kategorie Backen", a.recipe.category === "Backen", a.recipe.category);

// ---------------------------------------------------------------- Link in Caption
a = K.analyse({ caption: "Shakshuka 🍳 Das ganze Rezept: www.meinfoodblog.de/shakshuka" });
check("Link erkannt", a.next && a.next.action === "blog" && a.next.url === "https://www.meinfoodblog.de/shakshuka", a.next);

// ---------------------------------------------------------------- Einzeilig + Menge hinten
const capOneLine = "Overnight Oats 🥣 Haferflocken 50g • Milch 150 ml • Chiasamen 1 EL • Banane 1 • Zimt 1 Prise. Alles am Abend in ein Glas geben, gut verrühren und über Nacht in den Kühlschrank stellen. Morgens mit Obst toppen.";
a = K.analyse({ caption: capOneLine });
r = a.recipe;
check("Einzeilig Zutaten", r.ingredients.length >= 4, r.ingredients.map(x => x.raw));
check("Einzeilig Frühstück", r.category === "Frühstück", r.category);
check("Einzeilig vegetarisch nicht vegan", r.diet.includes("vegetarisch") && !r.diet.includes("vegan"), r.diet);

// ---------------------------------------------------------------- Thermomix-Caption
const capTM = `Tomatensoße aus dem Thermomix
Zutaten:
1 Zwiebel
1 Knoblauchzehe
20 g Olivenöl
800 g Tomaten aus der Dose
Zubereitung:
1. Zwiebel und Knoblauch in den Mixtopf geben, 5 Sek./Stufe 5 zerkleinern.
2. Öl zugeben und 3 Min./120°C/Stufe 1 dünsten.
3. Tomaten zugeben, 15 Min./100°C/Stufe 1 kochen.`;
a = K.analyse({ caption: capTM });
check("TM erkannt", a.recipe.thermomixSettings === true && a.recipe.equipment.includes("Thermomix"), a.recipe.equipment);
const ck = K.toCookidoo(a.recipe);
check("Cookidoo Felder", ck.fields.length === 1 + 4 + 3 + (a.recipe.timeTotal ? 1 : 0), ck.fields.map(f => f.label));
check("Cookidoo TM-Einstellung erhalten", /5 Sek\.\/Stufe 5/.test(ck.fullText));

// ---------------------------------------------------------------- Blog (schema.org)
const blogHtml = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebPage","name":"Shakshuka"},
 {"@type":"Recipe","name":"Shakshuka mit Feta","recipeYield":["2","2 Portionen"],
  "prepTime":"PT10M","cookTime":"PT20M","totalTime":"PT30M",
  "recipeCategory":"Frühstück","recipeCuisine":"Orientalisch",
  "recipeIngredient":["4 Eier","1 Dose stückige Tomaten (400 g)","1 rote Paprika","1 Zwiebel","100 g Feta","1 TL Kreuzkümmel","1 TL Paprikapulver edelsüß"],
  "recipeInstructions":[{"@type":"HowToSection","name":"Sauce","itemListElement":[
     {"@type":"HowToStep","text":"Zwiebel und Paprika würfeln und anbraten."},
     {"@type":"HowToStep","text":"Tomaten und Gewürze zugeben, 10 Minuten köcheln."}]},
   {"@type":"HowToStep","text":"Mulden formen, Eier hineinschlagen und abgedeckt 8 Minuten stocken lassen. Mit Feta bestreuen."}],
  "nutrition":{"@type":"NutritionInformation","calories":"380 kcal","proteinContent":"24 g","fiberContent":"6 g"},
  "author":{"@type":"Person","name":"Mein Foodblog"}}]}
</script></head><body>…</body></html>`;
a = K.analyse({ caption: "Shakshuka 🍳 Rezept: www.meinfoodblog.de/shakshuka", blogHtml, blogUrl: "https://www.meinfoodblog.de/shakshuka" });
r = a.recipe;
check("Blog Titel", r.title === "Shakshuka mit Feta", r.title);
check("Blog Zutaten", r.ingredients.length === 7, r.ingredients.length);
check("Blog Schritte aus Abschnitten", r.steps.length === 3, r.steps);
check("Blog Zeit", r.timeTotal === 30);
check("Blog Portionen", r.servings === 2);
check("Blog Herkunft", r.provenance.ingredients === "blog" && r.provenance.title === "blog", r.provenance);
check("Blog vegetarisch", r.diet.includes("vegetarisch") && !r.diet.includes("vegan"), r.diet);
check("Blog Fokus EU-Schwelle", r.focus.some(f => f.label === "proteinreich" && f.basis === "laut Blog"), r.focus);
check("Blog vollständig ohne weitere Schritte", a.completeness.enough && a.trace.find(t => t.step === "ocr").status !== "verwendet", a.trace);

// ---------------------------------------------------------------- Kette: Caption dünn -> Texterkennung
a = K.analyse({
  caption: "Protein-Pancakes 🥞 Zutaten im Video! #proteinpancakes",
  ocrText: "PROTEIN PANCAKES\n1 Banane\n2 Eier\n40 g Haferflocken\n30 g Proteinpulver\n1 TL Backpulver\nAlles pürieren und in der Pfanne von beiden Seiten 2 Minuten ausbacken.\nMit Beeren servieren."
});
check("Kette nutzt Texterkennung", a.trace.find(t => t.step === "ocr").status === "verwendet", a.trace);
check("Kette Zutaten aus Bild", a.recipe.ingredients.length === 5 && a.recipe.provenance.ingredients === "ocr", a.recipe.provenance);
check("Kette Titel aus Caption", a.recipe.title === "Protein-Pancakes", a.recipe.title);

// ---------------------------------------------------------------- Transkript
const tr = "Heute machen wir ein schnelles Pesto. Ihr braucht 50 Gramm Basilikum, 30 Gramm Pinienkerne, eine Knoblauchzehe und 100 Milliliter Olivenöl. Zuerst röstet ihr die Pinienkerne kurz in der Pfanne an. Dann gebt ihr alles in den Mixer und püriert es fein. Zum Schluss mit Salz abschmecken.";
a = K.analyse({ caption: "Schnelles Basilikum-Pesto 🌿", transcript: tr });
check("Transkript Zutaten", a.recipe.ingredients.length >= 4, a.recipe.ingredients.map(x => x.raw));
check("Transkript Schritte", a.recipe.steps.length >= 2, a.recipe.steps);
check("Transkript Kategorie", a.recipe.category === "Sauce & Dip", a.recipe.category);

// ---------------------------------------------------------------- Ernährungsstil-Fallen
a = K.analyse({ caption: "Bowl\nZutaten:\n150 g Reis\n200 ml Hafermilch\n1 EL Erdnussbutter\n100 g Tofu\nZubereitung:\nReis kochen und alles in einer Schüssel anrichten.\nMit Sesam toppen und servieren." });
check("Reis ist kein Ei, Hafermilch/Erdnussbutter vegan", a.recipe.diet.includes("vegan"), a.recipe.dietEvidence);
check("Allergene Soja+Erdnuss", a.recipe.allergens.includes("Soja") && a.recipe.allergens.includes("Erdnüsse"), a.recipe.allergens);

// ---------------------------------------------------------------- Einkaufsliste
const r1 = K.analyse({ caption: capDE }).recipe;
const r2 = K.analyse({ caption: capTM }).recipe;
const list = K.shoppingList([{ recipe: r1, servings: 2 }, { recipe: r2, servings: 4 }], { zwiebel: { have: true } });
const zw = list.find(x => x.key === "zwiebel");
check("Einkauf zusammengefasst", zw && zw.recipes.length === 2, zw);
check("Vorrat vorausgewählt", zw.have === true);
check("Halbe Portionen skaliert", list.find(x => x.key.indexOf("linse") !== -1).text.startsWith("125 g"), list.find(x => x.key.indexOf("linse") !== -1));
check("Einkaufstext ohne Vorhandenes", !/Zwiebel/.test(K.shoppingText(list)) && /Kokosmilch/.test(K.shoppingText(list)));

// ---------------------------------------------------------------- Instagram-Export
const exp = { saved_saved_collections: [
  { title: "Collection", string_map_data: { Name: { value: "Rezepte" }, "Creation Time": { timestamp: 1 } } },
  { title: "kochmitlisa", string_map_data: { Name: { href: "https://www.instagram.com/p/AAA111/", value: "kochmitlisa" }, "Added Time": { timestamp: 2 } } },
  { title: "veganmax", string_map_data: { Name: { href: "https://www.instagram.com/reel/BBB222/", value: "veganmax" } } },
  { title: "Collection", string_map_data: { Name: { value: "Reisen" } } },
  { title: "x", string_map_data: { Name: { href: "https://www.instagram.com/p/CCC333/", value: "travel" } } }
] };
const links = K.parseInstagramExport(exp);
check("Export Anzahl", links.length === 3, links);
check("Export Sammlung", links[0].collection === "Rezepte" && links[2].collection === "Reisen", links.map(l => l.collection));
check("Export Reel-Link", links[1].url === "https://www.instagram.com/reel/BBB222/");

// ---------------------------------------------------------------- Ausgabe
check("fmtQty", K.fmtQty(1.5) === "1½" && K.fmtQty(0.33) === "0,3" && K.fmtQty(125) === "125", [K.fmtQty(1.5), K.fmtQty(0.33)]);

// ---------------------------------------------------------------- Unordentliche Captions
a = K.analyse({ caption: `WERBUNG 🔥 Meine Lieblings-Protein-Bowl!!! 😍😍
👉 120g Hähnchenbrust
👉 80g Reis (roh)
👉 1/2 Avocado
So geht’s ⬇️
➡️ Reis kochen
➡️ Hähnchen würzen und 6 min pro Seite braten
➡️ Alles in eine Bowl, Dressing drüber, fertig!
Makros: 610 kcal | 48 g Protein
#highprotein #mealprep` });
check("Werbung nicht im Titel", a.recipe.title === "Protein-Bowl", a.recipe.title);
check("So geht’s mit typografischem Apostroph", a.recipe.steps.length === 3, a.recipe.steps);
check("Makros keine Zutat/kein Schritt", !a.recipe.steps.some(s => /kcal/.test(s)) && a.recipe.ingredients.length === 3);
check("Creator-Nährwerte", a.recipe.nutritionDeclared && a.recipe.nutritionDeclared.kcal === 610 && a.recipe.nutritionDeclared.protein === 48);
i = L("1 1/2 cups flour");
check("Cup Mehl -> Gramm", i.unit === "g" && i.qty === 190 && i.key === "mehl", i);
a = K.analyse({ caption: "Bananenkuchen (12 Stück)\nZutaten:\n3 Bananen\n2 Eier\n150 g Mehl\nZubereitung:\nAlles verrühren und 45 Minuten backen.\nAuskühlen lassen.\nWerbung | unbezahlt #backen" });
check("Portionen in Klammern", a.recipe.servings === 12, a.recipe.servings);
check("Werbezeile kein Schritt", a.recipe.steps.length === 2, a.recipe.steps);

// ---------------------------------------------------------------- Nährwerte (BLS 4.0)
const NW = require("../daten/naehrwerte.json");
check("BLS-Quelle und Lizenz", /Max Rubner-Institut/.test(NW.meta.quelle) && /CC BY 4\.0/.test(NW.meta.lizenz));
check("Zuordnung Kompositum", K.findNutrientEntry("babyspinat", NW.zutaten).key === "babyspinat" || K.findNutrientEntry("babyspinat", NW.zutaten).key === "spinat");
check("Zuordnung Präfix", K.findNutrientEntry("hähnchenbrustfilet", NW.zutaten).key === "hähnchenbrustfilet");
check("Butternut ist keine Butter", (K.findNutrientEntry("butternut", NW.zutaten) || {}).key !== "butter", K.findNutrientEntry("butternut", NW.zutaten));
const curry = K.analyse({ caption: capDE }).recipe;
const nw = K.berechneNaehrwerte(curry, NW);
check("Curry kcal plausibel", nw.values.kcal > 380 && nw.values.kcal < 560, nw.values);
check("Curry pro Portion", nw.perServing && nw.servings === 4);
check("Curry Abdeckung", nw.reliable && nw.coverage.unmatched.length <= 1, nw.coverage);
check("Curry viel Eisen berechnet", curry.focus.some(f => f.label === "viel Eisen" && f.basis === "berechnet"), curry.focus);
check("Curry proteinreich bleibt Creator-Angabe", curry.focus.some(f => f.label === "proteinreich" && f.basis === "laut Creator"), curry.focus);
const bowl = K.analyse({ caption: "Hähnchen-Bowl\nZutaten (2 Portionen):\n300 g Hähnchenbrust\n150 g Reis\n1 Avocado\n2 EL Olivenöl\nZubereitung:\nReis kochen.\nHähnchen braten und alles anrichten." }).recipe;
const nb = K.berechneNaehrwerte(bowl, NW);
check("Bowl Gramm-Umrechnung", nb.details.find(d => d.name === "Olivenöl").gramm === 20 && nb.details.find(d => d.name === "Avocado").gramm === 150, nb.details);
check("Bowl proteinreich berechnet", bowl.focus.some(f => f.label === "proteinreich" && f.basis === "berechnet"), [nb.values, bowl.focus]);
const thin = K.analyse({ caption: "Test\nZutaten:\n1 Prise Zauberpulver\n2 EL Geheimsauce\n100 g Spinat\nZubereitung:\nAlles mischen.\nServieren." }).recipe;
const nt = K.berechneNaehrwerte(thin, NW);
check("Unvollständige Abdeckung erkannt", !nt.reliable && nt.coverage.unmatched.length === 1 && nt.coverage.unmatched[0] === "Geheimsauce", nt.coverage);
check("Pinch of salt", K.parseIngredientLine("Pinch of salt").unit === "Prise" && K.parseIngredientLine("Pinch of salt").staple);
check("Doppelte Mengenangabe", K.parseIngredientLine("200 g / 2 cups rolled oats").key === "haferflocken");
check("Gehäufte EL", K.parseIngredientLine("2 gehäufte EL Tomatenmark").unit === "EL" && K.parseIngredientLine("2 gehäufte EL Tomatenmark").key === "tomatenmark");
check("Saft von Limette", K.parseIngredientLine("Saft von 1 Limette").key === "limettensaft");
check("Etwas … zum Anbraten", K.parseIngredientLine("etwas Öl zum Anbraten").key === "öl" && K.parseIngredientLine("etwas Öl zum Anbraten").qty === null);
check("Buchweizen bleibt Buchweizen", K.normName("Buchweizen") === "buchweizen");
check("Mojibake repariert", K.fixMojibake("fÃ¼r") === "für");

// ---------------------------------------------------------------- Einbettungsseite (Kurzbefehl, echter Test vom iPhone)
const embedText = "planthooduk Chilled Pig · this is what autumn feels like (piano instrumental) Profil ansehen Wiedergeben Auf Instagram ansehen planthooduk 863 Beiträge · 345K Follower Mehr auf Instagram ansehen Gefällt mir Kommentieren Teilen Speichern Gefällt 23.187 Mal planthooduk Aromatic thai green curry soup with beluga lentils, tender aubergine, sweet potato, basil & lime 📌 Our super green Thai curry soup is infused with punchy aromatic flavours. On the menu now 🍋 Alle 238 Kommentare ansehen Kommentieren … Instagram";
const emb = K.parseInstagramEmbed(embedText);
check("Embed-Text: Account", emb && emb.account === "planthooduk", emb);
check("Embed-Text: Caption ohne Beiwerk", emb && /^Aromatic thai green curry soup/.test(emb.caption) && /On the menu now/.test(emb.caption) && !/Kommentare|Gefällt|Follower/.test(emb.caption), emb && emb.caption);
const embHtml = '<div class="Caption"><a class="CaptionUsername" href="#">kochmitlisa</a><br/><br/>Linsen-Curry 🍛<br/>Zutaten:<br/>250 g rote Linsen<br/>1 Zwiebel<div class="CaptionComments">x</div></div>';
const eh = K.parseInstagramEmbed(embHtml);
check("Embed-HTML mit Zeilenumbrüchen", eh && eh.account === "kochmitlisa" && eh.caption.split("\n").length >= 4, eh);

// ---------------------------------------------------------------- Echte Captions ohne Zeilenumbrüche (Kurzbefehl-Test vom iPhone)
const wandelTxt = "veganer.wandel Profil ansehen Gefällt 25.411 Mal veganer.wandel Caramelized Onion Soup (🇩🇪/🇬🇧) *anzeige* Big shoutout to @hexclad_europe. Yours, Kevin 🇩🇪 Das brauchst du 4 große weiße Zwiebeln 3 Knoblauchzehen, fein gehackt 800 ml Gemüsebrühe 600 g Kartoffeln, 1-cm-Würfel 200 g Frischkäse (v) Etwas Öl Salz, Pfeffer 1 EL Thymian 1 EL Senf Petersilie, fein gehackt Chiliflocken Brot zum Dippen So machst du es 1. Zwiebeln in Halbringe schneiden und in etwas Öl mit einer Prise Salz 15–20 Minuten karamellisieren. 2. Knoblauch, Thymian, Pfeffer und Senf einrühren und kurz mitbraten. 3. Frischkäse einrühren, bis er vollständig schmilzt. 4. Mit Gemüsebrühe aufgießen und aufkochen lassen. 5. Kartoffelwürfel zugeben und 15 Minuten weich köcheln. 🇬🇧 What you need 4 large white onions 3 garlic cloves 800 ml vegetable broth How to make it 1. Slice the onions. 2. Add garlic. #soup Alle 167 Kommentare ansehen Kommentieren … Instagram";
const wE = K.parseInstagramEmbed(wandelTxt), wA = K.analyse({ caption: wE.caption, account: wE.account });
check("Fließtext: deutsche Fassung gewählt", !wA.recipe.ingredients.some(i => /onion|broth/i.test(i.name)), wA.recipe.ingredients.map(i => i.name));
check("Fließtext: Zutaten getrennt", wA.recipe.ingredients.length >= 12 && wA.recipe.ingredients.some(i => i.key === "gemüsebrühe" && i.qty === 800), wA.recipe.ingredients.map(i => i.raw));
check("Fließtext: Schritte getrennt", wA.recipe.steps.length === 5, wA.recipe.steps);
check("(v) = vegan", wA.recipe.diet.includes("vegan"), wA.recipe.dietEvidence);
const dvE = K.parseInstagramEmbed("dr.vegan Speichern Gefällt 56.348 Mal dr.vegan Spicy Peanut Noodles 🍜 Ingredients: Noodles • Peanut butter • Chili crisp • Garlic Instructions: Cook noodles. Mix everything. FULL RECIPE ON MY BLOG Drveganblog dot com (LINK IN MY BIO) #noodles Alle 212 Kommentare ansehen");
const dvA = K.analyse({ caption: dvE.caption });
check("\"dot com\" wird Blog-Link", dvA.next && dvA.next.action === "blog" && dvA.next.url === "https://drveganblog.com", dvA.next);
check("Bullet-Zutaten", dvA.recipe.ingredients.length === 4, dvA.recipe.ingredients.map(i => i.name));

// ================================================================ Phase 1 (18.10.2026)
// Übersetzung
i = L("2 cups chickpeas, drained");
check("EN: Kichererbsen + Zustand", i.name === "Kichererbsen" && i.state === "abgetropft" && /abgetropft/.test(i.note) && i.nameOriginal, i);
i = L("1 tbsp finely chopped fresh parsley");
check("EN: Notiz übersetzt", i.name === "Petersilie" && /fein gehackt/.test(i.note) && !/chopped/.test(i.note), i);
i = L("1 onion");
check("EN: Singular bei 1 Stück", i.name === "Zwiebel", i);
i = L("2 red onions");
check("EN: Plural", i.name === "Rote Zwiebeln" && i.key === "rote zwiebel", i);
i = L("2 Tsp agave or maple syrup");
check("EN: Alternative übersetzt", i.name === "Agavendicksaft" && i.note === "oder Ahornsirup", i);
i = L("1 540ml can white kidney beans");
check("Dosengröße", i.unit === "Dose" && /540 ml/.test(i.note) && i.name === "Weiße Bohnen", i);
i = L("juice and zest of 1 lemon");
check("Saft und Abrieb", i.name === "Zitrone" && /Saft und Abrieb/.test(i.note), i);
check("Titel: Englisch -> Deutsch", K.translateTitle("Spicy Peanut Noodles") === "Scharfe Erdnuss-Nudeln", K.translateTitle("Spicy Peanut Noodles"));
check("Titel: One-Pot", K.translateTitle(K.polishTitle("COZY SOUP SZN EP 4: VIRAL ONE-POT VEGAN LASAGNE SOUP")) === "Vegane Lasagne-Suppe aus einem Topf");
check("Titel: Werbung in Klammer weg", K.translateTitle(K.polishTitle("Lemon Pasta (Best Summer Pasta)")) === "Zitronen-Pasta");
check("Titel: unbekanntes Wort -> unverändert", K.translateTitle("Himbeer Chia Oats") === null);
check("Titel: mit …", K.translateTitle("Crispy Tofu with Rice and Broccoli") === null || /mit Reis/.test(K.translateTitle("Crispy Tofu with Rice")), K.translateTitle("Crispy Tofu with Rice"));
// Zeilen
let pt = K.parseText("Himbeer Oats\nDu brauchst 👇\n2-3 Hände voll Himbeeren (gefrorene auftauen oder frische nehmen)\n1 TL Chiasamen\n50 g Haferflocken\nTopping: Joghurt oder Skyr, Kokosraspeln\nAlles vermischen und genießen.");
check("Hände voll bleibt Zutat", pt.ingredients.some(x => x.key === "himbeere" && x.unit === "Handvoll"), pt.ingredients.map(x => x.raw));
check("Topping-Liste getrennt + optional", pt.ingredients.filter(x => x.optional).length >= 2, pt.ingredients.map(x => [x.name, x.optional]));
pt = K.parseText("Green Pea Pasta\nRecipe (Serves 4):\n1. Cook the pasta.\n2. In a blender, blend 1 540ml can white beans, 2 cups of thawed peas, 1/4 cup nutritional yeast and 1 cup soy milk until smooth.\n3. Add the juice of 1/2 lemon.");
check("Zutaten aus dem Fließtext", pt.ingredients.length >= 4 && pt.ingredientsFromSteps, pt.ingredients.map(x => x.name));
check("½ Bund frische Petersilie bleibt zusammen", K.parseText("Pesto\nZutaten\n½ Bund frische Petersilie 50 g Pinienkerne 30 g Parmesan 100 ml Olivenöl 1 Knoblauchzehe Salz Pfeffer Zubereitung Alles pürieren und abschmecken. Fertig ist das Pesto für Pasta oder Brot, schmeckt auch auf Bowls und hält sich im Kühlschrank etwa eine Woche lang gut verschlossen.").ingredients.some(x => x.key === "petersilie" && x.unit === "Bund"));
check("Schritt-Zeile keine Zutat", K.parseIngredientLine("Den Salat hineingeben und alles gut vermengen") === null);
check("Mathematische Buchstaben", K.normalizeFancy("𝐅𝐔𝐋𝐋 𝐑𝐄𝐂𝐈𝐏𝐄") === "FULL RECIPE");
// Wo steht das Rezept?
const loc = c => K.recipeLikelihood(K.analyse({ caption: c, url: "https://www.instagram.com/reel/X/" }), c, "https://www.instagram.com/reel/X/");
check("Blog (fette Schrift)", loc("Tofu Shawarma\n\n𝐅𝐔𝐋𝐋 𝐑𝐄𝐂𝐈𝐏𝐄 𝐎𝐍 𝐌𝐘 𝐁𝐋𝐎𝐆\n𝐃𝐫𝐯𝐞𝐠𝐚𝐧𝐛𝐥𝐨𝐠 𝐝𝐨𝐭 𝐜𝐨𝐦 (𝐋𝐈𝐍𝐊 𝐈𝐍 𝐌𝐘 𝐁𝐈𝐎)\n#healthyrecipe").wo === "blog");
check("Kommentar", loc("Salmon Sushi Bowl #sushibowl #easyrecipe\n\n➡️ FULL RECIPE IN THE PINNED COMMENT").wo === "kommentar");
check("Nachricht", loc("Malai Kofta\n\nComment “recipe” for the full recipe straight to your DMs! #curry #easyrecipe").wo === "nachricht");
check("Kochbuch", loc("This Lasagne is pg. 196 of my cookbook. #lasagne #highprotein").wo === "kochbuch");
check("Restaurant ist kein Rezept", !loc("Thai green curry soup with lentils 📌 On the menu now at our restaurant").recipe);
// Portionen
let ana = K.analyse({ caption: "Blechkuchen mit Zimt\nZutaten:\n300 g Mehl\n150 g Zucker\n1 Pck Backpulver\n200 ml Haferdrink\nZubereitung:\nAlles verrühren und auf dem Backblech verteilen.\nBei 180 °C 25 Minuten backen." }).recipe;
check("Backblech = 20 Stück", ana.servings === 20 && ana.servingsUnit === "Stück" && ana.servingsEstimated, [ana.servings, ana.servingsBasis]);
ana = K.analyse({ caption: "Freezer Cookies\nZutaten:\n200 g Haferflocken\n100 g Erdnussbutter\n50 ml Ahornsirup\nZubereitung:\nAlles mischen, 12 Cookies formen.\nEinfrieren." }).recipe;
check("12 Cookies = 12 Stück", ana.servings === 12 && ana.servingsUnit === "Stück", [ana.servings, ana.servingsUnit]);
ana = K.analyse({ caption: "Green Smoothie\nZutaten:\n1 Banane\n1 Handvoll Spinat\n200 ml Haferdrink\nZubereitung:\nAlles mixen.\nGenießen." }).recipe;
check("Smoothie = 1 Portion", ana.servings === 1, ana.servings);
ana = K.analyse({ caption: "Linsen-Curry\nZutaten:\n300 g rote Linsen\n400 ml Kokosmilch\n1 Zwiebel\n2 EL Olivenöl\n400 g gehackte Tomaten\nZubereitung:\nZwiebel anbraten.\nAlles 20 Minuten köcheln." }).recipe;
check("ohne Angabe: Nachfrage vorgemerkt", ana.servingsPending === "energie" && ana.askServings);
K.berechneNaehrwerte(ana, NW);
check("Portionen aus Energie geschätzt", ana.servings >= 3 && ana.servings <= 5 && ana.servingsEstimated, [ana.servings, ana.nutrition.values.kcal]);
// Labels
check("Labels gruppiert, Gang zuerst", ana.labels[0].gruppe === "Gang" && ana.labels.some(l => l.gruppe === "Hauptzutat" && l.label === "Hülsenfrüchte") && !ana.labels.some(l => l.gruppe === "Creator"), ana.labels);
check("Labels: Zeit", ana.labels.some(l => l.gruppe === "Zeit"));
// Nährwerte: Zustand
const reisRoh = K.analyse({ caption: "Reis\nZutaten:\n100 g Reis\n1 Prise Salz\nZubereitung:\nKochen.\nFertig." }).recipe;
const reisGek = K.analyse({ caption: "Reis\nZutaten:\n100 g gekochter Reis\n1 Prise Salz\nZubereitung:\nAufwärmen.\nFertig." }).recipe;
K.berechneNaehrwerte(reisRoh, NW, 1); K.berechneNaehrwerte(reisGek, NW, 1);
check("roh vs. gekocht", reisRoh.nutrition.values.kcal > reisGek.nutrition.values.kcal * 2, [reisRoh.nutrition.values.kcal, reisGek.nutrition.values.kcal]);
const dose = K.analyse({ caption: "Hummus\nZutaten:\n1 Dose Kichererbsen\n2 EL Tahin\nZubereitung:\nPürieren.\nFertig." }).recipe;
K.berechneNaehrwerte(dose, NW, 1);
check("Dose = abgetropft (Konserve)", dose.nutrition.details.some(d => /Konserve, abgetropft/.test(d.bls) && d.gramm === 240), dose.nutrition.details);
// Zuordnungs-Vorschläge
const SU = require("../daten/bls-suche.json");
check("Vorschlag veganer Reibekäse", K.zuordnungsVorschlaege("Veganer Reibekäse", SU, 3).some(v => /Käsealternative/.test(v.name)));
const eig = K.analyse({ caption: "Test\nZutaten:\n100 g Fantasiezutat\n100 g Reis\nZubereitung:\nKochen.\nFertig." }).recipe;
K.berechneNaehrwerte(eig, NW, 1, { zuordnungen: { fantasiezutat: { name: "Test", n: { kcal: 100 } } } });
check("eigene Zuordnung zählt", eig.nutrition.coverage.unmatched.length === 0 && eig.nutrition.details.some(d => d.eigene));
// Einkaufsliste
const mk = (t, lines) => ({ recipe: K.analyse({ caption: t + "\nZutaten:\n" + lines.join("\n") + "\nZubereitung:\nAlles mischen.\nServieren." }).recipe });
const shop = K.shoppingList([mk("A", ["2 EL Olivenöl", "1 Zwiebel"]), mk("B", ["50 ml Olivenöl", "150 g Zwiebeln"]), mk("C", ["1 TL Olivenöl"])], {}, NW);
const oil = shop.find(x => x.key === "olivenöl"), oni = shop.find(x => x.key === "zwiebel");
check("Einkauf: Öl zusammengerechnet", oil && /^ca\. \d+ ml Olivenöl$/.test(oil.text) && oil.partsText === "2 EL · 50 ml · 1 TL", oil);
check("Einkauf: Zwiebeln auf Stück", oni && /^ca\. 3 Zwiebeln$/.test(oni.text), oni && oni.text);
check("Grundvorrat: Olivenöl vorhanden, Zwiebel nicht", oil.have === true && oni.have === false);
check("Grundvorrat: Zucker nicht standard", K.standardVorrat()["zucker"].have === false && K.standardVorrat()["balsamico"].have === true);
const shop2 = K.shoppingList([mk("A", ["2 EL Olivenöl"])], { "olivenöl": { have: false } }, NW);
check("Vorrat-Einstellung gewinnt", shop2[0].have === false);
// Bibliothek
const imp = K.importNeue(["ig:AAA"], [{ id: "AAA" }, { id: "BBB" }, { id: "BBB" }]);
check("Re-Import: nur Neues", imp.neu.length === 1 && imp.neu[0].id === "BBB" && imp.vorhanden.length === 2);
let st = {}, asks = [];
for (let n = 1; n <= 16; n++) { const f = K.folgenVorschlag(st, "dr.vegan"); asks.push(f.fragen ? n : 0); if (n === 5) K.folgenAntwort(st, "dr.vegan", "gefolgt"); }
check("Folgen: beim 5. und 15. Rezept eines Kanals vorschlagen", asks.filter(Boolean).join() === "5,15", asks);
const st2 = {}; K.folgenVorschlag(st2, "x", 1); K.folgenAntwort(st2, "x", "nie");
check("Folgen: „nie“ wird respektiert", !K.folgenVorschlag(st2, "x", 5).fragen && !K.folgenVorschlag(st2, "x", 15).fragen);
check("Folgen: zählt vorhandene Rezepte (Anzahl aus der App)", K.folgenVorschlag({}, "y", 5).fragen);
// Blog-Suche
const pr = K.analyse({ caption: "Spicy Peanut Noodles 🍜\nIngredients:\nNoodles • Peanut butter • Garlic\nFULL RECIPE ON MY BLOG Drveganblog dot com" }).recipe;
const wprm = '<div class="wprm-recipe"><h2 class="wprm-recipe-name">Spicy Peanut Noodles</h2><span class="wprm-recipe-servings">2</span><ul><li class="wprm-recipe-ingredient">200 g noodles</li><li class="wprm-recipe-ingredient">2 tbsp peanut butter</li><li class="wprm-recipe-ingredient">2 cloves garlic</li></ul><div class="wprm-recipe-instruction-text">Cook the noodles.</div><div class="wprm-recipe-instruction-text">Mix the sauce.</div></div>';
const blog = K.parseRecipeHtml(wprm, "https://drveganblog.com/spicy-peanut-noodles/");
check("Rezeptkarte (WPRM) gelesen", blog && blog.ingredients.length === 3 && blog.steps.length === 2 && blog.servings === 2, blog);
check("Treffer per Zutaten geprüft", K.pruefeBlogTreffer(pr, blog).passt, K.pruefeBlogTreffer(pr, blog));

// Übersetzung aus dem Kurzbefehl (Apple-Übersetzer)
const enCap = "Lemon Pasta\nIngredients:\n200 g spaghetti\n1 lemon\n2 tbsp olive oil\nInstructions:\n1. Cook the pasta.\n2. Mix with lemon and oil.";
const deCap = "Zitronenpasta\nZutaten:\n200 g Spaghetti\n1 Zitrone\n2 EL Olivenöl\nAnleitung:\n1. Die Nudeln kochen.\n2. Mit Zitrone und Öl mischen.";
const trA = K.analyse({ caption: enCap, captionDe: deCap }).recipe;
check("Schritte deutsch aus Übersetzung", trA.steps[0] === "Die Nudeln kochen." && trA.stepsOriginal[0] === "Cook the pasta." && trA.lang === "de", trA.steps);
check("Zutaten weiter aus dem Original", trA.ingredients.some(i => i.key === "spaghetti" && i.qty === 200));

// Rezeptsprache statt "Sie"-Form (echte Ausgabe von Apples Übersetzer, iPhone 11, iOS 26.6.1)
check("Sie-Form -> Infinitiv", K.rezeptStil("Kochen Sie die Nudeln in Salzwasser, bis sie al dente sind.") === "Die Nudeln in Salzwasser kochen, bis sie al dente sind.", K.rezeptStil("Kochen Sie die Nudeln in Salzwasser, bis sie al dente sind."));
check("Trennbares Verb", K.rezeptStil("Geben Sie das Öl hinzu.") === "Das Öl hinzugeben.", K.rezeptStil("Geben Sie das Öl hinzu."));
check("Ohne Sie unverändert", K.rezeptStil("Mit Olivenöl, Zitronenschale und Parmesan vermischen.") === "Mit Olivenöl, Zitronenschale und Parmesan vermischen.");
check("Ihre -> die", K.rezeptStil("Heizen Sie Ihren Ofen auf 200 °C vor.") === "Den Ofen auf 200 °C vorheizen.", K.rezeptStil("Heizen Sie Ihren Ofen auf 200 °C vor."));

// Schritte, Überschriften und Titel aus echten Captions (Export 2, Oktober 2026) – nachgebaut
const lasCap = "LASAGNA SOUP (plant-based) 🥫\n\nI wasn’t 100% convinced… you HAVE to make this 🤤\n\nINGREDIENTS (serves 4)\n\n1 brown onion, finely diced\n2x 400g tins cooked brown lentils, drained + rinsed\nSmall glass white wine (or glug of cider)\n1.25 litres hot vegetable stock\nLarge handful fresh basil, leaves roughly chopped\nOlive oil, salt + black pepper\n\nMETHOD (pinned in comments 👇)";
const las = K.analyse({ caption: lasCap }).recipe;
check("2x 400g Dosen = 2 Dosen à 400 g", las.ingredients.some(i => i.qty === 2 && i.unit === "Dose" && /linsen/i.test(i.name)), las.ingredients.map(i => [i.qty, i.unit, i.name]));
check("Liter erkannt", las.ingredients.some(i => i.unit === "l" && i.qty === 1.25));
check("Basilikum mit Hinweis bleibt eine Zutat", las.ingredients.some(i => /basilikum/i.test(i.name) && /grob gehackt/.test(i.note)) && !las.ingredients.some(i => /^leaves/i.test(i.name)), las.ingredients.map(i => i.name));
check("Lasagne-Suppe ist Suppe", las.category === "Suppe & Eintopf" && las.title === "Lasagne-Suppe", [las.title, las.category]);
const lin = K.analyse({ caption: "10 Tage antientzündliche Rezepte für Faule ‼️ Heute ist Tag 4 und ich glaube mein Blick sagt alles 🙃\n\nRezept (2-3 Portionen)\n200g gekochte braune Linsen\n200g Süßkartoffel\n1/2 Gurke\n1/2 Avocado\n\nDressing\n2EL Tomatenmark\n1EL Leinöl\n\n1. Den Backofen auf 200 Grad vorheizen.\n2. Linsen und Süßkartoffel 20 Minuten backen.\n3. Alles mit dem Dressing vermischen." }).recipe;
check("Erzähl-Zeile nicht als Schritt", lin.steps.length === 3 && /Backofen/.test(lin.steps[0]), lin.steps);
check("'Dressing' ist keine Zutat", !lin.ingredients.some(i => /^dressing$/i.test(i.name)), lin.ingredients.map(i => i.name));
check("Titel aus Hauptzutaten statt Zutatenzeile", lin.title === "Linsen-Süßkartoffel-Salat", lin.title);
const kof = K.analyse({ caption: "If you’re celebrating: Shubh diwali! And if not you can celebrate this recipe for this vegan version of an Indian classic.\nMALAI KOFTA (3-4 servings, 1h prep time):\n-340g potatoes\nCook until fork tender and mash\n-2 blocks (400g) firm tofu\nKnead until it‘s a dough and shape into little balls.\n-\nWenn ihr feiert: Shubh diwali! Und wenn nicht, genießt dieses Rezept für eine vegane Version dieses indischen Klassikers.\nMALAI KOFTA (3-4 Portionen, 1 Stunde Zubereitungszeit):\n-340g Kartoffeln\nKochen, bis sie weich sind und zerdrücken\n-2 Blöcke (400g) Tofu\nKneten, bis ein Teig entsteht, und daraus kleine Kugeln formen." }).recipe;
check("Zweisprachig mit Trennstrich: nur Deutsch", kof.steps.every(s => K.langOfText(s) !== "en") && kof.steps.length === 2, kof.steps);
check("Titel ohne Portionsklammer", kof.title === "Malai Kofta", kof.title);
const tt = (c) => K.analyse({ caption: c }).recipe.title;
check("Titel: 'This super easy … is' -> Gericht", tt("This super easy Vegan Pot Pie is the cosiest dinner.\nComment PIE for the recipe") === "Vegan Pot Pie", tt("This super easy Vegan Pot Pie is the cosiest dinner.\nComment PIE for the recipe"));
check("Titel: 'Gewinnspiel' ist kein Gericht", !/gewinnspiel/i.test(tt("Schnell gemacht 💪\n\n* Gewinnspiel / Anzeige *\n\nZutaten:\n200 g Tofu\n1 EL Sojasauce\n2 EL Hummus\nZubereitung:\n1. Tofu anbraten.")));
check("Titel: Serie 'Nr. 5' + nächste Zeile", tt("FAVORITE SAUCE NR. 5 😋\nAmba 🥭\n\nAmba means mango in Marathi.\nRECIPE (10 servings):\n-1 onion\n-3 cloves garlic\nSauté for a few minutes.") === "Amba", tt("FAVORITE SAUCE NR. 5 😋\nAmba 🥭\n\nAmba means mango in Marathi.\nRECIPE (10 servings):\n-1 onion\n-3 cloves garlic\nSauté for a few minutes."));
check("Titel: Zeit-Vorsatz entfernt", /kichererbsen/i.test(tt("15min tomato-chickpeas 😋\n\nRECIPE (1 serving):\n-1 onion, sliced\n-150g cherry tomatoes, halved\nSauté in oil\n-400g chickpeas")), tt("15min tomato-chickpeas 😋\n\nRECIPE (1 serving):\n-1 onion, sliced\n-150g cherry tomatoes, halved\nSauté in oil\n-400g chickpeas"));
check("Kategorie: 'glatte Petersilie' ist kein Latte", K.analyse({ caption: "Veganer Schmortopf\n\n250 g Kräuterseitlinge\n1 Zwiebel\n150 ml Rotwein\n15 g glatte Petersilie" }).recipe.category !== "Getränk");
check("Nährwert-Zeile nicht als Schritt", !K.analyse({ caption: "Pasta\nZutaten:\n200 g Nudeln\n1 Zwiebel\nZubereitung:\n1. Nudeln kochen.\n2. Zwiebel anbraten.\nFett: 34g\nPortionen: 2 | Schwierigkeitsgrad: einfach" }).recipe.steps.some(s => /Fett|Schwierigkeit/.test(s)));
const hd = K.uebersetzeSchritte({ steps: ["## For the sauce", "Mix everything."] }, ["Für die Sauce", "Alles vermischen."]);
check("Überschrift bleibt nach Übersetzung Überschrift", hd.steps[0] === "## Für die Sauce" && hd.steps[1] === "Alles vermischen.", hd.steps);
const nlR = K.analyse({ caption: "Chipotle tofu bowl\nIngrediënten:\n400 g tofu\n1 blik zwarte bonen\nBereiding:\n1. Meng de tomatenpuree met de olie tot een marinade.\n2. Schep de tofu erdoor en bak 25 min." }).recipe;
check("Niederländisch erkannt", K.detectLang(nlR) === "nl", K.detectLang(nlR));
K.uebersetzeZutaten(nlR, ["400 g Tofu", "1 Dose schwarze Bohnen"]);
check("Zutaten-Übersetzung eingelesen", nlR.ingredients[1].unit === "Dose" && /bohnen/i.test(nlR.ingredients[1].name) && nlR.ingredients[1].nameOriginal, nlR.ingredients[1]);

// Video: gesprochener Text und Text aus Videobildern (Kurzbefehl, iPhone)
const trEn = K.analyse({ transcript: "Hey guys, welcome back. Today we are making a creamy lentil curry. First add one onion and two cloves of garlic to a pan with some olive oil. Then add 200 grams of red lentils and one can of coconut milk. Stir in 2 tablespoons of curry powder and let it simmer for 20 minutes. Finally add a handful of spinach and serve with rice. Make sure to follow for more recipes." }).recipe;
check("Transkript EN: Zutaten mit Mengen", trEn.ingredients.length >= 5 && trEn.ingredients.some(i => i.key === "rote linse" && i.qty === 200) && trEn.ingredients.some(i => i.unit === "Dose"), trEn.ingredients.map(i => [i.qty, i.unit, i.name]));
check("Transkript EN: Schritte ohne Begrüßung/Werbung", trEn.steps.length === 4 && !trEn.steps.some(s => /welcome|follow/i.test(s)), trEn.steps);
check("Transkript EN: Titel aus 'we are making'", /linsen-curry/i.test(trEn.title), trEn.title);
const trDe = K.analyse({ transcript: "Hallo ihr Lieben. Heute gibt es Ofengemüse. Zuerst schneidest du 500 Gramm Kartoffeln und eine rote Paprika klein. Dann kommen zwei Esslöffel Olivenöl und ein Teelöffel Paprikapulver dazu. Alles gut vermischen und 30 Minuten bei 200 Grad backen. Zum Schluss 200 Gramm Feta darüber bröseln." }).recipe;
check("Transkript DE: Nomen ohne Verbreste", trDe.ingredients.some(i => i.name === "Feta" && i.qty === 200) && trDe.ingredients.some(i => /paprika/i.test(i.name) && i.qty === 1), trDe.ingredients.map(i => i.name));
check("Transkript DE: 4 Schritte", trDe.steps.length === 4, trDe.steps);
const fr = K.mergeFrameText("Linsen-Curry\nGefällt 1.234 Mal\n200 g rote\n200 g rote Linsen\nLinsen-Curry\n1 Dose Kokosmilch\n12:30\n@veganchef\n1 Dose Kokosmilch\nAlles 20 Min köcheln");
check("Videobilder: doppelte Zeilen und Instagram-Bedienung weg", fr === "Linsen-Curry\n200 g rote Linsen\n1 Dose Kokosmilch\nAlles 20 Min köcheln", fr);
// Nährwerte: neue Zuordnungen, niederländische Namen, Arbeitsschritte sind keine Zutaten
const NW2 = require("../daten/naehrwerte.json");
const nwR = K.analyse({ caption: "Test\nZutaten:\n300 g Austernpilze\n200 ml Rotwein\n1 Feta\n2 el olijfolie\n3 tenen knoflook\nablöschen.\nEINRÜHREN\nZubereitung:\n1. Alles braten." }).recipe;
check("Arbeitsschritte nicht als Zutat", !nwR.ingredients.some(i => /ablöschen|einrühren/i.test(i.name)), nwR.ingredients.map(i => i.name));
check("Niederländische Zutaten übersetzt", nwR.ingredients.some(i => i.name === "Olivenöl" && i.unit === "EL") && nwR.ingredients.some(i => /knoblauch/i.test(i.name)), nwR.ingredients.map(i => i.name));
K.berechneNaehrwerte(nwR, NW2, null, {});
check("Nährwerte: Austernpilze, Rotwein, Feta bekannt", nwR.nutrition.coverage.unmatched.length === 0, nwR.nutrition.coverage.unmatched);
check("Portionen: 'for 1-2 hours' ist keine Portionsangabe", K.analyse({ caption: "Stew\nIngredients:\n* 2 cups lentils, soaked for 1-2 hours\n* 1 onion\nMethod:\n1. Cook everything." }).recipe.servings !== 1);
check("Englischer Titel erkannt", K.isEnglishTitle("Romesco-Style Butter Beans") && !K.isEnglishTitle("Linsen-Curry") && !K.isEnglishTitle("Pasta alla vodka"));

// Zutaten je Schritt, Gruppen und geschätzte Mengen
const grp = K.analyse({ caption: "Linsensalat\nZutaten:\n200 g Linsen\n1 Gurke\nDressing\n2 EL Tomatenmark\n1 EL Leinöl\nZubereitung:\n1. Die Linsen 20 Minuten kochen.\n2. Alle Zutaten für das Dressing verrühren.\n3. Linsen mit den restlichen Zutaten vermengen." }).recipe;
const gm = K.stepIngredients(grp), nm = (k) => gm[k].map(n => grp.ingredients[n].name);
check("Gruppe 'Dressing' erkannt", grp.ingredients.filter(i => i.group === "Dressing").length === 2, grp.ingredients.map(i => [i.group, i.name]));
check("Schritt-Zutaten: Linsen", nm(0).join() === "Linsen", nm(0));
check("Schritt-Zutaten: 'alle Zutaten für das Dressing'", nm(1).length === 2 && nm(1).includes("Tomatenmark"), nm(1));
check("Schritt-Zutaten: 'restliche Zutaten' = Gurke", nm(2).includes("Gurke") && !nm(2).includes("Tomatenmark"), nm(2));
const est = K.analyse({ caption: "Pasta\nFür 2 Portionen\nZutaten:\nSpaghetti\nOlivenöl\n2 Tomaten\nSalz\nZubereitung:\n1. Spaghetti kochen.\n2. Mit Öl und Tomaten mischen." }).recipe;
const sp = est.ingredients.find(i => i.key === "spaghetti");
check("Fehlende Menge geschätzt und markiert", sp.qty === 200 && sp.unit === "g" && sp.qtyEstimated, sp);
check("Salz bleibt ohne Menge", est.ingredients.find(i => i.key === "salz").qty == null);
check("Erzählsatz ist kein Schritt", !K.analyse({ caption: "Curry\nZutaten:\n200 g Reis\n1 Zwiebel\n2 EL Öl\nZubereitung:\n1. Reis kochen.\n2. Meine Mutter hat das früher oft gemacht und ich liebe es.\n3. Zwiebel anbraten." }).recipe.steps.some(s => /Mutter/.test(s)));

// T1 (iPhone 11, Live Text aus Bildschirmfoto eines Reels, Namen anonymisiert)
const t1 = "18:40\n‹ one sec\n40\nHERBST REZEPT ZUM ABNEHMEN\nHokkaido\nKürbis\nRinderhack\nCherry-tomaten\nstückige Tomaten\nFeta\n422 kcal\nE: 45 g, K: 31 g, F: 13 g\nbeispiel.wiki\nFolgen\nDiese Low Carb Kürbispfanne kannst Du praktisch jeden Tag während Deiner Diät essen. Denn sie ..\nperson.a und 1 weitere Person sind Follower\n9\n＝\nKommentar hinzufügen …";
const t1r = K.analyse({ ocrText: t1 }).recipe;
check("T1: Zutaten ohne Bedienelemente", t1r.ingredients.length === 5 && t1r.ingredients.some(i => i.name === "Hokkaido Kürbis") && !t1r.ingredients.some(i => /follower|kommentar|wiki|kcal/i.test(i.raw)), t1r.ingredients.map(i => i.raw));
check("T1: Titel ist das Gericht", /kürbispfanne/i.test(t1r.title), t1r.title);
check("T1: Creator-Nährwerte E/K/F gelesen", t1r.nutritionDeclared && t1r.nutritionDeclared.protein === 45 && t1r.nutritionDeclared.fat === 13, t1r.nutritionDeclared);
check("T1: Werbesatz kein Schritt", t1r.steps.length === 0, t1r.steps);

// Einbettungstext vom Kurzbefehl (Zeilen), verschiedene Varianten
const capX = "Linsen-Curry 🍛\nZutaten:\n200 g rote Linsen\n1 Dose Kokosmilch\nZubereitung:\n1. Alles 20 Minuten köcheln.";
const embDE = "\n\nkoch.lisa\nVerifiziert\nOriginal-Audio\nProfil ansehen\n\nkoch.lisa\n12 Beiträge · 3K Follower\n\n\nMehr auf Instagram ansehen\n\nGefällt mir\nKommentieren\nTeilen\nSpeichern\nGefällt 1.234 Mal\nkoch.lisa\n\n" + capX + "\nAlle 12 Kommentare ansehen\nKommentieren …\nInstagram\n";
const embNoLike = "\n\nkoch.lisa\nProfil ansehen\n\nMehr auf Instagram ansehen\n\nGefällt mir\nKommentieren\nTeilen\nSpeichern\nkoch.lisa\n\n" + capX + "\nKommentar hinzufügen …\nInstagram\n";
const embEN = "\n\nkoch.lisa\nView profile\n\nView more on Instagram\n\nLike\nComment\nShare\nSave\nLiked by anna and others\nkoch.lisa\n\n" + capX + "\nAdd a comment…\nInstagram\n";
[["DE", embDE], ["ohne Likes", embNoLike], ["EN", embEN]].forEach(([n, e]) => { const r = K.parseInstagramEmbed(e); check("Einbettung " + n + ": Beschreibung und Konto", r && r.caption === capX && r.account === "koch.lisa", r); });
check("Einbettung ohne Beschreibung -> null", K.parseInstagramEmbed("\n\nDieser Beitrag ist nicht verfügbar\nMehr auf Instagram ansehen\nInstagram\n") === null);

// Lernen ohne KI
const LL = K.neuerLernspeicher();
const capL = (n) => "Rezept " + n + "\nZutaten:\n200 g Nudeln\n1 Zwiebel\nZubereitung:\n1. Nudeln kochen.\n2. Zwiebel anbraten.\nFolge meinem Kanal für noch mehr schnelle Rezepte jeden Tag\nRezept für 2 Portionen";
let gelernt = [];
for (let n = 1; n <= 3; n++) { const inp = { caption: capL(n), account: "koch.lisa" }; gelernt = gelernt.concat(K.lerneAusRezept(LL, inp, K.analyse(inp, { lernen: [LL] }).recipe)); }
check("Lernen: Creator-Floskel nach 3 Rezepten", gelernt.some(x => /folge meinem kanal/.test(x)) && !gelernt.some(x => /portionen/.test(x)), gelernt);
const neuR = K.analyse({ caption: capL(4) + "\nFolge meinem Kanal für noch mehr schnelle Rezepte jeden Tag", account: "koch.lisa" }, { lernen: [LL] }).recipe;
check("Lernen: Floskel wird ausgeblendet, Portionen bleiben", neuR.servings === 2 && !/folge/i.test((neuR.description || "") + neuR.steps.join(" ")), [neuR.servings, neuR.description]);
const altR = K.analyse({ caption: "Curry\nZutaten:\n200 g Reis\nTofu-Tipp vom Bauern\nZubereitung:\n1. Reis kochen.\n2. Am Sonntag mit Zitrone darüber geben.\n3. Servieren." }).recipe;
const neuK = JSON.parse(JSON.stringify(altR)); neuK.steps = neuK.steps.filter(s => !/Sonntag/.test(s));
const kor = K.lerneKorrektur(LL, altR, neuK);
check("Lernen: entfernter Schritt wird Regel", kor.length === 1 && Object.keys(LL.keinSchritt).length === 1, kor);
check("Lernen: Regel wirkt bei neuer Auswertung", !K.analyse({ caption: "Curry\nZutaten:\n200 g Reis\nZubereitung:\n1. Reis kochen.\n2. Am Sonntag mit Zitrone darüber geben." }, { lernen: [LL] }).recipe.steps.some(s => /Sonntag/.test(s)));
const ex = K.lernExport(LL, { app: "test" });
check("Lernen: Export enthält Regeln, keine Rezepttexte", ex.regeln.keinSchritt.length === 1 && ex.regeln.floskeln["koch.lisa"] && !JSON.stringify(ex).includes("200 g Nudeln"), ex);

const fl0 = Object.keys(K.lernRegeln([LL]).floskeln["koch.lisa"] || {});
LL.keineFloskel = {}; fl0.forEach(x => { LL.keineFloskel[x] = 1; });
check("Lernen: gelöschte Floskel wird nicht mehr angewendet", fl0.length > 0 && !Object.keys(K.lernRegeln([LL]).floskeln["koch.lisa"] || {}).length, fl0);
const zentralTest = { floskeln: { "koch.lisa": fl0 } };
check("Lernen: zentrale Regeln gelten ohne lokalen Speicher", Object.keys(K.lernRegeln([zentralTest]).floskeln["koch.lisa"] || {}).length === fl0.length);

// Nährwerte selbst eintragen: Plausibilitätsprüfung
const BLS = require("../daten/bls-suche.json");
const pOk = K.pruefeNaehrwerte({ kcal: 540, fat: 31, satFat: 19, carbs: 58, sugar: 56, fiber: 2, protein: 5, salt: 0.2 }, { name: "Schokolade", suche: BLS });
check("Nährwerte: plausible Verpackungswerte ohne Fehler und Hinweise", pOk.ok && !pOk.hinweise.length, pOk);
const pKj = K.pruefeNaehrwerte({ kcal: 2260, fat: 31, carbs: 58, protein: 5 }, {});
check("Nährwerte: Kilojoule werden erkannt und umgerechnet", !pKj.ok && pKj.kcalAusKj === 540, pKj);
check("Nährwerte: Summe über 100 g (Portion statt 100 g) ist ein Fehler", !K.pruefeNaehrwerte({ kcal: 500, fat: 30, carbs: 70, protein: 25 }).ok);
check("Nährwerte: Zucker größer als Kohlenhydrate ist ein Fehler", !K.pruefeNaehrwerte({ kcal: 200, fat: 0, carbs: 40, sugar: 60, protein: 10 }).ok);
check("Nährwerte: Erythrit (0 kcal) gibt nur einen Hinweis", (r => r.ok && r.hinweise.length === 1)(K.pruefeNaehrwerte({ kcal: 0, fat: 0, carbs: 100, protein: 0 })));
check("Nährwerte: Abweichung vom BLS wird gemeldet", K.pruefeNaehrwerte({ kcal: 60, fat: 1, carbs: 10, protein: 2 }, { name: "Kokosöl", suche: BLS }).hinweise.some(h => /BLS/.test(h)));
const eigNw = K.eigenerNaehrwert("Proteinpudding", { kcal: 80, fat: 1.5, carbs: 6, protein: 10 }, { stk: 200, quelle: "Verpackung" });
const rP = K.analyse({ caption: "Zutaten:\n1 Proteinpudding\n100 g Haferflocken\n\nZubereitung:\n1. Haferflocken mit dem Pudding verrühren und genießen." }).recipe;
K.berechneNaehrwerte(rP, require("../daten/naehrwerte.json"), null, { zuordnungen: { [rP.ingredients[0].key]: eigNw } });
check("Nährwerte: eigene Angabe mit Stückgewicht fließt in die Rechnung", rP.nutrition.details.some(d => d.herkunft === "eigene Angabe" && d.gramm === 200), rP.nutrition.details);
const exN = K.lernExport(K.neuerLernspeicher(), { zuord: { proteinpudding: Object.assign({ zutat: "Proteinpudding" }, eigNw), x: { geprueft: true, name: "zentral" } } });
check("Nährwerte: Export enthält eigene Angaben mit Quelle, keine zentralen", exN.naehrwerte.proteinpudding.quelle === "Verpackung" && !exN.naehrwerte.x, exN.naehrwerte);

// Teilen-Probleme lernen
const dg = K.teilenDiagnose("REZEPTBUCH\nhttps://www.instagram.com/reel/AbC123\n###TEXT###\nkoch.lisa\nProfil ansehen\nGefällt mir\nKommentieren\nTeilen\nSpeichern\nkoch.lisa\nDas ist ein sehr langer Rezepttext, der nicht in der Diagnose landen darf, weil er Inhalt ist.\n200 g Nudeln\nInstagram\n###DEUTSCH###\n");
check("Teilen-Diagnose: Link, Kopf und Fuß ohne Rezepttext", dg.link === "https://www.instagram.com/reel/AbC123" && dg.kopf.includes("Speichern") && dg.fuss.includes("Instagram") && !JSON.stringify(dg).includes("Rezepttext"), dg);
const LF = K.neuerLernspeicher();
K.lerneTeilenFehler(LF, { grund: "nicht-gelesen", diagnose: dg }); K.lerneTeilenFehler(LF, { grund: "nicht-gelesen", diagnose: dg });
check("Teilen-Probleme: gleiche Fehler werden gezählt statt doppelt gespeichert", LF.fehler.length === 1 && LF.fehler[0].anzahl === 2);
LF.fehler[0].gesendet = true; K.lerneTeilenFehler(LF, { grund: "keine-daten", diagnose: K.teilenDiagnose("") });
check("Teilen-Probleme: Export enthält nur noch nicht gesendete", K.lernExport(LF, {}).teilenFehler.length === 1);

// 20.10. Tests aus Jakobs iPhone-Test
const rV = K.analyse({ caption: "Vegane Bowl\n\nZutaten:\n200 g Tofu\n2 EL vegane Mayo\n100 ml Hafermilch\n50 g veganer Feta\n1 EL Butter (vegan)\n\nZubereitung:\n1. Tofu anbraten.\n2. Alles mischen." }).recipe;
check("Vegan: vegane Mayo, veganer Feta, Butter (vegan) zählen nicht als tierisch", rV.diet.includes("vegan") && rV.labels.filter(l => l.gruppe === "Ernährung").map(l => l.label).join() === "vegan", rV.labels);
const rC = K.analyse({ caption: "Cremige Pasta #vegan\n\nZutaten:\n250 g Nudeln\n200 ml Sahne\n50 g Parmesan\n\nZubereitung:\n1. Nudeln kochen.\n2. Mit Sahne und Parmesan mischen." }).recipe;
check("Vegan: Creator sagt #vegan -> Sahne/Parmesan sind vegane Alternativen (laut Creator)", rC.diet.includes("vegan") && rC.dietBasis === "laut Creator", [rC.diet, rC.dietBasis]);
const rM = K.analyse({ caption: "Auch vegan möglich: Käsespätzle\n\nZutaten:\n400 g Spätzle\n200 g Bergkäse\n2 Zwiebeln\n\nZubereitung:\n1. Spätzle kochen.\n2. Mit Käse schichten." }).recipe;
check("Vegan: „auch vegan möglich“ macht Käsespätzle nicht vegan, Spätzle nicht glutenfrei", !rM.diet.includes("vegan") && !rM.labels.some(l => l.label === "glutenfrei"), [rM.diet, rM.labels.map(l => l.label)]);
const rG = K.analyse({ caption: "Creamy pasta\n\nIngredients:\n200 g pasta\n150 g Oyster mushrooms\n2 tbsp Nutritional yeast Juice of ½ lemon Chives\nveganer „Kashk“\n300 ml heißes Wasser\n\nInstructions:\n1. Cook the pasta.\n2. Fry the mushrooms." }).recipe;
const gn = rG.ingredients.map(i => i.name);
check("Zutaten: zusammengeklebte Zeile wird getrennt, Austernpilze übersetzt, Anführungszeichen weg, heißes Wasser ist Grundvorrat",
  gn.includes("Hefeflocken") && gn.includes("Zitronensaft") && gn.includes("Schnittlauch") && gn.includes("Austernpilze") && gn.includes("Veganer Kashk") && rG.ingredients.find(i => /wasser/i.test(i.name)).staple, gn);
const rA = K.analyse({ caption: "Cremiger Dip\n\nZutaten:\n150 g Cashews\n100 ml Wasser\n1 Zitrone\n1 TL Salz\n2 EL Granatapfelkerne\n\nZubereitung:\n1. Cashews 2 Stunden einweichen.\n2. Alles mixen bis cremig.\n3. Mit Granatapfelkernen toppen und servieren." }).recipe;
check("Schritte: „Alles mixen“ nennt die gemeinten Zutaten, Toppings bleiben draußen", /Alles \(.*Wasser.*Zitrone.*\) mixen/.test(rA.steps[1]) && !/Granatapfel/.test(rA.steps[1]), rA.steps);
const rT = K.analyse({ caption: "Linsen-Curry\n\nZutaten:\n1 Zwiebel\n200 g rote Linsen\n400 ml Kokosmilch\n1 EL Currypaste\n\nZubereitung:\n1. Zwiebel würfeln und anbraten.\n2. Linsen, Currypaste und Kokosmilch dazugeben und köcheln lassen.\n3. Servieren." }).recipe;
check("Zeit: ohne Angabe aus Arbeitsschritten geschätzt", rT.timeEstimated && rT.timeTotal >= 20 && rT.timeTotal <= 45, rT.timeTotal);
const LZ = K.neuerLernspeicher(); for (let k = 0; k < 3; k++) K.lerneAusRezept(LZ, { caption: "x", url: "u" + k }, K.analyse({ caption: "Suppe\n\nZutaten:\n1 Zwiebel\n500 ml Brühe\n\nZubereitung:\n1. Alles 40 Minuten köcheln lassen." }).recipe);
const rT2 = K.analyse({ caption: "Eintopf\n\nZutaten:\n1 Zwiebel\n500 ml Brühe\n\nZubereitung:\n1. Alles köcheln lassen." }, { lernen: [LZ] }).recipe;
check("Zeit: gelernte Dauer (köcheln ≈ 40 Min.) wird genutzt", LZ.zeiten["köcheln"].n === 3 && rT2.timeTotal >= 40, [LZ.zeiten, rT2.timeTotal]);
check("Lernen: Protokoll je Rezept mit Link, ohne Rezepttext", LZ.protokoll.length === 3 && LZ.protokoll[0].link === "u0" && !JSON.stringify(LZ.protokoll).includes("Brühe"), LZ.protokoll[0]);

// ---------------------------------------------------------------- Zeit (eine Angabe bis zum Essen, 21.10.)
const zt = (cap) => K.analyse({ caption: cap, url: "https://example.org/p/1" }).recipe;
let z = zt("Linsen-Curry\n\nZutaten\n1 Zwiebel\n2 Knoblauchzehen\n200 g rote Linsen\n400 ml Kokosmilch\n1 EL Currypaste\n200 g Reis\n\nZubereitung\nZwiebel und Knoblauch fein würfeln und in Öl glasig dünsten.\nCurrypaste dazugeben und kurz anrösten.\nLinsen und Kokosmilch dazugeben und 25 Minuten köcheln lassen.\nDen Reis in 10 Minuten garen.\nMit Koriander servieren.");
check("Zeit A: „in 10 Minuten“ im Schritt ist nicht die Gesamtzeit", z.timeTotal >= 45 && z.timeTotal <= 60, z.timeTotal);
z = zt("Pilz-Orzotto\n\nIngredients\n250g mushrooms\n2 leeks\n200g orzo\n750ml vegetable stock\n\nMethod\n1. Prep – Tear the mushrooms. Slice the leeks.\n2. Fry mushrooms until golden. Cook the leeks for 5–6 mins until soft. Add garlic and fry for 1 min. Add orzo and toast for 2 mins.\n3. Add stock and simmer for 10 mins, stirring regularly.\n4. Serve with chives.");
check("Zeit B: alle Zeiten eines Schritts zählen", z.timeTotal >= 25 && z.timeTotal <= 45, z.timeTotal); // 28.10.: Schritte ohne Zeit kürzer, wenn das Rezept Zeiten nennt
z = zt("Ofengemüse mit Feta\n\nZubereitungszeit: 15 Minuten\n\nZutaten\n2 Paprika\n1 Zucchini\n200 g Feta\n\nZubereitung\nGemüse in Stücke schneiden und mit Öl mischen.\nFeta in die Mitte legen und 40 Minuten bei 200 °C backen.\nMit Kräutern servieren.");
check("Zeit C: nur Arbeitszeit angegeben → Backzeit kommt dazu", z.timeTotal >= 55 && z.timeTotal <= 65 && z.timePrep === 15, z.timeTotal);
check("Zeit C: „Zubereitungszeit: 15 Minuten“ ist kein Schritt", !z.steps.some(s => /szeit|15 Minuten/.test(s)), z.steps);
z = zt("Over-Night-Brötchen\n\nZutaten\n500 g Mehl\n350 ml Wasser\n5 g Hefe\n10 g Salz\n\nZubereitung\nAlle Zutaten 5 Minuten verkneten.\nDen Teig über Nacht im Kühlschrank gehen lassen.\nAm nächsten Morgen 8 Brötchen formen und 30 Minuten ruhen lassen.\nBei 230 °C 20 Minuten backen.");
check("Zeit D: „über Nacht“ als Hinweis, Rest gezählt", z.timeOvernight === true && z.timeTotal >= 50 && z.timeTotal <= 70, [z.timeTotal, z.timeOvernight]);
z = zt("Bunter Salat\n\nZutaten\n1 Gurke\n3 Tomaten\n1 rote Zwiebel\n1 Paprika\n2 Möhren\n1 Avocado\n1 Bund Petersilie\n100 g Feta\n1 Dose Kichererbsen\n\nZubereitung\nGurke, Tomaten, Zwiebel, Paprika und Möhren klein schneiden. Avocado würfeln, Petersilie hacken.\nKichererbsen abspülen.\nAlles mit dem Dressing vermengen und Feta darüberbröseln.");
check("Zeit E: Schneiden zählt je Zutat", z.timeTotal >= 15 && z.timeTotal <= 30, z.timeTotal); // 28.10.: 2 Min. je Zutat (Messung an 411 Blog-Rezepten)
z = zt("Schnelle Blechpizza\n\nZutaten\n450 g Mehl\n240 g Wasser\n50 g Olivenöl\n1 TL Backpulver\n100 g passierte Tomaten\n1 Mozzarella\n\nZubereitung\nMehl, Wasser, Öl und Backpulver zu einem Teig verkneten und abgedeckt 20 Minuten ruhen lassen. Währenddessen den Ofen auf 220 °C vorheizen.\nTeig ausrollen und aufs Blech legen.\nMit Tomaten und Mozzarella belegen und 20–25 Minuten backen.");
check("Zeit: Pizza mit Ruhe- und Backzeit ≈ 1 Std. (wie Cookidoo)", z.timeTotal >= 55 && z.timeTotal <= 70, z.timeTotal);
z = zt("Ofenlachs\n\nGesamtzeit: 20 Minuten\n\nZutaten\n2 Lachsfilets\n1 Zitrone\n\nZubereitung\nLachs würzen und 45 Minuten bei 180 °C backen.");
check("Zeit: Creator-Angabe kürzer als die Zeiten in den Schritten → korrigiert", z.timeTotal >= 45 && z.provenance.timeTotal === "korrigiert", [z.timeTotal, z.provenance.timeTotal]);
z = zt("Ofenlachs\n\nGesamtzeit: 30 Minuten\n\nZutaten\n2 Lachsfilets\n\nZubereitung\nLachs würzen und 20 Minuten bei 180 °C backen.");
check("Zeit: passende Creator-Angabe bleibt", z.timeTotal === 30 && !z.timeEstimated, z.timeTotal);
z = zt("Quick Pasta\n⏱ Prep: 10 min | Cook: 20 min\n\nIngredients\n200 g pasta\n\nMethod\n1. Cook the pasta.\n2. Serve.");
check("Zeit: Kopfzeile mit Prep und Cook = 30", z.timeTotal === 30 && !z.timeEstimated, [z.timeTotal, z.timePrep, z.timeCook]);
check("Paprika: „1 Paprika“ ist Gemüse, „1 TL Paprika“ Gewürz", K.parseIngredientLine("1 Paprika").key === "paprika" && !K.parseIngredientLine("1 Paprika").staple && K.parseIngredientLine("1 TL Paprika").key === "paprikapulver", [K.parseIngredientLine("1 Paprika"), K.parseIngredientLine("1 TL Paprika").key]);

// ---------------------------------------------------------------- Portionen, Geräte, Vorheizen (21.10.)
check("Runden: 225 g → 230 g, 37,5 g → 40 g, 2,4 g → 2,5 g, 1125 ml → 1150 ml", K.rundeMenge(225, "g") === 230 && K.rundeMenge(37.5, "g") === 40 && K.rundeMenge(2.4, "g") === 2.5 && K.rundeMenge(1125, "ml") === 1150 && K.rundeMenge(3, "EL") === 3);
check("Runden: Zutatenzeile halbiert", K.fmtIngredient(K.parseIngredientLine("450 g Mehl"), 0.5) === "230 g Mehl", K.fmtIngredient(K.parseIngredientLine("450 g Mehl"), 0.5));
const rPz = zt("Schnelle Blechpizza\n\nZutaten\n450 g Mehl\n240 g Wasser\n50 g Olivenöl\n1 TL Backpulver\n100 g passierte Tomaten\n1 Mozzarella\n\nZubereitung\nMehl, Wasser, Öl und Backpulver zu einem Teig verkneten und abgedeckt 20 Minuten ruhen lassen.\nTeig ausrollen und aufs Blech legen.\nMit Tomaten und Mozzarella belegen und 20–25 Minuten bei 220 °C backen.");
check("Skalier-Hinweis: Blech → Form und Backzeit", /Form und Backzeit/.test(K.skalierHinweis(rPz, 0.5) || "") && K.skalierHinweis(rPz, 1) === null, K.skalierHinweis(rPz, 0.5));
check("Geräte: Pizza braucht Backofen, Backblech, Nudelholz", JSON.stringify(K.geraete(rPz)) === JSON.stringify(["Backofen", "Backblech", "Nudelholz"]), K.geraete(rPz));
const vh = K.vorheizHinweis(rPz);
check("Vorheizen: zwei Schritte vor dem Backen, mit Temperatur", vh && vh.schritt === 0 && vh.ofenSchritt === 2 && vh.temperatur === 220, vh);
const rVh = zt("Kuchen\n\nZutaten\n200 g Mehl\n\nZubereitung\nOfen auf 180 °C vorheizen.\nTeig rühren.\nIn die Form geben.\n40 Minuten backen.");
check("Vorheizen: kein Hinweis, wenn das Rezept es schon früh sagt", K.vorheizHinweis(rVh) === null, K.vorheizHinweis(rVh));
const rAf = zt("Pommes\n\nZutaten\n500 g Kartoffeln\n\nZubereitung\nKartoffeln in Stifte schneiden.\nIn der Heißluftfritteuse 20 Minuten backen.");
check("Geräte: Heißluftfritteuse statt Backofen", K.geraete(rAf).includes("Heißluftfritteuse") && !K.geraete(rAf).includes("Backofen"), K.geraete(rAf));

// ---------------------------------------------------------------- Timer, Zutat ausschließen (Paket 2)
check("Timer: Spanne → oberer Wert, Stunden", JSON.stringify(K.schrittTimer("20–25 Minuten backen, dann 1 Std. ruhen lassen.").map(x => x.text)) === JSON.stringify(["25 Min.", "1 Std."]), K.schrittTimer("20–25 Minuten backen, dann 1 Std. ruhen lassen."));
check("Timer: Sekunden und über Nacht nicht", K.schrittTimer("15 Sek./Stufe 6 mixen").length === 0 && K.schrittTimer("Über Nacht 8 Stunden ziehen lassen").length === 0);
const rKo = zt("Curry\n\nZutaten\n1 Bund Koriander\n200 g Reis\noptional: Chili\n\nZubereitung\nAlles kochen.");
check("Ohne Zutat: Koriander trifft, Optionales nicht, kurze Wörter nicht", K.enthaeltZutat(rKo, "Koriander") && !K.enthaeltZutat(rKo, "chili") && !K.enthaeltZutat(rKo, "re") && !K.enthaeltZutat(rKo, "Pilze"));

// Auftrag 1 (21.10.): Gelerntes vollständig – Nährwerte und geänderte Titel
const LT = K.neuerLernspeicher();
K.lerneTitel(LT, { id: "r1", konto: "@koch.lisa", link: "https://www.instagram.com/reel/ABC", automatisch: "Persian Classics in vegan", neu: "Ash Reshteh" });
K.lerneTitel(LT, { id: "r1", konto: "koch.lisa", link: "https://www.instagram.com/reel/ABC", automatisch: "Persian Classics in vegan", neu: "Ash Reshteh (vegan)" });
K.lerneTitel(LT, { id: "r2", konto: "x", automatisch: "Linsensuppe", neu: "linsensuppe" });
const exT = K.lernExport(LT, { zuord: {
  zwiebel: { bls: "G480100", name: "Speisezwiebel roh", n: { kcal: 34 }, art: "stueck", stk: 90, zutat: "Zwiebel" },
  "clear whey": K.eigenerNaehrwert("Clear Whey", { kcal: 380, fat: 2.5, carbs: 6, protein: 80 }, { quelle: "Verpackung", notiz: "Whey", stk: 30, hinweise: ["Hinweis"], zutat: "Clear Whey" }),
  "zentral": { bls: "X", name: "zentral", n: {}, geprueft: true } } });
check("Gelerntes: geänderter Titel geht mit (Konto, Link, automatisch, neu), Doppeltes wird zusammengefasst, gleicher Titel entfällt",
  exT.titel.length === 1 && exT.titel[0].konto === "koch.lisa" && exT.titel[0].neu === "Ash Reshteh (vegan)" && exT.titel[0].automatisch === "Persian Classics in vegan" && exT.titel[0].link, exT.titel);
check("Gelerntes: BLS-Zuordnung mit Stückgewicht und eigene Angabe mit Werten, Quelle, Produkt und Hinweisen gehen mit; zentrale nicht",
  exT.naehrwerte.zwiebel.bls === "G480100" && exT.naehrwerte.zwiebel.stk === 90 && exT.naehrwerte["clear whey"].n.protein === 80 && exT.naehrwerte["clear whey"].quelle === "Verpackung" && exT.naehrwerte["clear whey"].notiz === "Whey" && exT.naehrwerte["clear whey"].stk === 30 && exT.naehrwerte["clear whey"].hinweise.length === 1 && !exT.naehrwerte.zentral, exT.naehrwerte);
LT.titel.forEach(x => { x.gesendet = true; });
check("Gelerntes: gesendete Titel gehen nicht noch einmal mit", K.lernExport(LT, {}).titel.length === 0);
check("Gelerntes: Titel ohne Rezepttext", !JSON.stringify(exT.titel).includes("Zutaten"));

// Titel-Regeln mit Jakob (21.10.): R1 Signal im Text, R2 Hauptzutat, R4 Eigenschaftswörter
const tz = (cap) => K.analyse({ caption: cap }).recipe;
const zut = "\nZutaten:\n200 g Mehl\n2 Zwiebeln\n100 g Spinat\nZubereitung:\nAlles mischen und backen.";
check("R1: „Jetzt aber zu dem Lahmacun“ wird Titel", tz("Schnell gemacht 💪\nHeute gibt es was Feines.\nJetzt aber zu dem Lahmacun 😊" + zut).title === "Lahmacun");
check("R1: „aus palak paneer wird palak tofu“", tz("Einfach zu gut, aus palak paneer wird palak tofu\n#tofu" + zut).title === "Palak Tofu", tz("Einfach zu gut, aus palak paneer wird palak tofu\n#tofu" + zut).title);
check("R1: Serie mit Doppelpunkt, englischer Titel bleibt als Original", (function () { const r = tz("Veganuary 3/25\n25 recipes in 25 minutes: One pot peanut ramen 🍜" + zut); return r.titleOriginal === "One pot peanut ramen" && /Ramen/.test(r.title); })());
check("R1: „vom … Massaman Curry inspiriert“", tz("Anzeige | Thai-Kochkurs. Das Gericht ist vom allseits beliebten Massaman Curry inspiriert." + zut).title === "Massaman Curry");
check("R2: Beilage wird nicht Titel", !/^Basmatireis$/.test(tz("Durch ein Video bin ich auf Enoki Pilze gekommen.\nZutaten:\n300 g Enoki Pilze\n2 EL Öl\nBasmatireis als Beilage\nZubereitung:\nPilze anbraten.").title));
check("R2: Gebäck bekommt den Geschmack", tz("⬇️ zum Rezept ⬇️\nZutaten (12 Muffins):\n250 g Mehl\n150 g Zucker\nSaft von 2 Zitronen\nGuss: Puderzucker mit dem Saft 1/2 Zitrone\nZubereitung:\nAlles verrühren und 20 Minuten backen.").title === "Zitronen-Muffins", tz("⬇️ zum Rezept ⬇️\nZutaten (12 Muffins):\n250 g Mehl\n150 g Zucker\nSaft von 2 Zitronen\nGuss: Puderzucker mit dem Saft 1/2 Zitrone\nZubereitung:\nAlles verrühren und 20 Minuten backen.").title);
check("R4: „sticky“ wird übersetzt", K.translateTitle("sticky lime tofu") === "Klebriger Limetten-Tofu", K.translateTitle("sticky lime tofu"));

// R7/R8 (21.10.): mehrere Rezepte, kein Rezept im Beitrag
const mehr = "My favorite recipes 👇\n\nHummus RECIPE (2 servings, 5min):\n-200g chickpeas\n-2 Tbsp tahini\nBlend until smooth.\n\nLemon cake RECIPE (8 servings, 60min):\n-200g flour\n-1 lemon\nBake for 40 minutes.";
const mr = K.mehrereRezepte(mehr);
check("R7: zwei Rezepte mit Überschrift erkannt", mr && mr.anzahl === 2 && mr.teile[1].titel === "Lemon cake" && /flour/.test(mr.teile[1].text), mr);
const t2r = K.analyse({ caption: mr.teile[1].text, url: "https://www.instagram.com/reel/XYZ/", teil: 2, teilVon: 2, teilTitel: "Lemon cake" }).recipe;
check("R7: Teil hat eigenen Titel und eigene Kennung", K.recipeId(t2r) === "ig:XYZ#2" && t2r.titleOriginal === "Lemon cake" && t2r.title !== "", [K.recipeId(t2r), t2r.title]);
check("R7: „Top 5 Rezepte“ ohne Rezepte im Text", K.mehrereRezepte("Meine Top 5 Rezepte für den Herbst 👇\nKommentiert euren Favoriten!").anzahl === 5);
check("R7: Serien-Zähler ist kein Sammelbeitrag", K.mehrereRezepte("Veganuary 11/25\n25 recipes in under 25 minutes: One pot ramen") === null);
const kr = K.analyse({ caption: "Comment “RECIPE” and I’ll send you a DM to the recipe on my membership page 💚\nYou roast the tofu. You get the gnocchi properly crispy.\nThe full recipe is on my membership page. For less than a coffee per month you get 300+ recipes." }).recipe;
check("R8: kein Rezept – kein geratener Titel, Bezahlseite erkannt", kr.keinRezept && kr.title === "" && kr.elsewhere.wo === "bezahlseite", [kr.title, kr.elsewhere]);

// Ton aus dem Video (23.10.): ergänzt Lücken, ersetzt kein vollständiges Rezept
const tonVoll = K.analyse({
  caption: "Linsen-Dal\nZutaten:\n200 g rote Linsen\n1 Zwiebel\n400 ml Kokosmilch\n1 EL Currypulver\nZubereitung:\nZwiebel würfeln und in Öl anbraten.\nLinsen, Currypulver und Kokosmilch dazugeben und 20 Minuten köcheln lassen.",
  transcript: "Heute machen wir ein Linsen Dal. Das reicht für 4 Portionen und ist in 30 Minuten fertig. Zuerst die Zwiebel anbraten."
});
check("Ton: vollständiges Rezept bekommt Portionen aus dem Ton", tonVoll.recipe.servings === 4 && tonVoll.recipe.provenance.servings === "speech", [tonVoll.recipe.servings, tonVoll.recipe.provenance]);
check("Ton: Zutaten aus der Caption bleiben", tonVoll.recipe.provenance.ingredients !== "speech" && tonVoll.recipe.ingredients.length === 4, tonVoll.recipe.provenance);
const tonLeer = K.analyse({
  caption: "Das beste Pasta-Rezept 🍝 Folgt mir für mehr!",
  transcript: "Today we're making a creamy tomato pasta. You need 250 grams of pasta, 2 cloves of garlic, 400 grams of tomatoes and 100 ml of cream. First cook the pasta in salted water. Then fry the garlic in olive oil. Add the tomatoes and simmer for 10 minutes. Stir in the cream and the pasta."
});
check("Ton: fehlende Zutaten kommen aus dem Ton", tonLeer.recipe.ingredients.length >= 3 && tonLeer.recipe.provenance.ingredients === "speech", tonLeer.recipe.ingredients.map(x => x.name));
check("Ton: fehlende Schritte kommen aus dem Ton", tonLeer.recipe.steps.length >= 2 && tonLeer.recipe.provenance.steps === "speech", tonLeer.recipe.steps);

// Paket 1 (App-Vergleich C2/C3): Zutatenzeilen und Beschreibungen
{
  const z = l => K.parseIngredientLine(l);
  check("C2: 1 TL + 1 EL zusammengezählt", z("1 TL + 1 EL Sojasauce").qty === 4 && z("1 TL + 1 EL Sojasauce").unit === "TL", z("1 TL + 1 EL Sojasauce"));
  check("C2: + mehr zum Braten ist Notiz", z("2 EL Öl + mehr zum Braten").name === "Öl", z("2 EL Öl + mehr zum Braten").name);
  check("C2: n. B. -> nach Belieben", z("Chiliflocken n. B.").name === "Chiliflocken", z("Chiliflocken n. B."));
  check("C2: 1 cup - 2 cups", z("1 cup - 2 cups water") && z("1 cup - 2 cups water").qtyMax != null, z("1 cup - 2 cups water"));
  check("C2: 1 (14-ounce) can", z("1 (14-ounce) can chickpeas").name === "Kichererbsen", z("1 (14-ounce) can chickpeas").name);
  check("C2: einen halben Teelöffel", z("einen halben Teelöffel Salz").qty === 0.5 && z("einen halben Teelöffel Salz").unit === "TL", z("einen halben Teelöffel Salz"));
  check("C2: drei bis vier", z("drei bis vier Tomaten").qty === 3 && z("drei bis vier Tomaten").qtyMax === 4, z("drei bis vier Tomaten"));
  check("C2: ein paar Blätter Basilikum", z("ein paar Blätter Basilikum").name === "Basilikum", z("ein paar Blätter Basilikum").name);
  check("C2: helle oder dunkle Sojasoße", z("2 EL helle oder dunkle Sojasoße").name === "Sojasoße", z("2 EL helle oder dunkle Sojasoße").name);
  check("C2: daumengroßes Stück Ingwer", z("ein daumengroßes Stück Ingwer").name === "Ingwer", z("ein daumengroßes Stück Ingwer"));
  const cap = "Zutaten:\n1 TL Kurkuma, 1 TL Paprikapulver, ½ TL Zimt\nSalz/Pfeffer\n500 g Weizenmehl, 14 mittelgroße Äpfel, 150 g Creme Fraiche, 1 EL Rapsöl, etwas Butter & etwas Puderzucker, Prise Salz\nEiscreme-Schicht: 2 große Bananen 250 ml Kokosmilch 1 TL Vanilleextrakt 2,5 EL Ahornsirup\n\nZubereitung:\n1. Alles verrühren.\n2. Guss: 100 g Puderzucker mit Zitronensaft verrühren.";
  const rc = K.parseText(cap), nm = rc.ingredients.map(i => i.name);
  check("C3: Kommalisten werden getrennt", ["Kurkuma", "Paprikapulver", "Zimt", "Salz", "Pfeffer", "Äpfel", "Rapsöl", "Butter", "Puderzucker"].every(n => nm.includes(n)), nm);
  check("C3: Zeile ohne Trennzeichen wird an Mengen getrennt", nm.includes("Ahornsirup") && rc.ingredients.find(i => i.name === "Ahornsirup").qty === 2.5, nm);
}

// Paket 1 (A5): gesprochene Rezepte
{
  const t = K.parseTranscript("Heute machen wir eine schnelle Pasta. Zuerst kommt eine halbe Zwiebel in die Pfanne mit zwei Esslöffeln Olivenöl. Dann drei bis vier Knoblauchzehen dazu. Dann den Saft von einer Zitrone und eine Prise Salz. Oben drauf kommen Parmesan und frisches Basilikum.");
  const g = n => t.ingredients.find(i => i.name === n);
  check("A5: eine halbe Zwiebel", g("Zwiebel") && g("Zwiebel").qty === 0.5, t.ingredients.map(i => i.raw));
  check("A5: zwei Esslöffeln", g("Olivenöl") && g("Olivenöl").unit === "EL", t.ingredients.map(i => i.raw));
  check("A5: drei bis vier", g("Knoblauchzehen") && g("Knoblauchzehen").qtyMax === 4, t.ingredients.map(i => i.raw));
  check("A5: Saft von einer Zitrone", !!g("Zitronensaft"), t.ingredients.map(i => i.name));
  check("A5: Toppings am Satzende", !!g("Parmesan"), t.ingredients.map(i => i.name));
  check("A5: Gericht im Einstieg ist keine Zutat", !t.ingredients.some(i => /pasta/i.test(i.name)), t.ingredients.map(i => i.name));
  const e = K.parseTranscript("Add half a cup of oats, then two to three tablespoons of maple syrup. Top it with blueberries and chopped almonds.");
  check("A5: half a cup / two to three", e.ingredients.some(i => i.name === "Haferflocken") && e.ingredients.some(i => i.qtyMax === 3), e.ingredients.map(i => i.raw));
}

// Paket 3/4: Gänge (C7), Reste (C8), Ersatz (C9), Woche (C10), Kochbegriffe (C11)
{
  const g = t => K.einkaufsGang(t);
  check("C7: Haushalt", ["Klopapier", "Zahnpasta", "Backpapier", "Müllbeutel", "Spüli", "Rasierer", "Swiffer", "Staubsaugerbeutel", "Sonnencreme"].every(t => g(t) === "Drogerie & Haushalt"), ["Klopapier", "Zahnpasta", "Backpapier"].map(g));
  check("C7: Wortende entscheidet", g("Tomatenketchup") === "Gewürze, Öle & Saucen" && g("Olivenöl") === "Gewürze, Öle & Saucen" && g("Kichererbsen") === "Trockenware & Konserven", [g("Tomatenketchup"), g("Olivenöl"), g("Kichererbsen")]);
  check("C7: Marken und Snacks", g("Haribo") === "Süßes & Snacks" && g("Chips") === "Süßes & Snacks" && g("Coca-Cola") === "Getränke", [g("Haribo"), g("Chips")]);
  check("C7: Gelerntes geht vor", K.einkaufsGang("Klopapier", { gelernt: { klopapier: "Sonstiges" } }) === "Sonstiges");
  check("C7: BLS-Rückfall", K.einkaufsGang("Grünkern", { bls: [["C999000", "Grünkern, roh"]] }) === "Trockenware & Konserven", K.einkaufsGang("Grünkern", { bls: [["C999000", "Grünkern, roh"]] }));
  const mk = (t, z) => ({ id: t, recipe: { title: t, ingredients: z.map(K.parseIngredientLine), steps: ["Kochen."] } });
  const R = [mk("Curry", ["200 g Reis", "1 Zucchini", "400 ml Kokosmilch"]), mk("Pfanne", ["1 Zucchini", "2 Paprika", "200 g Feta"]), mk("Kuchen", ["200 g Mehl", "3 Eier"])];
  const rs = K.resteSuche(R, "Zucchini, Feta");
  check("C8: Reste-Suche sortiert nach Treffern", rs.length === 2 && rs[0].e.id === "Pfanne" && rs[0].treffer.length === 2, rs.map(x => x.e.id + ":" + x.treffer.length));
  const ers = K.ersatzFuer(K.parseIngredientLine("200 ml Sahne"));
  check("C9: Ersatz für Sahne", ers.length >= 1 && ers[0].name === "Hafercuisine", ers);
  check("C9: kein Ersatz für Unbekanntes", K.ersatzFuer(K.parseIngredientLine("1 Prise Zauberstaub")).length === 0);
  const w = K.wochenVorschlag(R.concat([mk("Gemüse", ["1 Zucchini", "2 Paprika", "1 Zwiebel"])]), { anzahl: 2 });
  check("C10: Woche nutzt gemeinsame Zutaten", w.rezepte.length === 2 && w.geteilt.length >= 1, [w.rezepte.map(e => e.id), w.geteilt]);
  const kb = K.kochbegriffeIn("Mit Brühe ablöschen und 10 Minuten köcheln lassen, dann abschmecken.");
  check("C11: Kochbegriffe gefunden", kb.map(x => x.begriff).join(",") === "ablöschen,köcheln,abschmecken", kb.map(x => x.begriff));
  check("C11: gebeugte Form", K.kochbegriffeIn("Den Brokkoli blanchiert servieren.").length === 1);
}

// 28.10.: Übersetzung (Bergamot) in Rezeptsprache, Fehlübersetzungen, Zuordnung über das Original, Zeit nicht zu lang
check("Ü: Sie-Form mit Partikel", K.rezeptStil("Fügen Sie Knoblauch hinzu und rühren Sie gut um.") === "Knoblauch hinzufügen und gut umrühren.", K.rezeptStil("Fügen Sie Knoblauch hinzu und rühren Sie gut um."));
check("Ü: Nebensatz bleibt hinten", K.rezeptStil("Kochen Sie die Nudeln in Salzwasser, bis sie al dente sind.") === "Die Nudeln in Salzwasser kochen, bis sie al dente sind.", K.rezeptStil("Kochen Sie die Nudeln in Salzwasser, bis sie al dente sind."));
check("Ü: Natron statt Backpulver", /Natron/.test(K.nachUebersetzung("Add the flour, baking soda and salt", "Mehl, Backpulver und Salz hinzufügen")));
check("Ü: Natron und Backpulver an der richtigen Stelle", K.nachUebersetzung("whisk flour, baking powder, baking soda and salt", "Mehl, Backpulver, Backpulver und Salz verquirlen") === "Mehl, Backpulver, Natron und Salz verquirlen");
check("Ü: Brüche vor der Übersetzung", K.vorUebersetzung("Add 3½ cups water") === "Add 3 1/2 cups water");
{
  const ru = K.analyse({ caption: "Cake\n\nIngredients:\n200 g flour\n1 tsp baking soda\n2 eggs\n\nMethod:\n1. Whisk the flour and baking soda.\n2. Beat in the eggs.", url: "" }).recipe;
  K.uebersetzeSchritte(ru, ["Mehl und Backpulver verquirlen.", "Die Eier einschlagen."]);
  const m = K.stepIngredients(ru);
  check("Ü: Zutaten bleiben nach der Übersetzung ihrem Schritt zugeordnet", m[0].length === 2 && m[1].length === 1, m);
  check("Ü: englische Zusätze werden abgetrennt", K.parseIngredientLine("2 cups kosher salt").name === "Salz" && K.parseIngredientLine("1 cup unsalted butter").name === "Butter" && K.parseIngredientLine("1 cup granulated sugar").name === "Zucker");
}
// 28.10.: Kategorien aus dem Titel-Kopf, gelernte Zuordnungen
{
  const kat = (t, z, sch) => K.analyse({ caption: t + "\n\nZutaten\n" + z.join("\n") + "\n\nZubereitung\n" + (sch || ["Alles verrühren.", "Servieren."]).join("\n"), url: "" }).recipe;
  check("Kat: Erdnussoße ist Soße", kat("Erdnussoße", ["2 EL Öl", "4 EL Erdnüsse", "2 EL Sojasoße", "1 Limette"]).category === "Sauce & Dip");
  check("Kat: Pecan Pie ist Dessert", kat("Whiskey Pecan Pie", ["200 g Pekannüsse", "100 g Zucker", "2 Eier", "1 Mürbeteig"]).category === "Dessert");
  check("Kat: Chicken Pot Pie bleibt Hauptgericht", kat("Chicken Pot Pie", ["500 g Hähnchen", "1 Zwiebel", "2 Karotten", "1 Blätterteig"]).category === "Hauptgericht");
  check("Kat: Ofengnocchi mit Hummus ist kein Dip", kat("Ofengnocchi mit Hummus", ["500 g Gnocchi", "200 g Hummus", "1 Paprika", "1 Zucchini"]).category === "Hauptgericht");
  check("Kat: Margarita ist Getränk", kat("Frozen Margarita", ["4 cl Tequila", "2 cl Limettensaft", "Eis"]).category === "Getränk");
  check("Kat: Pommes sind Beilage", kat("Crispy Oven Fries", ["1 kg Kartoffeln", "2 EL Öl", "Salz"]).category === "Beilage");
  const L = K.neuerLernspeicher(), cap = "Veganes Lahmacun\n\nZutaten\n200 g Sojahack\n4 Dürüm\n1 Paprika\n\nZubereitung\nAlles pürieren und verteilen.\nBacken.";
  const r1 = K.analyse({ caption: cap, url: "a" }, { lernen: [L] }).recipe;
  check("Kat: ohne Stichwort -> Standard", r1.categoryBasis === "Standard", r1.categoryBasis);
  K.lerneKategorie(L, r1, ["Snack"]);
  const r2 = K.analyse({ caption: cap.replace("Veganes Lahmacun", "Lahmacun mit Minze"), url: "b" }, { lernen: [L] }).recipe;
  check("Kat: gelernte Zuordnung gilt für ähnliche Titel", r2.category === "Snack" && r2.categoryBasis === "gelernt", [r2.category, r2.categoryBasis]);
  check("Kat: Lernwerte im Export", JSON.stringify(K.lernExport(L, {}).kategorien).indexOf("lahmac") !== -1);
}
// 29.10.: Blog-Test mit echten Rezeptseiten (Chefkoch, Eat This, Dr. Vegan, Bianca Zapatka)
{
  const z = (l) => K.parseIngredientLine(l);
  check("Blog: Chefkoch „Zehe/n“", z("2 Zehe/n Knoblauch (fein gewürfelt)").name === "Knoblauch" && z("2 Zehe/n Knoblauch").unit === "Zehe");
  check("Blog: Chefkoch „Zwiebel(n)“", z("1 große Zwiebel(n) (fein gewürfelt)").name === "Zwiebel" && !/\bn\b/.test(z("1 große Zwiebel(n) (fein gewürfelt)").note));
  check("Blog: „n. B.“ vorn wird Notiz", z("n. B. Salz und Pfeffer").name === "Salz und Pfeffer" && /nach Belieben/.test(z("n. B. Salz und Pfeffer").note));
  check("Blog: verschachtelte Klammern", z("1 can chickpeas (drained and rinsed; one 15 oz (400 g) can gives about 1½ cups (240 g) drained)").name === "Kichererbsen");
  check("Blog: Spanne mit Brüchen", z("2-2 1/2 cups all purpose flour").name === "Mehl" && z("1/4-1/2 tsp chili flakes").unit === "TL");
  check("Blog: „firm or extra-firm tofu“", z("14 oz firm or extra-firm tofu (drained)").name === "Tofu");
  check("Blog: „peppers“ sind Paprika", z("2 small peppers").name === "Paprika" && z("1/4 tsp black pepper").name !== "Paprika");
  check("Blog: Tomaten aus der Dose im Konserven-Gang", z("800 g Tomaten, geschälte (aus der Dose)").aisle === "Trockenware & Konserven");
  const ld = (j) => K.analyse({ caption: "", blogHtml: '<script type="application/ld+json">' + JSON.stringify(Object.assign({ "@type": "Recipe" }, j)) + "</script>", blogUrl: j.url || "https://www.chefkoch.de/rezepte/1/x.html", url: j.url || "https://www.chefkoch.de/rezepte/1/x.html" }).recipe;
  const ck = ld({ name: "Pizza alla puttanesca von Henglein", recipeIngredient: ["90 g Mini-Tomaten (rote)", "90 g Mini-Tomaten (gelbe)", "1 Pck. Pizzateig (350 g)"], recipeInstructions: [{ text: "Den Pizzateig ausrollen und mit Tomaten belegen." }, { text: "12 Minuten backen." }, { text: "Guten Appetit!" }, { text: "Eure Lieblingsgerichte von Chefkoch jetzt einfach gekocht & würzig lecker!" }], recipeYield: "1" });
  check("Blog: Chefkoch-Titel ohne „von …“", ck.title === "Pizza alla puttanesca", ck.title);
  check("Blog: zwei gleichnamige Zutaten bleiben", ck.ingredients.filter(i => /Mini-Tomaten/.test(i.name)).length === 2);
  check("Blog: Grußformel und Werbung keine Schritte", ck.steps.length === 2, ck.steps);
  const kg = ld({ name: "Seitan", url: "https://blog.example/seitan", recipeIngredient: ["250 g Kichererbsen", "425 g Seitan-Fix"], recipeInstructions: [{ text: "Alles verkneten." }, { text: "45 Minuten dämpfen." }], recipeYield: ["1.25", "1.25 kg"], nutrition: { calories: "165 kcal", servingSize: "100 g", sodiumContent: "720 mg" } });
  check("Blog: Ausbeute in kg ist keine Portionenzahl", kg.servings !== 1.25 && /1,25 kg/.test(kg.yieldText || ""), [kg.servings, kg.yieldText]);
  check("Blog: Nährwerte je 100 g und Natrium -> Salz", kg.nutritionDeclared.perServing === false && kg.nutritionDeclared.salt === 1.8, kg.nutritionDeclared);
  const alt = ld({ name: "Confit", url: "https://blog.example/confit", totalTime: "PT70M", recipeIngredient: ["20 garlic cloves", "1/2 cup olive oil", "300 g spaghetti"], recipeInstructions: [{ text: "Cover the garlic with oil and bake for 45 to 60 minutes, checking from 40 minutes. For the stovetop, use a small saucepan for about 40 to 50 minutes." }, { text: "Cook the spaghetti." }] });
  check("Blog: Alternative und Prüfzeit verlängern die Zeit nicht", alt.timeTotal === 70, alt.timeTotal);
  const art = K.analyse({ caption: "", blogHtml: '<html><head><title>Tortellini mit Tomatensoße - Blog</title></head><body><article><h1>Tortellini mit Tomatensoße</h1><div class="entry-content"><p>Heute gibt es Pasta.</p><p><b>Zutaten:</b></p><ul><li>250 g Tortellini</li><li>1 Zwiebel</li><li>200 ml passierte Tomaten</li></ul><p><b>Zubereitung:</b></p><ol><li>Tortellini nach Packungsanweisung kochen.</li><li>Zwiebel würfeln und in der Pfanne anbraten, Tomaten dazugeben.</li></ol></div></article></body></html>', blogUrl: "https://blog.example/t", url: "https://blog.example/t" }).recipe;
  check("Blog: Artikel ohne Rezeptkarte wird gelesen", art.title === "Tortellini mit Tomatensoße" && art.ingredients.length === 3 && art.steps.length === 2, [art.title, art.ingredients.length, art.steps.length]);
  check("Blog: „Tortellini“ ist keine Torte", art.category !== "Backen", art.category);
  const sp = K.analyse({ caption: "Pasta\n\nZutaten\n500 g Spaghetti\n800 ml Rinderbrühe\n\nZubereitung\nDie Pasta kochen.\nMit Bouillon ablöschen.", url: "x" }).recipe, m = K.stepIngredients(sp);
  check("Blog: Oberbegriffe im Schritt (Pasta, Bouillon)", m[0].includes(0) && m[1].includes(1), m);
}
// 29.10. abends: Go von Jakob für A, F, G, I
{
  const NWT = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../daten/naehrwerte.json"), "utf8"));
  const z = (l) => K.parseIngredientLine(l);
  check("A: Seitan Pulver und Weizengluten haben Nährwerte", !!K.findNutrientEntry(z("200 g Seitan Pulver").key, NWT.zutaten) && !!K.findNutrientEntry(z("200 g Weizengluten").key, NWT.zutaten));
  check("A: Rote Beete (mit ee) hat Nährwerte und Gang", !!K.findNutrientEntry(z("130 g Rote Beete").key, NWT.zutaten) && z("130 g Rote Beete").aisle === "Obst & Gemüse");
  check("A: Kritharaki, vegane Kochcreme, Kürbispüree", ["250 g Kritharaki", "200 ml vegane Kochcreme", "425 g pumpkin puree"].every(l => K.findNutrientEntry(z(l).key, NWT.zutaten)));
  const cap = "Big Mac Wrap\n\nZutaten:\n5 Salatblätter\n200 g Veganes Hack\n2 EL Big Mac Soße\n\nBig Mac Soße:\n100 g Vegane Mayonnaise\n1 TL Senf\n3 EL Gurkenwasser\n\nZubereitung:\n1. Alle Zutaten für die Soße verrühren.\n2. Hack anbraten.\n3. Alles auf den Salatblättern anrichten und mit der Soße toppen.";
  const bm = K.analyse({ caption: cap, url: "x" }).recipe; K.berechneNaehrwerte(bm, NWT, null, {});
  const tr = (bm.nutrition.teilrezepte || [])[0];
  check("I: Teilrezept anteilig (2 EL von gut 150 g Soße)", tr && tr.genutzt === 30 && tr.faktor < 0.3, bm.nutrition.teilrezepte);
  const ant = K.naehrwertAnteile(bm, NWT, "kcal", {}), mayo = ant.teile.find(t => /Mayo/.test(t.name));
  check("I: Erklärung rechnet mit demselben Anteil", mayo && mayo.gramm < 30, mayo);
  const ld = (j) => { const r = K.analyse({ caption: "", blogHtml: '<script type="application/ld+json">' + JSON.stringify(Object.assign({ "@type": "Recipe" }, j)) + "</script>", blogUrl: "https://blog.example/" + j.name, url: "https://blog.example/" + j.name }).recipe; K.berechneNaehrwerte(r, NWT, null, {}); return r; };
  const bo = ld({ name: "Bolognese", recipeYield: "4", nutrition: { calories: "814 kcal", proteinContent: "43.8 g" }, recipeIngredient: ["500 g Rinderhackfleisch", "500 g Spaghetti", "800 g Tomaten, geschälte (aus der Dose)", "2 EL Olivenöl"], recipeInstructions: [{ text: "Hackfleisch anbraten." }, { text: "Tomaten dazugeben und köcheln." }, { text: "Pasta kochen." }] });
  const v1 = K.naehrwertVergleich(bo);
  check("F: Vergleich mit dem Blog, kleine Abweichung", v1 && v1.blog.kcal === 814 && Math.abs(v1.abweichung.kcal) < 10 && !v1.gross, v1);
  const pz = ld({ name: "Pizza", recipeYield: "1", nutrition: { calories: "344 kcal", proteinContent: "3.5 g" }, recipeIngredient: ["1 Pck. Pizzateig (350 g)", "180 g Tomaten", "50 g Oliven", "2 EL Olivenöl"], recipeInstructions: [{ text: "Teig belegen." }, { text: "15 Minuten backen." }] });
  const L = K.neuerLernspeicher(), v2 = K.merkeNaehrwertAbweichung(L, pz);
  check("F: große Abweichung wird gemerkt und exportiert", v2 && v2.gross && L.naehrwertAbweichungen.length === 1 && K.lernExport(L, {}).naehrwertAbweichungen.length === 1);
  const sei = ld({ name: "Seitan", recipeYield: ["1.25", "1.25 kg"], nutrition: { calories: "165 kcal", proteinContent: "28 g", servingSize: "100 g" }, recipeIngredient: ["250 g Kichererbsen", "425 g Seitan-Fix", "1 EL Rapsöl"], recipeInstructions: [{ text: "Mit 500 ml Wasser verkneten." }, { text: "45 Minuten dämpfen." }] });
  const v3 = K.naehrwertVergleich(sei);
  check("F: Blogwert je 100 g mit dem Gewicht der Ausbeute verglichen", v3 && v3.je === "100 g" && Math.abs(v3.abweichung.kcal) < 15, v3);
}
{
  const NWT = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../daten/naehrwerte.json"), "utf8"));
  const r = K.analyse({ caption: "Soße\n\nZutaten\n400 g gehackte Tomaten\n2 Tomaten\n1 TL Paprikapulver\n1 Zwiebel\n\nZubereitung\nZwiebel würfeln und anbraten.\nTomaten und Paprikapulver dazugeben und köcheln.", url: "x" }).recipe;
  K.berechneNaehrwerte(r, NWT, null, {});
  const d = r.nutrition.details;
  check("Nährwert: gehackte Tomaten = Dosentomaten, frische Tomaten = roh", d.some(x => /Konserve/.test(x.bls)) && d.some(x => x.bls === "Tomate roh"), d.map(x => x.name + ":" + x.bls));
  check("Nährwert: Paprikapulver ist kein Gemüsepaprika", !d.some(x => /Paprikapulver/.test(x.name)) && r.nutrition.coverage.unmatched.indexOf("Paprikapulver") === -1, d);
}
{
  // M: Lern-Export – Mindest- und Höchstmengen, „Später“
  const T = Date.parse("2026-11-20T12:00"), tag = 86400000;
  const L = K.neuerLernspeicher();
  check("M: leerer Speicher ist nicht fällig", !K.lernStand(L, { jetzt: T }).faellig);
  L.rezepteSeitSenden = 14; L.rezepte = 14;
  check("M: 14 Rezepte noch nicht fällig", !K.lernStand(L, { jetzt: T }).faellig);
  L.rezepteSeitSenden = 15; L.rezepte = 15;
  const s1 = K.lernStand(L, { jetzt: T });
  check("M: ab 15 Rezepten fällig", s1.faellig && s1.grund === "rezepte" && !s1.dringend, s1);
  const sp = K.lernSpaeter(L, null, T);
  check("M: „Später“ verschiebt", !K.lernStand(L, { jetzt: T + tag, spaeter: sp }).faellig);
  L.rezepte = 20; check("M: nach 5 weiteren Rezepten wieder fällig", K.lernStand(L, { jetzt: T + tag, spaeter: sp }).faellig);
  L.rezepte = 15; check("M: nach 3 Tagen wieder fällig", K.lernStand(L, { jetzt: T + 3 * tag + 1, spaeter: sp }).faellig);
  const sp3 = { anzahl: 3, bisRezepte: 99, bisZeit: T + 9 * tag };
  check("M: nach dreimal Später kein weiteres Später", !K.lernStand(L, { jetzt: T, spaeter: sp3 }).darfSpaeter);
  const L2 = K.neuerLernspeicher(); L2.rezepteSeitSenden = 1;
  L2.fehler = [1, 2, 3, 4, 5].map(i => ({ grund: "x", datum: "2026-11-19T10:00" }));
  check("M: 5 Meldungen machen fällig", K.lernStand(L2, { jetzt: T }).grund === "meldungen");
  const L3 = K.neuerLernspeicher(); L3.rezepteSeitSenden = 2; L3.protokoll = [{ datum: "2026-11-01T09:00" }, { datum: "2026-11-15T09:00" }];
  check("M: nach 14 Tagen mit wartenden Einträgen fällig", K.lernStand(L3, { jetzt: T }).grund === "zeit" && K.lernStand(L3, { jetzt: T }).tage === 19);
  L3.protokoll[0].gesendet = true;
  check("M: Gesendetes zählt nicht für die 14 Tage", !K.lernStand(L3, { jetzt: T }).faellig);
  const L4 = K.neuerLernspeicher(); L4.protokoll = Array.from({ length: 120 }, () => ({ datum: "2026-11-19T09:00" }));
  const s4 = K.lernStand(L4, { jetzt: T, spaeter: sp3 });
  check("M: ab 80 % der Protokoll-Einträge dringend, Später greift nicht", s4.dringend && s4.faellig && !s4.darfSpaeter, s4);
  check("M: ab 80 % der Dateigröße dringend", K.lernStand(K.neuerLernspeicher(), { jetzt: T, groesse: 1700000 }).dringend);
}
{
  // N/O: Labels je Portion, ehrlich benannt; weitere Nährstoffe
  check("N: Label-Regel nennt Bezugswert und je Portion", /4,2 mg/.test(K.FOKUS_INFO["viel Eisen"].regel) && /je Portion/.test(K.FOKUS_INFO["viel Eisen"].regel) && K.FOKUS_INFO["viel Eisen"].anteil({ iron: 6.2 }) === "44 % des Tagesbedarfs");
  check("O: Jod, B12, Vitamin D, Zink, Folat als Labels", ["viel Jod", "viel Vitamin B12", "viel Vitamin D", "viel Zink", "viel Folat"].every(l => K.FOKUS_INFO[l] && K.FOKUS_INFO[l].nrv));
  check("O: Schwelle Jod 45 µg", /ab 45 µg/.test(K.FOKUS_INFO["viel Jod"].regel), K.FOKUS_INFO["viel Jod"].regel);
}
{
  // L: Ausreißer bei der Kochzeit
  const m = 60000, t0 = Date.parse("2026-11-01T18:00");
  const leicht = K.zeitAusreisser({ min: 25, geschaetzt: 20, schritte: 4, besucht: 4, aktionen: [t0, t0 + 5 * m, t0 + 12 * m, t0 + 20 * m], ende: t0 + 25 * m, laengsterSchritt: 8 });
  check("L: normales Kochen ist plausibel", leicht.ok, leicht);
  check("L: Fertig vergessen (8-fache Zeit)", K.zeitAusreisser({ min: 160, geschaetzt: 20, schritte: 4, besucht: 4 }).grund === "verhaeltnis");
  check("L: zu früh gedrückt (ein Viertel)", K.zeitAusreisser({ min: 12, geschaetzt: 60 }).grund === "verhaeltnis");
  check("L: zum Ende gesprungen", K.zeitAusreisser({ min: 30, geschaetzt: 30, schritte: 8, besucht: 2 }).grund === "schritte");
  const pause = K.zeitAusreisser({ min: 70, geschaetzt: 45, schritte: 4, besucht: 4, aktionen: [t0, t0 + 5 * m, t0 + 10 * m], ende: t0 + 70 * m, laengsterSchritt: 10 });
  check("L: eine Stunde ohne Tippen = Pause", pause.grund === "pause", pause);
  const ofen = K.zeitAusreisser({ min: 80, geschaetzt: 75, schritte: 4, besucht: 4, aktionen: [t0, t0 + 10 * m, t0 + 15 * m], ende: t0 + 80 * m, laengsterSchritt: 60 });
  check("L: 60 Minuten im Ofen sind keine Pause", ofen.ok, ofen);
}
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
