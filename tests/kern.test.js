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
check("DE Zutaten", r.ingredients.length === 9, r.ingredients.map(x => x.raw));
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
const so = K.toSchemaOrg(r1);
check("schema.org Export", so["@type"] === "Recipe" && so.recipeIngredient.length === 9);

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
check("Curry eisenreich berechnet", curry.focus.some(f => f.label === "eisenreich" && f.basis === "berechnet"), curry.focus);
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
for (let n = 1; n <= 9; n++) { const f = K.folgenVorschlag(st, "dr.vegan"); asks.push(f.fragen); if (n === 1) K.folgenAntwort(st, "dr.vegan", "gefolgt"); }
check("Folgen: beim 1. und 7. Rezept fragen", asks.join() === "true,false,false,false,false,false,true,false,false", asks);
// Blog-Suche
const pr = K.analyse({ caption: "Spicy Peanut Noodles 🍜\nIngredients:\nNoodles • Peanut butter • Garlic\nFULL RECIPE ON MY BLOG Drveganblog dot com" }).recipe;
const plan = K.blogSuchplan(pr, { caption: "#peanutnoodles" });
check("Suchplan: neueste zuerst, dann Titel", plan[0].schritt === "neueste" && plan[1].suchbegriff === "Spicy Peanut Noodles" && plan.length <= 6, plan);
const kand = K.besteKandidaten(K.blogKandidaten([{ link: "https://drveganblog.com/spicy-peanut-noodles/", title: { rendered: "Spicy Peanut Noodles" } }, { link: "https://drveganblog.com/lemon-pasta/", title: { rendered: "Lemon Pasta" } }]), pr);
check("Kandidat bewertet", kand.length === 1 && /peanut/.test(kand[0].url), kand);
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

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
