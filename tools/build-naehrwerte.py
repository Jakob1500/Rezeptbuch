#!/usr/bin/env python3
"""
Baut daten/naehrwerte.json aus dem Bundeslebensmittelschlüssel (BLS 4.0).

Quelle: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0,
Karlsruhe, DOI 10.25826/Data20251217-134202-0. Lizenz: CC BY 4.0.

Ergebnis: eine kleine Tabelle nur mit den Zutaten, die in Rezepten häufig vorkommen,
plus Gewichte für Stück/EL/TL. Die App lädt sie erst, wenn Nährwerte gebraucht werden.

Aufruf: python3 tools/build-naehrwerte.py [--review]
"""
import json, re, sys, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
FOODS = json.load(open(os.path.join(ROOT, "daten/bls-auszug.json"), encoding="utf-8"))
BY_NAME = {f["de"]: f for f in FOODS}

# Schlüssel (wie normName() im Kern) -> (BLS-Suchmuster oder exakter Name, Stück g, EL g, TL g, Dichte g/ml)
# Stückgewichte = essbarer Anteil eines mittelgroßen Stücks (Richtwerte).
Z = {
  # Gemüse
  "zwiebel": ("=Speisezwiebel roh", 80, None, None, None),
  "rote zwiebel": ("=Speisezwiebel roh", 80, None, None, None),
  "frühlingszwiebel": ("=Frühlingszwiebel/Lauchzwiebel, roh", 15, None, None, None),
  "knoblauch": ("=Knoblauch roh", 4, 10, 3, None),
  "ingwer": ("^Ingwer.*roh", 20, 8, 3, None),
  "tomate": ("=Tomate roh", 80, None, None, None),
  "cherrytomate": ("=Tomate roh", 15, None, None, None),
  "paprika": ("=Gemüsepaprika rot, roh", 150, None, None, None),
  "rote paprika": ("=Gemüsepaprika rot, roh", 150, None, None, None),
  "gurke": ("^(Salat)?[Gg]urke.*roh", 400, None, None, None),
  "zucchini": ("^Zucchini.*roh", 250, None, None, None),
  "aubergine": ("^Aubergine.*roh", 300, None, None, None),
  "möhre": ("^Möhre.*roh|^Karotte.*roh", 80, None, None, None),
  "kartoffel": ("^Kartoffel.*roh", 100, None, None, None),
  "süßkartoffel": ("=Batate/Süßkartoffel, roh", 250, None, None, None),
  "brokkoli": ("=Broccoli roh", 400, None, None, None),
  "blumenkohl": ("^Blumenkohl.*roh", 700, None, None, None),
  "spinat": ("=Spinat roh", None, None, None, None),
  "babyspinat": ("=Spinat roh", None, None, None, None),
  "blattspinat": ("=Spinat roh", None, None, None, None),
  "rucola": ("=Rucola roh", None, None, None, None),
  "salat": ("^Kopfsalat.*roh", 300, None, None, None),
  "eisbergsalat": ("^Eisbergsalat.*roh|^Eissalat.*roh", 500, None, None, None),
  "lauch": ("^Porree.*roh|^Lauch.*roh", 200, None, None, None),
  "staudensellerie": ("^Staudensellerie.*roh|^Bleichsellerie.*roh", 40, None, None, None),
  "knollensellerie": ("=Knollensellerie roh", 500, None, None, None),
  "champignon": ("^Champignon.*roh|^Zucht-?[Cc]hampignon.*roh", 20, None, None, None),
  "pilz": ("^Champignon.*roh|^Zucht-?[Cc]hampignon.*roh", 20, None, None, None),
  "avocado": ("^Avocado.*roh", 150, None, None, None),
  "kürbis": ("^Kürbis.*roh|^Hokkaido.*roh", 800, None, None, None),
  "rote bete": ("^Rote Rübe.*roh|^Rote Bete.*roh", 150, None, None, None),
  "mais": ("^Gemüsemais.*Konserve|^Zuckermais.*Konserve|^Mais.*Konserve", None, 15, None, None),
  "erbse": ("^Erbse grün.*roh|^Gartenerbse.*roh|^Erbsen? grün", None, 15, None, None),
  "grüne bohne": ("^Gartenbohne.*grün.*roh|^Bohne grün.*roh|^Grüne Bohne", None, None, None, None),
  "kichererbse": ("=Kichererbse reif, gekocht", None, 15, None, None),
  "linse": ("=Linse reif", None, 15, None, None),
  "rote linse": ("=Linse rot reif", None, 15, None, None),
  "kidneybohne": ("=Kidneybohne reif, gekocht", None, 15, None, None),
  "schwarze bohnen": ("^Bohne.*schwarz|^Gartenbohne.*reif.*gekocht", None, 15, None, None),
  "weiße bohnen": ("^Gartenbohne.*weiß.*gekocht|^Bohne.*weiß.*gekocht|^Gartenbohne.*reif.*gekocht", None, 15, None, None),
  "gehackte tomaten": ("=Tomate geschält, Konserve", None, 15, None, 1.0),
  "stückige tomaten": ("=Tomate geschält, Konserve", None, 15, None, 1.0),
  "tomaten aus der dose": ("=Tomate geschält, Konserve", None, 15, None, 1.0),
  "passierte tomaten": ("=Tomaten passiert/Tomatenpüree", None, 15, None, 1.05),
  "tomatenmark": ("=Tomatenmark", None, 15, 5, None),
  "kokosmilch": ("=Kokosmilch/Kokosnussmilch", None, 15, 5, 1.0),
  # Obst
  "banane": ("=Banane roh", 120, None, None, None),
  "apfel": ("^Apfel.*roh", 150, None, None, None),
  "zitrone": ("^Zitrone.*roh", 100, None, None, None),
  "zitronensaft": ("^Zitronensaft|^Zitrone.*Saft", 40, 10, 5, 1.0),
  "weizenmehl type 550": ("=Weizen Mehl, Type 550", None, 10, 3, None),
  "limette": ("^Limette.*roh", 60, None, None, None),
  "limettenschale": ("^Limette.*roh", 2, 6, 2, None),
  "zitronenschale": ("^Zitrone.*roh", 3, 6, 2, None),
  "orangenschale": ("^Orange.*roh|^Apfelsine.*roh", 5, 6, 2, None),
  "orange": ("^Orange.*roh|^Apfelsine.*roh", 180, None, None, None),
  "heidelbeere": ("^Heidelbeere.*roh|^Kulturheidelbeere.*roh", None, 10, None, None),
  "himbeere": ("=Himbeere roh", None, 10, None, None),
  "erdbeere": ("=Erdbeere roh", 15, None, None, None),
  "beere": ("^Heidelbeere.*roh|^Kulturheidelbeere.*roh", None, 10, None, None),
  "mango": ("^Mango.*roh", 300, None, None, None),
  "ananas": ("^Ananas.*roh", 900, None, None, None),
  "dattel": ("^Dattel.*getrocknet", 8, None, None, None),
  "rosine": ("=Rosine/Sultanine (Weinbeere getrocknet)", None, 10, None, None),
  # Getreide, Nüsse, Samen
  "haferflocke": ("=Hafer Flocken", None, 8, 3, None),
  "haferflocken": ("=Hafer Flocken", None, 8, 3, None),
  "mehl": ("=Weizen Mehl, Type 405", None, 10, 3, None),
  "dinkelmehl": ("^Dinkel.*Mehl", None, 10, 3, None),
  "vollkornmehl": ("^Weizen.*Vollkornmehl|^Weizen.*Mehl.*1700", None, 10, 3, None),
  "reis": ("=Reis poliert, roh", None, 15, None, None),
  "basmatireis": ("=Reis poliert, roh", None, 15, None, None),
  "vollkornreis": ("=Reis unpoliert, roh", None, 15, None, None),
  "nudel": ("=Teigwaren eifrei, roh", None, None, None, None),
  "nudeln": ("=Teigwaren eifrei, roh", None, None, None, None),
  "pasta": ("=Teigwaren eifrei, roh", None, None, None, None),
  "spaghetti": ("=Teigwaren eifrei, roh", None, None, None, None),
  "penne": ("=Teigwaren eifrei, roh", None, None, None, None),
  "vollkornnudel": ("=Vollkornteigwaren eifrei, roh", None, None, None, None),
  "couscous": ("^Couscous|^Weizen.*Grieß", None, 12, None, None),
  "bulgur": ("^Bulgur|^Weizen.*Bulgur", None, 12, None, None),
  "quinoa": ("^Quinoa.*roh|^Quinoa", None, 12, None, None),
  "brot": ("=Roggenmischbrot", 50, None, None, None),
  "vollkornbrot": ("=Roggenvollkornbrot", 50, None, None, None),
  "toast": ("^Weizentoastbrot|^Toastbrot|^Weizenbrot/Weißbrot", 25, None, None, None),
  "tortilla": ("=Weizentortilla", 60, None, None, None),
  "wrap": ("=Weizentortilla", 60, None, None, None),
  "semmelbrösel": ("=Paniermehl/Semmelbrösel/Semmelmehl", None, 8, None, None),
  "panko": ("=Paniermehl/Semmelbrösel/Semmelmehl", None, 8, None, None),
  "grieß": ("=Weichweizen Grieß", None, 12, None, None),
  "chiasamen": ("^Chia", None, 12, 4, None),
  "leinsamen": ("^Leinsamen", None, 10, 4, None),
  "sesam": ("^Sesam.*Samen|^Sesam$|^Sesamsamen", None, 8, 3, None),
  "mandel": ("^Mandel süß|^Mandel.*getrocknet|^Mandel$|^Mandeln", 1.2, 8, None, None),
  "walnuss": ("^Walnuss", 5, 7, None, None),
  "cashew": ("^Cashew", 1.5, 8, None, None),
  "cashewkerne": ("^Cashew", 1.5, 8, None, None),
  "erdnuss": ("=Erdnuss geröstet", 1, 8, None, None),
  "haselnuss": ("^Haselnuss", 1, 8, None, None),
  "pinienkerne": ("^Pinien", None, 8, 3, None),
  "sonnenblumenkerne": ("^Sonnenblumenkern", None, 8, 3, None),
  "kürbiskerne": ("^Kürbiskern", None, 8, 3, None),
  "erdnussbutter": ("=Erdnussbutter/Erdnusscreme", None, 16, 6, None),
  "tahin": ("^Tahin|^Sesammus|^Sesampaste", None, 15, 5, None),
  # Milchprodukte, Ei
  "milch": ("=Vollmilch frisch, 3,5 % Fett, pasteurisiert", None, 15, 5, 1.03),
  "hafermilch": ("^Haferdrink|^Hafer.*[Dd]rink", None, 15, 5, 1.03),
  "sojamilch": ("^Sojadrink|^Soja.*[Dd]rink", None, 15, 5, 1.03),
  "mandelmilch": ("^Mandeldrink|^Mandel.*[Dd]rink", None, 15, 5, 1.03),
  "sahne": ("^Schlagsahne", None, 15, 5, 1.0),
  "schlagsahne": ("^Schlagsahne", None, 15, 5, 1.0),
  "schmand": ("=Sauerrahm/Creme fraiche, 30 % Fett", None, 15, 5, 1.0),
  "crème fraîche": ("=Sauerrahm/Creme fraiche, 30 % Fett", None, 15, 5, 1.0),
  "saure sahne": ("=Sauerrahm/Saure Sahne, mind. 10 % Fett", None, 15, 5, 1.0),
  "joghurt": ("^Joghurt.*3,5 % Fett|^Joghurt mild.*3,5", None, 15, 5, 1.03),
  "griechischer joghurt": ("=Sahnejoghurt mind. 10 % Fett", None, 15, 5, 1.03),
  "skyr": ("^Skyr", None, 15, 5, None),
  "quark": ("^Speisequark mager|^Speisequark.*Magerstufe", None, 15, 5, None),
  "magerquark": ("^Speisequark mager|^Speisequark.*Magerstufe", None, 15, 5, None),
  "frischkäse": ("=Frischkäsezubereitung Natur, mind. 60 % Fett i. Tr.", None, 15, 5, None),
  "mozzarella": ("^Mozzarella", 125, None, None, None),
  "feta": ("^Feta mind", 200, 15, None, None),
  "parmesan": ("^Parmesan", None, 6, 2, None),
  "gouda": ("^Gouda", None, None, None, None),
  "cheddar": ("=Chester (Cheddar) mind. 50 % Fett i. Tr.", None, None, None, None),
  "ricotta": ("^Ricotta", None, 15, None, None),
  "mascarpone": ("^Mascarpone", None, 15, None, None),
  "halloumi": ("^Halloumi", 225, None, None, None),
  "butter": ("=Butter mild gesäuert", None, 12, 5, None),
  "ei": ("=Hühnerei roh", 55, None, None, None),
  "eigelb": ("^Hühnerei.*Eigelb.*roh|^Eigelb|^Hühnereigelb", 18, None, None, None),
  "eiweiß": ("^Hühnerei.*Eiklar.*roh|^Eiklar|^Hühnereiklar", 33, None, None, None),
  # Fleisch, Fisch, Alternativen
  "hähnchenbrust": ("=Hähnchen Brustfilet, roh", 150, None, None, None),
  "hähnchenbrustfilet": ("=Hähnchen Brustfilet, roh", 150, None, None, None),
  "hähnchen": ("=Hähnchen Fleisch, ohne Haut, roh", 150, None, None, None),
  "hähnchenschenkel": ("=Hähnchen Oberschenkel, mit Haut, roh", 200, None, None, None),
  "putenbrust": ("^Pute.*Brust.*roh|^Truthahn.*Brust.*roh", 150, None, None, None),
  "hackfleisch": ("=Rind Hackfleisch, roh|=Schwein Hackfleisch, roh", None, None, None, None),
  "rinderhackfleisch": ("=Rind Hackfleisch, roh", None, None, None, None),
  "rind": ("^Rind Fleisch.*roh|^Rind.*Muskelfleisch.*roh", None, None, None, None),
  "speck": ("^Schwein.*Speck.*geräuchert|^Frühstücksspeck|^Bacon", None, None, None, None),
  "schinken": ("=Schwein Kochschinken, Kochpökelware", 20, None, None, None),
  "lachs": ("=Lachs roh", 125, None, None, None),
  "lachsfilet": ("=Lachs roh", 125, None, None, None),
  "thunfisch": ("=Thunfisch im eigenen Saft, Konserve, abgetropft", None, None, None, None),
  "garnele": ("^Garnele.*roh|^Shrimp.*roh|^Garnelen", 15, None, None, None),
  "tofu": ("=Tofu", 200, None, None, None),
  "räuchertofu": ("=Tofu", 200, None, None, None),
  # Fette, Öle
  "olivenöl": ("=Olivenöl", None, 10, 4, 0.92),
  "öl": ("=Rapsöl/Rüböl", None, 10, 4, 0.92),
  "rapsöl": ("=Rapsöl/Rüböl", None, 10, 4, 0.92),
  "sonnenblumenöl": ("^Sonnenblumenöl", None, 10, 4, 0.92),
  "kokosöl": ("^Kokosfett|^Kokosöl", None, 10, 4, 0.92),
  "sesamöl": ("^Sesamöl", None, 10, 4, 0.92),
  # Süßes, Würzen
  "zucker": ("^Zucker weiß", None, 15, 5, None),
  "brauner zucker": ("^Zucker braun", None, 15, 5, None),
  "puderzucker": ("^Puderzucker|^Zucker weiß", None, 10, 4, None),
  "honig": ("=Honig", None, 20, 7, 1.4),
  "ahornsirup": ("^Ahornsirup", None, 20, 7, 1.32),
  "kakao": ("^Kakaopulver.*schwach entölt|^Kakaopulver", None, 8, 3, None),
  "zartbitterschokolade": ("^Zartbitterschokolade|^Schokolade.*zartbitter|^Bitterschokolade", 5, None, None, None),
  "schokodrops": ("^Zartbitterschokolade|^Schokolade.*zartbitter|^Bitterschokolade", None, 12, None, None),
  "salz": ("^Speisesalz", None, 15, 5, None),
  "sojasauce": ("^Sojasauce|^Sojasoße|^Würzsauce.*Soja", None, 15, 5, 1.15),
  "essig": ("^Branntweinessig|^Weinessig|^Essig", None, 15, 5, 1.0),
  "balsamico": ("^Aceto balsamico|^Balsam", None, 15, 5, 1.1),
  "senf": ("=Senf mittelscharf", None, 15, 5, None),
  "ketchup": ("=Tomatenketchup", None, 15, 5, None),
  "gemüsebrühe": ("=Gemüsebrühe", None, None, None, 1.0),
  "brühe": ("=Gemüsebrühe", None, None, None, 1.0),
  "hühnerbrühe": ("=Hühnerbrühe", None, None, None, 1.0),
  "backpulver": ("^Backpulver", None, 10, 3, None),
  "hefe": ("^Backhefe|^Hefe.*gepresst|^Presshefe", 42, None, None, None),
  # Ergänzungen nach Analyse des echten Instagram-Ordners
  "weißkohl": ("=Weißkohl roh", 1000, None, None, None),
  "wirsing": ("=Wirsing roh", 800, None, None, None),
  "rotkohl": ("=Rotkohl roh", 1000, None, None, None),
  "grünkohl": ("=Grünkohl roh", None, None, None, None),
  "kale": ("=Grünkohl roh", None, None, None, None),
  "kohlrabi": ("=Kohlrabi roh", 250, None, None, None),
  "spargel": ("=Spargel roh", 20, None, None, None),
  "radieschen": ("=Radieschen roh", 15, None, None, None),
  "mangold": ("=Mangold roh", None, None, None, None),
  "pak choi": ("=Pak Choi roh", 150, None, None, None),
  "schalotte": ("=Schalotte roh", 25, None, None, None),
  "granatapfel": ("=Granatapfel roh", 250, 10, None, None),
  "granatapfelkerne": ("=Granatapfel roh", None, 10, None, None),
  "feige": ("=Feige roh", 50, None, None, None),
  "edamame": ("=Sojabohne unreif (Edamame) roh", None, 15, None, None),
  "leinöl": ("=Leinöl", None, 10, 4, 0.92),
  "buchweizen": ("=Buchweizen roh", None, 12, None, None),
  "dinkelflocken": ("=Dinkel Flocken", None, 8, 3, None),
  "speisestärke": ("=Mais Stärke", None, 10, 3, None),
  "maisstärke": ("=Mais Stärke", None, 10, 3, None),
  "pflanzliche sahne": ("=Sojakochcreme", None, 15, 5, 1.0),
  "sojakochcreme": ("=Sojakochcreme", None, 15, 5, 1.0),
  "hafer cuisine": ("=Sojakochcreme", None, 15, 5, 1.0),
  "pflanzlicher joghurt": ("=Soja-Joghurtalternative ungesüßt", None, 15, 5, 1.03),
  "sojajoghurt": ("=Soja-Joghurtalternative ungesüßt", None, 15, 5, 1.03),
  "soja-skyr": ("=Soja-Joghurtalternative ungesüßt", None, 15, 5, 1.03),
  "pflanzendrink": ("^Haferdrink", None, 15, 5, 1.03),
  "gnocchi": ("=Gnocchi roh", None, None, None, None),
  "miso": ("=Miso/Sojabohnenpaste", None, 18, 6, None),
  "misopaste": ("=Miso/Sojabohnenpaste", None, 18, 6, None),
  "sojaschnetzel": ("=Sojaschnetzel/Sojagranulat, texturiert, trocken", None, 6, None, None),
  "sojahack": ("=Sojaschnetzel/Sojagranulat, texturiert, trocken", None, 6, None, None),
  "sambal oelek": ("=Sambal Oelek, Würzpaste", None, 15, 5, None),
  "vanillezucker": ("=Vanillezucker", 8, None, None, None),
  "reisnudeln": ("=Reisnudeln roh", None, None, None, None),
  "glasnudeln": ("=Glasnudeln aus Mungbohnenstärke, roh", None, None, None, None),
  "limettensaft": ("^Zitronensaft", 30, 10, 5, 1.0),
  "margarine": ("=Rapsölmargarine Vollfett, angereichert mit Vitaminen", None, 12, 5, None),
  "orangensaft": ("^Orangensaft|^Apfelsinensaft", 80, 10, 5, 1.04),
  # Phase 1 (18.10.2026): häufige Lücken aus dem Instagram-Export
  "mandelmus": ("=Mandelmus", None, 15, 5, None),
  "braunes mandelmus": ("=Mandelmus", None, 15, 5, None),
  "weißes mandelmus": ("=Mandelmus", None, 15, 5, None),
  "hefeflocke": ("=Hefe Flocken/Nährhefe", None, 3, 1, None),
  "hefeflocken": ("=Hefe Flocken/Nährhefe", None, 3, 1, None),
  "kokosraspel": ("=Kokos Fruchtfleisch, geraspelt, getrocknet", None, 5, 2, None),
  "kokosraspel": ("=Kokos Fruchtfleisch, geraspelt, getrocknet", None, 5, 2, None),
  "hanfsamen": ("=Leinsamen", None, 10, 3, None),
  "kokosraspeln": ("=Kokos Fruchtfleisch, geraspelt, getrocknet", None, 5, 2, None),
  "pflanzliche kochcreme": ("=Sojakochcreme", None, 15, 5, 1.0),
  "pflanzliche creme fraiche": ("=Sojakochcreme", None, 15, 5, 1.0),
  "pistazie": ("=Pistazie geröstet ohne Fett", None, 10, 3, None),
  "pistazien": ("=Pistazie geröstet ohne Fett", None, 10, 3, None),
  "pesto": ("=Pesto verde", None, 15, 5, None),
  "pesto rosso": ("=Pesto rosso", None, 15, 5, None),
  "veganer reibekäse": ("=Käsealternative, Basis Pflanzenfett, vegan", None, 7, 3, None),
  "veganer streukäse": ("=Käsealternative, Basis Pflanzenfett, vegan", None, 7, 3, None),
  "veganer käse": ("=Käsealternative, Basis Pflanzenfett, vegan", None, 7, 3, None),
  "veganer parmesan": ("=Käsealternative, Basis Cashewkerne, vegan", None, 6, 2, None),
  "veganer mozzarella": ("=Käsealternative Mozzarella-Art, vegan", None, None, None, None),
  "kichererbsenmehl": ("=Kichererbsenmehl", None, 8, 3, None),
  "karamellkekse": ("=Spekulatius (Mürbeteig)", 7, None, None, None),
  "biscoff kekse": ("=Spekulatius (Mürbeteig)", 7, None, None, None),
  "butterkeks": ("=Butterkekse/Butterplätzchen (Mürbeteig)", 5, None, None, None),
  "tagliatelle": ("=Teigwaren eifrei, roh", None, None, None, None),
  "maultasche": ("=Maultaschen mit Spinatfüllung gegart", 50, None, None, None),
  "saure sahne": ("=Sauerrahm/Saure Sahne, mind. 10 % Fett", None, 15, 5, 1.0),
  "creme fraiche": ("=Sauerrahm/Creme fraiche, 30 % Fett", None, 15, 5, 1.0),
  "couscous": ("=Couscous (Hartweizen) roh", None, 12, 4, None),
  "bulgur": ("=Bulgur (Hartweizen) roh", None, 12, 4, None),
  "seitan": ("=Fleischersatz glutenhaltig (Seitan)", None, None, None, None),
  # Näherungen (Lebensmittel fehlt im BLS) – im Eintrag als "naeherung" markiert
  "agavendicksaft": ("=Ahornsirup", None, 20, 7, 1.33),
  "mehl glutenfrei": ("=Mehlmischung glutenfrei", None, 10, 3, None),
  "glutenfreie mehlmischung": ("=Mehlmischung glutenfrei", None, 10, 3, None),
  "soja sauce": ("^Sojasauce|^Sojasoße", None, 15, 5, 1.15),
  "stangensellerie": ("^Staudensellerie.*roh|^Bleichsellerie.*roh", 40, None, None, None),
  "sellerie": ("^Staudensellerie.*roh|^Bleichsellerie.*roh", 40, None, None, None),
  "kokosnussmilch": ("=Kokosmilch/Kokosnussmilch", None, 15, 5, 1.0),
  "kokosnuss milch": ("=Kokosmilch/Kokosnussmilch", None, 15, 5, 1.0),
  "gemüsebouillon": ("=Gemüsebrühe", None, 15, 5, 1.0),
  "tempeh": ("=Tofu", None, None, None, None),
  # Ergänzungen 18.10.2026 (unbekannte Zutaten aus Jakobs Exporten)
  "austernpilz": ("=Austernpilz roh", None, None, None, None),
  "austernpilze": ("=Austernpilz roh", None, None, None, None),
  "kräuterseitling": ("=Austernpilz roh", 40, None, None, None),
  "kräuterseitlinge": ("=Austernpilz roh", 40, None, None, None),
  "enoki pilze": ("=Austernpilz roh", None, None, None, None),
  "enoki": ("=Austernpilz roh", None, None, None, None),
  "getrocknete steinpilze": ("=Steinpilz getrocknet", None, 5, None, None),
  "steinpilz": ("=Steinpilz roh", 60, None, None, None),
  "rosenkohl": ("=Rosenkohl roh", 15, None, None, None),
  "chinakohl": ("=Chinakohl roh", 800, None, None, None),
  "rotwein": ("=Rotwein trocken", None, 15, 5, 1.0),
  "trockener rotwein": ("=Rotwein trocken", None, 15, 5, 1.0),
  "veganer rotwein": ("=Rotwein trocken", None, 15, 5, 1.0),
  "weißwein": ("=Weißwein trocken", None, 15, 5, 1.0),
  "trockener weißwein": ("=Weißwein trocken", None, 15, 5, 1.0),
  "kokosnussflocken": ("=Kokos Fruchtfleisch, geraspelt, getrocknet", None, 5, 2, None),
  "kokosflocken": ("=Kokos Fruchtfleisch, geraspelt, getrocknet", None, 5, 2, None),
  "kokosnussöl": ("=Kokosöl", None, 12, 4, 0.92),
  "instantkaffee": ("=Instantkaffeepulver", None, 4, 2, None),
  "rigatoni": ("=Teigwaren eifrei, roh", None, None, None, None),
  "farfalle": ("=Teigwaren eifrei, roh", None, None, None, None),
  "capellini": ("=Teigwaren eifrei, roh", None, None, None, None),
  "fusilli": ("=Teigwaren eifrei, roh", None, None, None, None),
  "lasagneplatte": ("=Teigwaren eifrei, roh", 20, None, None, None),
  "lasagneplatten": ("=Teigwaren eifrei, roh", 20, None, None, None),
  "orecchiette": ("=Teigwaren eifrei, roh", None, None, None, None),
  "fladenbrot": ("=Weizenfladenbrot", 250, None, None, None),
  "pita-brot": ("=Weizenfladenbrot", 70, None, None, None),
  "pita-brote": ("=Weizenfladenbrot", 70, None, None, None),
  "pita": ("=Weizenfladenbrot", 70, None, None, None),
  "naan": ("=Weizenfladenbrot", 90, None, None, None),
  "dürüm": ("=Weizentortilla", 90, None, None, None),
  "proteinwraps": ("=Weizentortilla", 60, None, None, None),
  "ciabatta": ("=Weizenbaguette", 250, None, None, None),
  "jackfruit": ("=Jackfrucht roh", None, None, None, None),
  "jackfrucht": ("=Jackfrucht roh", None, None, None, None),
  "nori": ("=Nori-Blatt geröstet", 3, None, None, None),
  "nori blätter": ("=Nori-Blatt geröstet", 3, None, None, None),
  "ajvar": ("=Ajvar Konserve", None, 15, 5, None),
  "guacamole": ("=Avocadocreme (Guacamole)", None, 15, 5, None),
  "dunkle schokolade": ("=Bitterschokolade", None, None, None, None),
  "dunkle vegane schokolade": ("=Bitterschokolade", None, None, None, None),
  "datteln": ("=Dattel getrocknet", 8, None, None, None),
  "entkernte datteln": ("=Dattel getrocknet", 8, None, None, None),
  "grüne chili": ("=Pfefferschote grün, roh", 10, None, None, None),
  "grüne chilischoten": ("=Pfefferschote grün, roh", 10, None, None, None),
  "rote chili": ("=Pfefferschote rot, roh", 10, None, None, None),
  "chilischote": ("=Pfefferschote rot, roh", 10, None, None, None),
  "jalapeño": ("=Pfefferschote grün, roh", 15, None, None, None),
  "serrano chilischoten": ("=Pfefferschote grün, roh", 10, None, None, None),
  "veganes hack": ("=Sojaschnetzel/Sojagranulat, texturiert, eingeweicht, gebraten ohne Fett (Pfanne)", None, None, None, None),
  "veganes soja hack": ("=Sojaschnetzel/Sojagranulat, texturiert, eingeweicht, gebraten ohne Fett (Pfanne)", None, None, None, None),
  "soja schnetzel": ("=Sojaschnetzel/Sojagranulat, texturiert, trocken", None, None, None, None),
  "chickenalternative": ("=Fleischersatz gluten-, milch- und sojahaltig", None, None, None, None),
  "tahini": ("=Tahin (Sesammus)", None, 15, 5, None),
  "smooth tahini": ("=Tahin (Sesammus)", None, 15, 5, None),
  "vegane mayo": ("=Mayonnaise (Fertigprodukt)", None, 15, 5, None),
  "vegane mayonnaise": ("=Mayonnaise (Fertigprodukt)", None, 15, 5, None),
  "vegane butter": ("=Pflanzenmargarine Vollfett, angereichert mit Vitaminen", None, 12, 4, None),
  "vegane sahne": ("=Sahneersatz (Mischung aus pflanzlichen Fetten und Milch)", None, 15, 5, 1.0),
  "hafer kochcreme cuisine": ("=Sahneersatz (Mischung aus pflanzlichen Fetten und Milch)", None, 15, 5, 1.0),
  "hafer koch creme cuisine": ("=Sahneersatz (Mischung aus pflanzlichen Fetten und Milch)", None, 15, 5, 1.0),
  "hafer creme cuisine": ("=Sahneersatz (Mischung aus pflanzlichen Fetten und Milch)", None, 15, 5, 1.0),
  "soja cuisine": ("=Sahneersatz (Mischung aus pflanzlichen Fetten und Milch)", None, 15, 5, 1.0),
  "streukäse": ("=Käsealternative, Basis Pflanzenfett, vegan", None, 7, 3, None),
  "veganen streukäse": ("=Käsealternative, Basis Pflanzenfett, vegan", None, 7, 3, None),
  "weizenmehl typ 550": ("=Weizen Mehl, Type 550", None, 10, 3, None),
  "weizenmehl": ("=Weizen Mehl, Type 405", None, 10, 3, None),
  "stärke": ("=Mais Stärke", None, 10, 3, None),
  "tapiokastärke": ("=Tapioka/Tapiokastärke", None, 10, 3, None),
  "proteinpulver": ("=Sojaproteinisolat", None, 10, 3, None),
  "neutrales proteinpulver": ("=Sojaproteinisolat", None, 10, 3, None),
  "weiße riesenbohnen": ("=Limabohne (Butterbohne, Mondbohne) reif, gekocht", None, 15, None, None),
  "riesenbohnen": ("=Limabohne (Butterbohne, Mondbohne) reif, gekocht", None, 15, None, None),
  "butterbohnen": ("=Limabohne (Butterbohne, Mondbohne) reif, gekocht", None, 15, None, None),
  "nektarine": ("=Nektarine roh", 130, None, None, None),
  "pfirsich": ("=Pfirsich roh", 130, None, None, None),
  "rote chilipaste": ("=Sambal Oelek, Würzpaste", None, 15, 5, None),
  "salsa soße": ("=Spanische Sauce (Salsa)", None, 15, 5, None),
  "sprudel": ("=Natürliches Mineralwasser mit Kohlensäure", None, 15, 5, 1.0),
  "mineralwasser": ("=Natürliches Mineralwasser mit Kohlensäure", None, 15, 5, 1.0),
  "gekochter basmati reis": ("=Reis poliert, gekocht", None, 15, None, None),
  "kidneybohnen": ("=Kidneybohne reif, Konserve, abgetropft", None, 15, None, None),
  "sauerkraut": ("=Sauerkraut Konserve, abgetropft", None, None, None, None),
  "kakaopulver": ("=Kakaopulver schwach entölt", None, 7, 2, None),
  # Blog-Test 29.10.: häufige Zutaten von Rezeptseiten, die vorher fehlten
  "olive": ("=Oliven geschwärzt, in Salzlake, abgetropft", 4, 10, None, None),
  "schwarze olive": ("=Oliven geschwärzt, in Salzlake, abgetropft", 4, 10, None, None),
  "grüne olive": ("=Oliven grün, gesäuert, abgetropft", 4, 10, None, None),
  "kaper": ("=Kapern gesäuert, abgetropft", None, 10, 4, None),
  "sardelle": ("=Sardelle in Öl, Konserve, abgetropft", 4, None, None, None),
  "sardellenfilet": ("=Sardelle in Öl, Konserve, abgetropft", 4, None, None, None),
  "blätterteig": ("=Blätterteig eifrei, roh", 275, None, None, None),
  "pizzateig": ("=Pizzateig (mit Hefe) roh", 400, None, None, None),
  "ravioli": ("=Eier-Frischteigwaren Ravioli (Gemüsefüllung) roh", None, None, None, None),
  "vegane ravioli": ("=Eier-Frischteigwaren Ravioli (Gemüsefüllung) roh", None, None, None, None),
  "tortellini": ("=Eierteigwaren Tortellini (Fleischfüllung) getrocknet", None, None, None, None),
  "vegane bratwurst": ("=Vegetarische Bratwurst (aus Tofu und Weizenprotein)", 50, None, None, None),
  "vegane bratwürste": ("=Vegetarische Bratwurst (aus Tofu und Weizenprotein)", 50, None, None, None),
  "vegane würstchen": ("=Vegetarische Bratwurst (aus Tofu und Weizenprotein)", 50, None, None, None),
  "ajvar": ("=Ajvar Konserve", None, 15, 5, None),
  "käseersatz": ("=Käsealternative, Basis Pflanzenfett, vegan", None, 7, 3, None),
  "kochsahne": ("=Kaffeesahne mind. 10 % Fett", None, 15, 5, 1.0),
  "pflanzliche kochsahne": ("=Sojakochcreme", None, 15, 5, 1.0),
  "gulasch": ("=Rind Gulasch (Bug) roh", None, None, None, None),
  "rindergulasch": ("=Rind Gulasch (Bug) roh", None, None, None, None),
  "mini-tomate": ("=Tomate roh", 15, None, None, None),
  "getrocknete tomate": ("=Tomate getrocknet", 6, 8, None, None),
  "seitan-fix": ("=Weizenkleber/Weizengluten", None, 8, 3, None),
  "glutenmehl": ("=Weizenkleber/Weizengluten", None, 8, 3, None),
  "weizengluten": ("=Weizenkleber/Weizengluten", None, 8, 3, None),
  "rote beete": ("^Rote Rübe.*roh|^Rote Bete.*roh", 150, None, None, None),
  "barbecuesoße": ("=Barbecuesauce/Grillsauce", None, 17, 6, None),
  "barbecuesauce": ("=Barbecuesauce/Grillsauce", None, 17, 6, None),
  "bbq sauce": ("=Barbecuesauce/Grillsauce", None, 17, 6, None),
  "braune soße": ("=Bratensoße Instantpulver", None, 8, 3, None),
  "weizenglute": ("=Weizenkleber/Weizengluten", None, 8, 3, None),
  "seitan pulver": ("=Weizenkleber/Weizengluten", None, 8, 3, None),
  "seitanpulver": ("=Weizenkleber/Weizengluten", None, 8, 3, None),
  "wraps": ("=Weizentortilla", 60, None, None, None),
}

# Zustände: "<schlüssel>@<zustand>" (roh | gekocht | abgetropft). Löffel-/Stückgewichte erbt der Eintrag vom Grundschlüssel.
V = {
  "reis@gekocht": "=Reis poliert, gekocht", "basmatireis@gekocht": "=Reis poliert, gekocht", "vollkornreis@gekocht": "=Reis unpoliert, gekocht",
  "nudel@gekocht": "=Teigwaren eifrei, gekocht", "nudeln@gekocht": "=Teigwaren eifrei, gekocht", "spaghetti@gekocht": "=Teigwaren eifrei, gekocht",
  "kichererbse@roh": "=Kichererbse reif", "kichererbse@abgetropft": "=Kichererbse reif, Konserve, abgetropft",
  "linse@gekocht": "=Linse reif, gekocht", "linse@abgetropft": "=Linse reif, Konserve, abgetropft", "rote linse@gekocht": "=Linse rot, reif, gekocht",
  "kidneybohne@roh": "=Kidneybohne reif", "kidneybohne@abgetropft": "=Kidneybohne reif, Konserve, abgetropft",
  "weiße bohnen@roh": "=Gartenbohne reif", "weiße bohnen@abgetropft": "=Gartenbohne reif, Konserve, abgetropft",
  "schwarze bohnen@roh": "=Gartenbohne reif", "schwarze bohnen@abgetropft": "=Gartenbohne reif, Konserve, abgetropft",
  "quinoa@gekocht": "=Quinoa weiß, gekocht", "kartoffel@gekocht": "=Kartoffel geschält, gekocht",
  "couscous@gekocht": "=Couscous (Hartweizen) gekocht", "bulgur@gekocht": "=Bulgur (Hartweizen) gekocht", "mais@gekocht": "=Mais gekocht",
}

NAEHERUNG = {"agavendicksaft": "Agavendicksaft fehlt im BLS; Näherung über Ahornsirup", "enoki": "Enoki fehlt im BLS; Näherung über Austernpilz", "hanfsamen": "Hanfsamen fehlen im BLS; Näherung über Leinsamen", "tempeh": "Tempeh fehlt im BLS; Näherung über Tofu", "enoki pilze": "Enoki fehlt im BLS; Näherung über Austernpilz", "proteinpulver": "Näherung über Sojaproteinisolat", "chickenalternative": "Näherung über Fleischersatz (gluten-, milch- und sojahaltig)", "vegane sahne": "Näherung über Sahneersatz", "vegane mayo": "Näherung über Mayonnaise", "vegane ravioli": "Näherung über Ravioli mit Gemüsefüllung (Eierteig)", "vegane bratwurst": "Näherung über vegetarische Bratwurst", "vegane bratwürste": "Näherung über vegetarische Bratwurst", "vegane würstchen": "Näherung über vegetarische Bratwurst", "kochsahne": "Näherung über Kaffeesahne (10 % Fett)", "seitan-fix": "Näherung über Weizengluten"}

PREPARED = re.compile(r"(gebraten|gekocht|frittiert|gedünstet|gebacken|getrocknet|tiefgefroren|Konserve|Pulver|mit |gesüßt|gegart|paniert|Saft|Sirup|Mus\b|Püree|Chips|Brei|Suppe|Salat|Eis\b|Kuchen)", re.I)

def pick(query):
    if query.startswith("=") and "|=" in query:
        parts = [BY_NAME.get(q.lstrip("=")) for q in query.split("|")]
        if not all(parts): return None
        avg = {"code": "+".join(p["code"] for p in parts), "de": " / ".join(p["de"] for p in parts) + " (Mittelwert)"}
        for k in parts[0]:
            if k in ("code", "de", "en"): continue
            vals = [p.get(k) for p in parts]
            avg[k] = round(sum(vals) / len(vals), 3) if all(v is not None for v in vals) else None
        return avg
    if query.startswith("="):
        return BY_NAME.get(query[1:])
    rx = re.compile(query)
    cands = [f for f in FOODS if rx.search(f["de"]) and f["code"][0] not in "XY"]
    if not cands:
        return None
    wants_prep = bool(PREPARED.search(query))
    def score(f):
        s = 0
        if not wants_prep and PREPARED.search(f["de"]): s += 10
        if "roh" in f["de"]: s -= 2
        if f.get("ENERCC") is None: s += 20
        return (s, len(f["de"]))
    return sorted(cands, key=score)[0]

KEEP = ["ENERCC", "PROT625", "FAT", "CHO", "FIBT", "SUGAR", "NACL", "FE", "CA", "MG", "ZN", "K",
        "VITC", "VITB12", "VITD", "FOL", "FASAT", "FAPUN3", "ID"]
SHORT = {"ENERCC": "kcal", "PROT625": "protein", "FAT": "fat", "CHO": "carbs", "FIBT": "fiber",
         "SUGAR": "sugar", "NACL": "salt", "FE": "iron", "CA": "calcium", "MG": "magnesium", "ZN": "zinc",
         "K": "potassium", "VITC": "vitC", "VITB12": "vitB12", "VITD": "vitD", "FOL": "folate",
         "FASAT": "satFat", "FAPUN3": "omega3", "ID": "iodine"}

out, missing = {}, []
for key, (q, piece, el, tl, dens) in Z.items():
    f = pick(q)
    if not f:
        missing.append(key); continue
    entry = {"bls": f["code"], "name": f["de"],
             "n": {SHORT[k]: f[k] for k in KEEP if f.get(k) is not None}}
    if piece: entry["stk"] = piece
    if el: entry["el"] = el
    if tl: entry["tl"] = tl
    if dens: entry["dichte"] = dens
    if key in NAEHERUNG: entry["naeherung"] = NAEHERUNG[key]
    out[key] = entry

for key, q in V.items():
    base = key.split("@")[0]
    f = pick(q)
    if not f or base not in out:
        missing.append(key); continue
    entry = {"bls": f["code"], "name": f["de"], "n": {SHORT[k]: f[k] for k in KEEP if f.get(k) is not None}}
    for m in ("stk", "el", "tl", "dichte"):
        if m in out[base]: entry[m] = out[base][m]
    out[key] = entry

# Kompakter Suchindex über den ganzen BLS für "einmal zuordnen" (lädt die App nur bei Bedarf)
suche = []
for f in FOODS:
    if f.get("ENERCC") is None or f["code"][0] in "XY":
        continue
    suche.append([f["code"], f["de"], f.get("en") or ""] + [f.get(k) for k in KEEP])
json.dump({"felder": ["bls", "name", "en"] + [SHORT[k] for k in KEEP], "eintraege": suche},
          open(os.path.join(ROOT, "daten/bls-suche.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

meta = {
  "quelle": "Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0, Karlsruhe, DOI 10.25826/Data20251217-134202-0",
  "lizenz": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
  "hinweis": "Auszug; Nährwerte je 100 g essbarer Anteil. Stück-/Löffelgewichte sind Richtwerte des Rezeptspeichers.",
  "einheiten": {"kcal": "kcal", "protein": "g", "fat": "g", "carbs": "g", "fiber": "g", "sugar": "g", "salt": "g",
                "iron": "mg", "calcium": "mg", "magnesium": "mg", "zinc": "mg", "potassium": "mg", "vitC": "mg",
                "vitB12": "µg", "vitD": "µg", "folate": "µg", "satFat": "g", "omega3": "g", "iodine": "µg"}
}
json.dump({"meta": meta, "zutaten": out}, open(os.path.join(ROOT, "daten/naehrwerte.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
if "--review" in sys.argv:
    for k, v in out.items():
        print(f"{k:22} → {v['name'][:60]:60} {v['n'].get('kcal')} kcal")
print(f"\n{len(out)} Zutaten zugeordnet, {len(missing)} ohne Treffer: {missing}")
