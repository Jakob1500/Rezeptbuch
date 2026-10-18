/*!
 * Rezept-Kern v0.1 – Analyse-Logik für den Rezeptspeicher
 *
 * Eine einzige, abhängigkeitsfreie JavaScript-Datei. Läuft unverändert in:
 *   - jedem Browser (Web-App)
 *   - iOS über JavaScriptCore (spätere App-Hülle)
 *   - Android über eine JS-Engine (spätere App-Hülle)
 *   - Node (Tests)
 *
 * Grundsätze: kein Netzwerk, kein LLM, keine Seiteneffekte. Alles hier sind
 * reine Funktionen: Text rein, strukturiertes Rezept raus. Netzwerk, Texterkennung
 * und Spracherkennung liefern die Plattform-Adapter zu (Kurzbefehl, App-Hülle).
 *
 * Analyse-Kette (wahrscheinlichster und sparsamster Weg zuerst):
 *   1. Blog-Rezeptdaten (schema.org/Recipe)  – exakt, keine KI
 *   2. Caption                               – Regeln + Wörterbücher
 *   3. Texterkennung (Screenshots/Video)     – gleiche Regeln
 *   4. Spracherkennung (Video-Ton)           – Satz-Regeln
 *   5. optionales lokales Modell             – nur über Callback, nur wenn nötig
 * Nach jedem Schritt prüft ein Vollständigkeits-Check, ob weitergemacht werden muss.
 */
(function (root) {
  "use strict";

  var VERSION = "0.3.3";
  var SCHEMA_VERSION = 1;

  // ---------------------------------------------------------------------------
  // Vokabular
  // ---------------------------------------------------------------------------

  var KATEGORIEN = ["Frühstück", "Hauptgericht", "Salat & Bowl", "Suppe & Eintopf", "Snack",
    "Beilage", "Dessert", "Backen", "Getränk", "Sauce & Dip"];

  var AISLES = ["Obst & Gemüse", "Kühlregal", "Fleisch & Fisch", "Brot & Backwaren",
    "Trockenware & Konserven", "Gewürze, Öle & Saucen", "Tiefkühl", "Getränke", "Sonstiges"];

  // Einheiten: Alias -> kanonische Einheit. Längere Aliase zuerst prüfen.
  var UNIT_ALIASES = {
    "kilogramm": "kg", "kilo": "kg", "kg": "kg",
    "gramm": "g", "gr": "g", "g": "g", "grams": "g", "gram": "g", "grammes": "g", "kilogramm": "kg", "kilo": "kg",
    "milliliter": "ml", "ml": "ml",
    "zentiliter": "cl", "cl": "cl",
    "liter": "l", "ltr": "l", "l": "l", "litres": "l", "litre": "l", "liters": "l",
    "esslöffel": "EL", "essl": "EL", "el": "EL", "tbsp": "EL", "tablespoons": "EL", "tablespoon": "EL", "tbs": "EL",
    "teelöffel": "TL", "teel": "TL", "tl": "TL", "tsp": "TL", "teaspoons": "TL", "teaspoon": "TL",
    "messerspitze": "Msp", "msp": "Msp",
    "prisen": "Prise", "prise": "Prise", "pinch": "Prise", "pinches": "Prise",
    "stücke": "Stk", "stück": "Stk", "stk": "Stk", "pcs": "Stk", "pieces": "Stk", "piece": "Stk",
    "dosen": "Dose", "dose": "Dose", "cans": "Dose", "can": "Dose",
    "gläser": "Glas", "glas": "Glas", "jar": "Glas",
    "bund": "Bund", "bunch": "Bund", "bunches": "Bund", "bosje": "Bund", "bos": "Bund",
    "blik": "Dose", "blikken": "Dose", "blikje": "Dose", "snufje": "Prise", "eetlepel": "EL", "eetlepels": "EL", "theelepel": "TL", "theelepels": "TL", "sachet": "Pck",
    "zehen": "Zehe", "zehe": "Zehe", "cloves": "Zehe", "clove": "Zehe",
    "päckchen": "Pck", "packungen": "Pck", "packung": "Pck", "pck": "Pck", "pkg": "Pck", "pack": "Pck",
    "tassen": "Tasse", "tasse": "Tasse", "cups": "cup", "cup": "cup",
    "becher": "Becher",
    "scheiben": "Scheibe", "scheibe": "Scheibe", "slices": "Scheibe", "slice": "Scheibe",
    "handvoll": "Handvoll", "handful": "Handvoll", "handfuls": "Handvoll", "hände voll": "Handvoll", "hand voll": "Handvoll", "händevoll": "Handvoll",
    "blöcke": "Block", "block": "Block", "blocks": "Block",
    "chunks": "Stk", "chunk": "Stk", "knobs": "Stk", "knob": "Stk",
    "messlöffel": "Messlöffel", "scoops": "Messlöffel", "scoop": "Messlöffel",
    "tins": "Dose", "tin": "Dose", "jars": "Glas", "glass": "Glas", "glasses": "Glas", "packets": "Pck", "packet": "Pck",
    "zweige": "Zweig", "zweig": "Zweig", "stängel": "Zweig", "stiele": "Zweig", "stiel": "Zweig", "stems": "Zweig", "sprigs": "Zweig", "sprig": "Zweig",
    "blätter": "Blatt", "blatt": "Blatt", "leaves": "Blatt",
    "würfel": "Würfel",
    "stangen": "Stange", "stange": "Stange", "stalks": "Stange", "stalk": "Stange",
    "spritzer": "Spritzer", "schuss": "Schuss", "dash": "Spritzer",
    "ounces": "oz", "ounce": "oz", "oz": "oz",
    "pounds": "lb", "pound": "lb", "lbs": "lb", "lb": "lb"
  };
  var UNIT_KEYS = Object.keys(UNIT_ALIASES).sort(function (a, b) { return b.length - a.length; });

  // Umrechnung angloamerikanischer Einheiten in metrische
  var UNIT_CONVERT = { cup: { unit: "ml", f: 240 }, oz: { unit: "g", f: 28.35 }, lb: { unit: "g", f: 453.6 } };
  // Gramm pro Cup für trockene Zutaten (Cookidoo und deutsche Küchen wiegen statt messen)
  var CUP_GRAMS = [
    [/(brown sugar|brauner zucker)/, 220], [/(powdered sugar|icing sugar|puderzucker)/, 120],
    [/(sugar|zucker)/, 200], [/(flour|mehl)/, 125], [/(oats|haferflocken)/, 90], [/(rice|reis)/, 185],
    [/(butter)/, 227], [/(chocolate chips|schokodrops|chocolate)/, 170], [/(cocoa|kakao)/, 85],
    [/(almonds|mandeln|walnuts|walnüsse|nuts|nüsse)/, 140], [/(quinoa)/, 170], [/(lentils|linsen)/, 190],
    [/(grated cheese|cheese|käse)/, 100], [/(spinach|spinat)/, 30], [/(berries|beeren|blueberries|heidelbeeren)/, 150],
    [/(kichererbse|chickpea)/, 165], [/(erbse|peas)/, 145], [/(bohne|beans)/, 175], [/(mais|corn)/, 165], [/(cashew)/, 130],
    [/(kokosraspel|coconut)/, 80], [/(rosine|raisin)/, 150], [/(dattel|dates)/, 150], [/(hefeflocken|nutritional yeast)/, 60],
    [/(tomate|tomato)/, 180], [/(joghurt|yogurt|yoghurt)/, 245], [/(frischkäse|cream cheese)/, 230], [/(nudel|pasta)/, 100],
    [/(basilikum|minze|petersilie|koriander|basil|mint|parsley|cilantro|kräuter|herbs)/, 25], [/(semmelbrösel|panko|breadcrumbs)/, 60],
    [/(kürbis|pumpkin)/, 245], [/(beeren|himbeer|erdbeer)/, 150], [/(chiasamen|chia)/, 160], [/(leinsamen|flax)/, 150], [/(sesam)/, 145]
  ];

  // Englische Zutatennamen -> deutscher Schlüssel (für Vorrat, Einkauf, Abteilungen)
  var EN_DE = {
    "coconut oil": "kokosöl", "brown sugar": "brauner zucker", "baking soda": "natron", "baking powder": "backpulver",
    "chocolate chips": "schokodrops", "dark chocolate chips": "schokodrops", "dark chocolate": "zartbitterschokolade",
    "chicken breast": "hähnchenbrust", "chicken breasts": "hähnchenbrust", "ground beef": "rinderhackfleisch",
    "spinach": "spinat", "parmesan": "parmesan", "garlic powder": "knoblauchpulver", "rolled oats": "haferflocken",
    "oats": "haferflocken", "rice": "reis", "pasta": "nudeln", "greek yogurt": "griechischer joghurt", "yogurt": "joghurt",
    "heavy cream": "sahne", "cream cheese": "frischkäse", "honey": "honig", "maple syrup": "ahornsirup",
    "peanut butter": "erdnussbutter", "soy sauce": "sojasauce", "cinnamon": "zimt", "vanilla extract": "vanilleextrakt",
    "cocoa powder": "kakao", "bell pepper": "paprika", "red onion": "rote zwiebel", "potatoes": "kartoffel",
    "sweet potato": "süßkartoffel", "chickpeas": "kichererbse", "lentils": "linse", "black beans": "schwarze bohnen",
    "avocado": "avocado", "banana": "banane", "bananas": "banane", "blueberries": "heidelbeere", "lemon juice": "zitronensaft",
    "olive oil": "olivenöl", "vegetable oil": "öl", "cucumber": "gurke", "feta cheese": "feta", "mozzarella": "mozzarella",
    "breadcrumbs": "semmelbrösel", "chili flakes": "chiliflocken", "paprika": "paprikapulver", "cumin": "kreuzkümmel",
    "tomato paste": "tomatenmark", "tomato puree": "tomatenmark", "oil": "öl", "neutral oil": "öl", "vegetable broth": "gemüsebrühe",
    "vegan cream": "pflanzliche sahne", "plant cream": "pflanzliche sahne", "cooking cream": "pflanzliche sahne", "plant milk": "hafermilch",
    "plant-based milk": "hafermilch", "oat milk": "hafermilch", "soy milk": "sojamilch", "corn starch": "speisestärke", "cornstarch": "speisestärke",
    "nutritional yeast": "hefeflocken", "cherry tomatoes": "cherrytomate", "mushrooms": "champignon", "vinegar": "essig",
    "butter beans": "weiße bohnen", "white beans": "weiße bohnen", "kidney beans": "kidneybohne", "garlic cloves": "knoblauch", "clove garlic": "knoblauch",
    "ginger": "ingwer", "onions": "zwiebel", "red onion": "rote zwiebel", "spring onions": "frühlingszwiebel", "green onions": "frühlingszwiebel",
    "zucchini": "zucchini", "eggplant": "aubergine", "broccoli": "brokkoli", "cauliflower": "blumenkohl", "carrots": "möhre",
    "coconut milk": "kokosmilch", "red lentils": "rote linse", "rice": "reis", "quinoa": "quinoa", "tofu": "tofu", "feta": "feta",
    "salmon": "lachs", "tuna": "thunfisch", "ground beef": "rinderhackfleisch", "minced meat": "hackfleisch", "eggs": "ei", "egg": "ei",
    "almonds": "mandel", "walnuts": "walnuss", "cashews": "cashew", "peanuts": "erdnuss", "dates": "dattel", "raisins": "rosine",
    "dark chocolate": "zartbitterschokolade", "cocoa": "kakao", "sweet potatoes": "süßkartoffel", "potatoes": "kartoffel", "lemon zest": "zitrone",
    "parsley": "petersilie", "cilantro": "koriander", "coriander": "koriander", "basil": "basilikum", "thyme": "thymian", "rosemary": "rosmarin",
    "oregano": "oregano", "turmeric": "kurkuma", "italian herbs": "italienische kräuter", "smoked paprika": "paprikapulver", "chili powder": "chilipulver",
    "berries": "beere", "mixed berries": "beere", "flax seeds": "leinsamen", "flaxseeds": "leinsamen", "chia seeds": "chiasamen", "spelt flakes": "dinkelflocken",
    "plant-based yogurt": "pflanzlicher joghurt", "plant yogurt": "pflanzlicher joghurt", "vegan yogurt": "pflanzlicher joghurt", "soy yogurt": "sojajoghurt",
    "kale": "grünkohl", "shallot": "schalotte", "shallots": "schalotte", "dijon mustard": "senf", "mustard": "senf", "white miso paste": "miso",
    "miso paste": "miso", "white miso": "miso", "vegetable stock": "gemüsebrühe", "veg stock": "gemüsebrühe", "udon noodles": "nudeln", "noodles": "nudeln",
    "peas": "erbse", "green peas": "erbse", "soy chunks": "sojaschnetzel", "rice noodles": "reisnudeln", "glass noodles": "glasnudeln",
    "spinach leaves": "spinat", "baby spinach": "spinat", "lemon juice": "zitronensaft", "lime juice": "limettensaft", "sesame seeds": "sesam",
    "sojasoße": "sojasauce", "bread": "brot", "orzo": "nudeln", "garlic clove": "knoblauch", "vegane butter": "margarine", "pflanzliche butter": "margarine",
    "vegan butter": "margarine", "plant butter": "margarine", "sojagranulat": "sojaschnetzel", "oat cooking cream": "pflanzliche sahne", "cooking cream cuisine": "pflanzliche sahne", "sojasosse": "sojasauce", "tamari": "sojasauce", "naturtofu": "tofu", "pflanzenmilch": "hafermilch", "haferdrink": "hafermilch",
    "sojadrink": "sojamilch", "mandeldrink": "mandelmilch", "kokosjoghurt": "pflanzlicher joghurt", "pflanzlichen joghurt": "pflanzlicher joghurt"
  };

  // Englische Zutaten -> deutscher Anzeigename ("Plural~Singular", Singular nur wenn abweichend).
  // Der Schlüssel für Vorrat/Einkauf/Nährwerte entsteht daraus mit normName().
  var EN_NAMES_RAW = [
    // Gemüse & Kräuter
    "onion=Zwiebeln~Zwiebel", "onions=Zwiebeln~Zwiebel", "brown onion=Zwiebeln~Zwiebel", "brown onions=Zwiebeln~Zwiebel",
    "celery stick=Stangen Staudensellerie~Stange Staudensellerie", "celery sticks=Stangen Staudensellerie~Stange Staudensellerie",
    "white wine=Weißwein", "red wine=Rotwein", "dry white wine=Trockener Weißwein", "vegetable stock=Gemüsebrühe", "hot vegetable stock=Heiße Gemüsebrühe",
    "brown lentils=Braune Linsen",
    "zout=Salz", "zout en peper=Salz und Pfeffer", "peper=Pfeffer", "zwarte peper=Schwarzer Pfeffer", "olijfolie=Olivenöl", "neutrale olie=Neutrales Öl", "olie=Öl", "olie om te bakken=Öl zum Braten",
    "knoflook=Knoblauch", "teentjes knoflook=Knoblauchzehen~Knoblauchzehe", "teentje knoflook=Knoblauchzehen~Knoblauchzehe", "tenen knoflook=Knoblauchzehen~Knoblauchzehe", "ui=Zwiebeln~Zwiebel", "uien=Zwiebeln~Zwiebel",
    "rode ui=Rote Zwiebeln~Rote Zwiebel", "witte ui=Weiße Zwiebeln~Weiße Zwiebel", "sjalot=Schalotten~Schalotte", "sjalotten=Schalotten~Schalotte", "tomaat=Tomaten~Tomate", "tomaten=Tomaten~Tomate", "tomatenpuree=Tomatenmark",
    "sojasaus=Sojasauce", "donkere sojasaus=Dunkle Sojasauce", "citroensap=Zitronensaft", "limoensap=Limettensaft", "citroen=Zitronen~Zitrone", "limoen=Limetten~Limette", "partjes citroen=Zitronenspalten",
    "gember=Ingwer", "verse gember=Ingwer", "cm verse gember=Ingwer", "komijn=Kreuzkümmel", "gemalen komijn=Kreuzkümmel", "koriander=Koriander", "verse koriander=Koriander", "gemalen koriander=Gemahlener Koriander",
    "munt=Minze", "verse munt=Minze", "peterselie=Petersilie", "kurkuma=Kurkuma", "gemalen kurkuma=Kurkuma", "paprikapoeder=Paprikapulver", "gerookt paprikapoeder=Geräuchertes Paprikapulver",
    "plantaardige yoghurt=Pflanzlicher Joghurt", "yoghurt met kruiden=Kräuterjoghurt", "basmatirijst=Basmatireis", "rijst=Reis", "zwarte bonen=Schwarze Bohnen", "laurierblad=Lorbeerblatt", "laurierblaadjes=Lorbeerblätter~Lorbeerblatt",
    "tacokruiden=Taco-Gewürz", "chipotlesaus=Chipotle-Sauce", "platbroden=Fladenbrote~Fladenbrot", "platbrood=Fladenbrote~Fladenbrot", "extra stevige tofu=Extra fester Tofu", "stevige tofu=Fester Tofu",
    "rode paprika=Rote Paprika", "mangochutney=Mango-Chutney", "muntchutney=Minz-Chutney", "water=Wasser", "bloem=Mehl", "suiker=Zucker", "kokosmelk=Kokosmilch", "groentebouillon=Gemüsebrühe", "bouillon=Brühe",
    "spinazie=Spinat", "wortel=Möhren~Möhre", "wortels=Möhren~Möhre", "aardappel=Kartoffeln~Kartoffel", "aardappelen=Kartoffeln~Kartoffel", "courgette=Zucchini", "champignons=Champignons~Champignon", "kikkererwten=Kichererbsen",
    "nooch=Hefeflocken", "green chillies=Grüne Chilischoten~Grüne Chilischote", "green chilies=Grüne Chilischoten~Grüne Chilischote", "red chilli powder=Chilipulver", "red chili powder=Chilipulver",
    "torn basil leaves=Basilikum", "salt n pepper=Salz und Pfeffer", "salt and pepper=Salz und Pfeffer", "white giant beans=Weiße Riesenbohnen", "giant beans=Weiße Riesenbohnen", "butter beans=Butterbohnen",
    "ready cooked puy lentils=Gekochte Puy-Linsen", "puy lentils=Puy-Linsen", "flatbreads=Fladenbrote~Fladenbrot", "flatbread=Fladenbrote~Fladenbrot", "broccolini=Brokkoli", "vanilla sugar=Vanillezucker",
    "tempeh=Tempeh", "kimchi=Kimchi", "tzatziki=Tzatziki", "sweetener=Süßstoff", "corn flour=Speisestärke", "cornflour=Speisestärke", "cornstarch=Speisestärke", "lime=Limetten~Limette", "hummus=Hummus", "cracked black pepper=Schwarzer Pfeffer", "lime wedges=Limettenspalten", "lemon wedges=Zitronenspalten", "ground angelica seed=Gemahlene Engelwurzsamen (Golpar)", "cooked brown lentils=Gekochte braune Linsen", "green lentils=Grüne Linsen", "red lentils=Rote Linsen", "red onion=Rote Zwiebeln~Rote Zwiebel", "red onions=Rote Zwiebeln~Rote Zwiebel",
    "white onion=Weiße Zwiebeln~Weiße Zwiebel", "yellow onion=Zwiebeln~Zwiebel", "shallot=Schalotten~Schalotte", "shallots=Schalotten~Schalotte",
    "spring onion=Frühlingszwiebeln~Frühlingszwiebel", "spring onions=Frühlingszwiebeln~Frühlingszwiebel", "green onions=Frühlingszwiebeln~Frühlingszwiebel",
    "green onion=Frühlingszwiebeln~Frühlingszwiebel", "scallions=Frühlingszwiebeln~Frühlingszwiebel", "scallion=Frühlingszwiebeln~Frühlingszwiebel",
    "garlic=Knoblauch", "garlic clove=Knoblauchzehen~Knoblauchzehe", "garlic cloves=Knoblauchzehen~Knoblauchzehe", "clove garlic=Knoblauchzehen~Knoblauchzehe",
    "cloves garlic=Knoblauchzehen~Knoblauchzehe", "ginger=Ingwer", "tomato=Tomaten~Tomate", "tomatoes=Tomaten~Tomate", "cherry tomatoes=Cherrytomaten",
    "sun-dried tomatoes=Getrocknete Tomaten", "sundried tomatoes=Getrocknete Tomaten", "sun dried tomatoes=Getrocknete Tomaten",
    "bell pepper=Paprika", "bell peppers=Paprika", "red bell pepper=Rote Paprika", "red pepper=Rote Paprika", "green bell pepper=Grüne Paprika",
    "cucumber=Gurke", "zucchini=Zucchini", "courgette=Zucchini", "eggplant=Aubergine", "aubergine=Aubergine", "aubergines=Auberginen~Aubergine",
    "carrot=Möhren~Möhre", "carrots=Möhren~Möhre", "potato=Kartoffeln~Kartoffel", "potatoes=Kartoffeln~Kartoffel", "sweet potato=Süßkartoffeln~Süßkartoffel",
    "sweet potatoes=Süßkartoffeln~Süßkartoffel", "broccoli=Brokkoli", "cauliflower=Blumenkohl", "spinach=Spinat", "baby spinach=Babyspinat",
    "fresh spinach=Spinat", "spinach leaves=Spinat", "kale=Grünkohl", "lettuce=Salat", "romaine=Romanasalat", "arugula=Rucola", "rocket=Rucola",
    "mushrooms=Champignons", "mushroom=Champignons", "button mushrooms=Champignons", "shiitake mushrooms=Shiitake-Pilze", "leek=Lauch", "celery=Staudensellerie",
    "celery stalks=Staudensellerie", "corn=Mais", "sweetcorn=Mais", "sweet corn=Mais", "peas=Erbsen", "green peas=Erbsen", "frozen peas=TK-Erbsen",
    "edamame=Edamame", "green beans=Grüne Bohnen", "pumpkin=Kürbis", "butternut squash=Butternutkürbis", "squash=Kürbis", "beetroot=Rote Bete", "beets=Rote Bete",
    "cabbage=Weißkohl", "red cabbage=Rotkohl", "bok choy=Pak Choi", "pak choi=Pak Choi", "asparagus=Spargel", "radishes=Radieschen", "fennel=Fenchel",
    "avocado=Avocados~Avocado", "avocados=Avocados~Avocado", "chili=Chili", "chilli=Chili", "red chili=Rote Chili", "jalapeno=Jalapeños~Jalapeño",
    "jalapeño=Jalapeños~Jalapeño", "parsley=Petersilie", "fresh parsley=Petersilie", "cilantro=Koriander", "coriander=Koriander", "fresh cilantro=Koriander",
    "basil=Basilikum", "fresh basil=Basilikum", "basil leaves=Basilikum", "mint=Minze", "mint leaves=Minze", "dill=Dill", "chives=Schnittlauch",
    "thyme=Thymian", "rosemary=Rosmarin", "oregano=Oregano", "sage=Salbei", "bay leaf=Lorbeerblätter~Lorbeerblatt", "bay leaves=Lorbeerblätter~Lorbeerblatt",
    "lemongrass=Zitronengras", "kaffir lime leaves=Kaffirlimettenblätter",
    // Obst
    "lemon=Zitronen~Zitrone", "lemons=Zitronen~Zitrone", "lime=Limetten~Limette", "limes=Limetten~Limette", "orange=Orangen~Orange", "oranges=Orangen~Orange",
    "banana=Bananen~Banane", "bananas=Bananen~Banane", "ripe bananas=Bananen~Banane", "apple=Äpfel~Apfel", "apples=Äpfel~Apfel", "berries=Beeren",
    "mixed berries=Gemischte Beeren", "frozen berries=TK-Beeren", "blueberries=Heidelbeeren", "raspberries=Himbeeren", "strawberries=Erdbeeren",
    "mango=Mango", "pineapple=Ananas", "dates=Datteln~Dattel", "medjool dates=Medjool-Datteln~Medjool-Dattel", "raisins=Rosinen", "cranberries=Cranberrys",
    "pomegranate seeds=Granatapfelkerne", "pomegranate=Granatapfel", "coconut=Kokosnuss", "desiccated coconut=Kokosraspeln", "shredded coconut=Kokosraspeln",
    "lemon juice=Zitronensaft", "lime juice=Limettensaft", "orange juice=Orangensaft", "lemon zest=Zitronenschale", "lime zest=Limettenschale",
    // Hülsenfrüchte, Getreide, Teigwaren
    "chickpeas=Kichererbsen", "chickpea=Kichererbsen", "garbanzo beans=Kichererbsen", "lentils=Linsen", "red lentils=Rote Linsen", "green lentils=Grüne Linsen",
    "beluga lentils=Belugalinsen", "black beans=Schwarze Bohnen", "kidney beans=Kidneybohnen", "white beans=Weiße Bohnen", "white kidney beans=Weiße Bohnen",
    "cannellini beans=Weiße Bohnen", "butter beans=Weiße Bohnen", "beans=Bohnen", "rice=Reis", "basmati rice=Basmatireis", "jasmine rice=Jasminreis",
    "brown rice=Vollkornreis", "sushi rice=Sushireis", "quinoa=Quinoa", "couscous=Couscous", "bulgur=Bulgur", "oats=Haferflocken", "rolled oats=Haferflocken",
    "oat flakes=Haferflocken", "quick oats=Haferflocken", "spelt flakes=Dinkelflocken", "pasta=Nudeln", "spaghetti=Spaghetti", "penne=Penne", "fusilli=Fusilli",
    "tagliatelle=Tagliatelle", "linguine=Linguine", "rigatoni=Rigatoni", "orzo=Orzo", "lasagna sheets=Lasagneplatten", "lasagne sheets=Lasagneplatten",
    "noodles=Nudeln", "rice noodles=Reisnudeln", "udon noodles=Udon-Nudeln", "ramen noodles=Ramen-Nudeln", "glass noodles=Glasnudeln", "soba noodles=Soba-Nudeln",
    "gnocchi=Gnocchi", "bread=Brot", "sourdough=Sauerteigbrot", "breadcrumbs=Semmelbrösel", "panko=Panko", "tortillas=Tortillas", "tortilla=Tortillas",
    "wraps=Wraps", "pita=Pita", "naan=Naan", "rice paper=Reispapier", "rice paper sheets=Reispapier",
    // Mehl, Backen, Süßen
    "flour=Mehl", "all-purpose flour=Mehl", "all purpose flour=Mehl", "plain flour=Mehl", "self-raising flour=Mehl", "bread flour=Mehl",
    "whole wheat flour=Vollkornmehl", "spelt flour=Dinkelmehl", "almond flour=Mandelmehl", "ground almonds=Gemahlene Mandeln", "chickpea flour=Kichererbsenmehl",
    "oat flour=Hafermehl", "buckwheat flour=Buchweizenmehl", "cornstarch=Speisestärke", "corn starch=Speisestärke", "cornflour=Speisestärke",
    "baking powder=Backpulver", "baking soda=Natron", "yeast=Hefe", "dry yeast=Trockenhefe", "sugar=Zucker", "white sugar=Zucker", "brown sugar=Brauner Zucker",
    "coconut sugar=Kokosblütenzucker", "powdered sugar=Puderzucker", "icing sugar=Puderzucker", "maple syrup=Ahornsirup", "agave=Agavendicksaft",
    "agave syrup=Agavendicksaft", "agave nectar=Agavendicksaft", "honey=Honig", "date syrup=Dattelsirup", "vanilla extract=Vanilleextrakt",
    "vanilla=Vanilleextrakt", "vanilla sugar=Vanillezucker", "cocoa powder=Kakaopulver", "cocoa=Kakaopulver", "cacao powder=Kakaopulver",
    "dark chocolate=Zartbitterschokolade", "chocolate=Schokolade", "chocolate chips=Schokodrops", "dark chocolate chips=Schokodrops",
    "white chocolate=Weiße Schokolade", "protein powder=Proteinpulver", "vanilla protein powder=Vanille-Proteinpulver", "biscoff cookies=Karamellkekse",
    "biscoff spread=Karamellkeks-Creme", "cookies=Kekse", "biscuits=Kekse", "digestive biscuits=Butterkekse",
    // Nüsse & Saaten
    "almonds=Mandeln", "walnuts=Walnüsse", "cashews=Cashewkerne", "cashew nuts=Cashewkerne", "peanuts=Erdnüsse", "hazelnuts=Haselnüsse", "pecans=Pekannüsse",
    "pistachios=Pistazien", "pine nuts=Pinienkerne", "nuts=Nüsse", "mixed nuts=Nüsse", "sesame seeds=Sesam", "sesame=Sesam", "chia seeds=Chiasamen",
    "flax seeds=Leinsamen", "flaxseeds=Leinsamen", "ground flaxseed=Geschrotete Leinsamen", "hemp seeds=Hanfsamen", "pumpkin seeds=Kürbiskerne",
    "sunflower seeds=Sonnenblumenkerne", "peanut butter=Erdnussbutter", "almond butter=Mandelmus", "cashew butter=Cashewmus", "tahini=Tahin",
    // Milch & Alternativen, Eier, Tofu
    "milk=Milch", "plant milk=Pflanzendrink", "plant-based milk=Pflanzendrink", "oat milk=Haferdrink", "soy milk=Sojadrink", "almond milk=Mandeldrink",
    "coconut milk=Kokosmilch", "coconut cream=Kokoscreme", "cream=Sahne", "heavy cream=Sahne", "whipping cream=Schlagsahne", "sour cream=Saure Sahne",
    "plant-based cream=Pflanzliche Kochcreme", "plant based cream=Pflanzliche Kochcreme", "vegan cream=Pflanzliche Kochcreme", "cooking cream=Kochcreme",
    "oat cream=Haferkochcreme", "soy cream=Sojakochcreme", "butter=Butter", "vegan butter=Pflanzliche Butter", "plant butter=Pflanzliche Butter",
    "yogurt=Joghurt", "yoghurt=Joghurt", "greek yogurt=Griechischer Joghurt", "plain yogurt=Naturjoghurt", "vegan yogurt=Pflanzlicher Joghurt",
    "plant-based yogurt=Pflanzlicher Joghurt", "soy yogurt=Sojajoghurt", "coconut yogurt=Kokosjoghurt", "cream cheese=Frischkäse", "vegan cream cheese=Veganer Frischkäse",
    "cheese=Käse", "grated cheese=Geriebener Käse", "vegan cheese=Veganer Käse", "vegan parmesan=Veganer Parmesan", "parmesan=Parmesan", "mozzarella=Mozzarella",
    "feta=Feta", "feta cheese=Feta", "vegan feta=Veganer Feta", "cheddar=Cheddar", "ricotta=Ricotta", "egg=Eier~Ei", "eggs=Eier~Ei", "egg yolk=Eigelb",
    "egg yolks=Eigelb", "egg whites=Eiweiß", "tofu=Tofu", "firm tofu=Tofu", "extra firm tofu=Tofu", "smoked tofu=Räuchertofu", "silken tofu=Seidentofu",
    "tempeh=Tempeh", "seitan=Seitan", "soy chunks=Sojaschnetzel", "nutritional yeast=Hefeflocken",
    // Fleisch & Fisch
    "chicken=Hähnchen", "chicken breast=Hähnchenbrust", "chicken breasts=Hähnchenbrust", "chicken thighs=Hähnchenschenkel", "ground beef=Rinderhackfleisch",
    "minced beef=Rinderhackfleisch", "beef mince=Rinderhackfleisch", "minced meat=Hackfleisch", "bacon=Speck", "ham=Schinken", "salmon=Lachs",
    "salmon fillet=Lachsfilet", "tuna=Thunfisch", "shrimp=Garnelen", "prawns=Garnelen", "cod=Kabeljau",
    // Öle, Saucen, Gewürze
    "olive oil=Olivenöl", "extra virgin olive oil=Olivenöl", "oil=Öl", "neutral oil=Neutrales Öl", "vegetable oil=Neutrales Öl", "canola oil=Rapsöl",
    "rapeseed oil=Rapsöl", "sunflower oil=Sonnenblumenöl", "coconut oil=Kokosöl", "sesame oil=Sesamöl", "toasted sesame oil=Geröstetes Sesamöl",
    "chili oil=Chiliöl", "chili crisp=Chili Crisp", "vinegar=Essig", "rice vinegar=Reisessig", "apple cider vinegar=Apfelessig", "balsamic vinegar=Balsamico",
    "balsamic=Balsamico", "white wine vinegar=Weißweinessig", "soy sauce=Sojasauce", "light soy sauce=Helle Sojasauce", "dark soy sauce=Dunkle Sojasauce",
    "tamari=Tamari", "maple soy=Sojasauce", "hoisin sauce=Hoisinsauce", "sriracha=Sriracha", "hot sauce=Scharfe Sauce", "gochujang=Gochujang",
    "miso=Miso", "miso paste=Misopaste", "white miso=Helle Misopaste", "white miso paste=Helle Misopaste", "red curry paste=Rote Currypaste",
    "green curry paste=Grüne Currypaste", "curry paste=Currypaste", "tomato paste=Tomatenmark", "tomato puree=Tomatenmark", "passata=Passierte Tomaten",
    "canned tomatoes=Dosentomaten", "chopped tomatoes=Gehackte Tomaten", "crushed tomatoes=Gehackte Tomaten", "diced tomatoes=Gehackte Tomaten",
    "tomato sauce=Tomatensauce", "ketchup=Ketchup", "mustard=Senf", "dijon mustard=Dijonsenf", "mayonnaise=Mayonnaise", "vegan mayo=Vegane Mayonnaise",
    "vegan mayonnaise=Vegane Mayonnaise", "pesto=Pesto", "vegetable broth=Gemüsebrühe", "vegetable stock=Gemüsebrühe", "veggie broth=Gemüsebrühe",
    "veg stock=Gemüsebrühe", "broth=Brühe", "stock=Brühe", "water=Wasser", "salt=Salz", "sea salt=Meersalz", "pepper=Pfeffer", "black pepper=Schwarzer Pfeffer",
    "salt and pepper=Salz und Pfeffer", "salt & pepper=Salz und Pfeffer", "paprika=Paprikapulver", "smoked paprika=Geräuchertes Paprikapulver",
    "sweet paprika=Paprikapulver edelsüß", "chili flakes=Chiliflocken", "red pepper flakes=Chiliflocken", "chilli flakes=Chiliflocken", "chili powder=Chilipulver",
    "cayenne=Cayennepfeffer", "cayenne pepper=Cayennepfeffer", "cumin=Kreuzkümmel", "ground cumin=Kreuzkümmel", "cumin seeds=Kreuzkümmelsamen",
    "coriander seeds=Koriandersamen", "ground coriander=Gemahlener Koriander", "turmeric=Kurkuma", "curry powder=Currypulver", "garam masala=Garam Masala",
    "cinnamon=Zimt", "ground cinnamon=Zimt", "nutmeg=Muskat", "cardamom=Kardamom", "cloves=Nelken", "garlic powder=Knoblauchpulver", "onion powder=Zwiebelpulver",
    "italian seasoning=Italienische Kräuter", "italian herbs=Italienische Kräuter", "italian spice blend=Italienische Kräuter", "mixed herbs=Kräuter",
    "dried herbs=Getrocknete Kräuter", "herbs=Kräuter", "fresh herbs=Frische Kräuter", "sumac=Sumach", "za'atar=Za'atar", "zaatar=Za'atar",
    "ras el hanout=Ras el Hanout", "harissa=Harissa", "liquid smoke=Flüssigrauch", "worcestershire sauce=Worcestershiresauce", "ice=Eiswürfel", "ice cubes=Eiswürfel", "pasta water=Nudelwasser", "reserved pasta water=Nudelwasser", "boiling water=Wasser", "warm water=Wasser", "cold water=Wasser"
  ];
  var EN_NAMES = {};
  EN_NAMES_RAW.forEach(function (l) { var p = l.split("="); EN_NAMES[p[0]] = p[1]; });

  // Englische Zusätze -> Deutsch (für Notizen und Zustände)
  var EN_WORDS = {
    "broken into pieces": "in Stücke gebrochen", "fijngehakt": "fein gehackt", "gehakt": "gehackt", "in stukken": "in Stücken", "in stukjes": "in Stücken", "in blokjes": "gewürfelt", "fijngeraspt": "fein gerieben", "geraspt": "gerieben",
    "gewassen": "gewaschen", "geperst": "gepresst", "naar smaak": "nach Geschmack", "optioneel": "optional", "incl. vocht": "mit Flüssigkeit", "gescheurd": "gezupft", "geprakt": "zerdrückt", "in blokken gescheurd": "in Stücke gezupft",
    "geperst en in blokken gescheurd": "gepresst, in Stücke gezupft", "kleine": "klein", "klein": "klein", "torn into small pieces": "in kleine Stücke gezupft", "torn into klein pieces": "in kleine Stücke gezupft", "torn into pieces": "in Stücke gezupft",
    "cut into pieces": "in Stücke geschnitten", "cubes": "Würfel", "chopped in": "geschnitten in", "unsoaked-see instructions": "ungeweicht – siehe Zubereitung", "see instructions": "siehe Zubereitung", "hours": "Stunden", "hour": "Stunde", "washed": "gewaschen", "pre-soaked": "eingeweicht", "presoaked": "eingeweicht", "soaked": "eingeweicht", "optional garnish": "optional zum Garnieren", "garnish": "zum Garnieren", "for garnish": "zum Garnieren", "into pieces": "in Stücke", "leaves": "Blätter", "glug of cider": "ein Schuss Cidre", "glug of": "ein Schuss", "cider": "Cidre", "or": "oder",
    "freshly cracked": "frisch gemahlen", "freshly ground": "frisch gemahlen", "finely chopped": "fein gehackt", "roughly chopped": "grob gehackt", "chopped": "gehackt", "minced": "fein gehackt", "diced": "gewürfelt",
    "finely diced": "fein gewürfelt", "cubed": "gewürfelt", "thinly sliced": "in dünnen Scheiben", "sliced": "in Scheiben", "grated": "gerieben",
    "finely grated": "fein gerieben", "shredded": "geraspelt", "crushed": "zerdrückt", "mashed": "zerdrückt", "ground": "gemahlen", "toasted": "geröstet",
    "roasted": "geröstet", "melted": "geschmolzen", "softened": "weich", "at room temperature": "zimmerwarm", "room temperature": "zimmerwarm",
    "frozen": "TK", "thawed": "aufgetaut", "ripe": "reif", "large": "groß", "small": "klein", "medium": "mittelgroß", "big": "groß", "cooked": "gekocht",
    "uncooked": "ungekocht", "drained": "abgetropft", "drained and rinsed": "abgetropft und abgespült", "rinsed": "abgespült", "rinsed and drained": "abgespült und abgetropft",
    "peeled": "geschält", "packed": "fest gedrückt", "heaped": "gehäuft", "divided": "aufgeteilt", "to taste": "nach Geschmack", "for serving": "zum Servieren",
    "to serve": "zum Servieren", "for garnish": "zum Garnieren", "to garnish": "zum Garnieren", "for topping": "zum Bestreuen", "for frying": "zum Braten",
    "for cooking": "zum Braten", "for colour": "für die Farbe", "for color": "für die Farbe", "optional": "optional", "unsweetened": "ungesüßt", "fresh": "frisch",
    "dried": "getrocknet", "dry": "trocken", "canned": "aus der Dose", "tinned": "aus der Dose", "smoked": "geräuchert", "raw": "roh", "warm": "warm", "cold": "kalt",
    "boiling": "kochend", "hot": "heiß", "lukewarm": "lauwarm", "juiced": "ausgepresst", "zested": "abgerieben", "halved": "halbiert", "quartered": "geviertelt",
    "deseeded": "entkernt", "pitted": "entsteint", "soaked": "eingeweicht", "pressed": "gepresst", "spicy": "scharf", "mild": "mild", "plus extra": "und etwas mehr",
    "plus more": "und etwas mehr", "or more": "oder mehr", "if needed": "bei Bedarf", "as needed": "nach Bedarf", "about": "ca.", "approx": "ca.", "each": "je",
    "whole": "ganz", "super firm": "extra fest", "extra firm": "extra fest", "leftover": "vom Vortag", "day-old": "vom Vortag", "firm": "fest", "light": "hell", "dark": "dunkel", "extra virgin": "nativ extra"
  };
  var EN_WORD_KEYS = Object.keys(EN_WORDS).sort(function (a, b) { return b.length - a.length; });

  var NUMBER_WORDS = {
    "ein": 1, "eine": 1, "einen": 1, "einem": 1, "einer": 1, "a": 1, "an": 1, "one": 1,
    "zwei": 2, "two": 2, "drei": 3, "three": 3, "vier": 4, "four": 4, "fünf": 5, "five": 5,
    "sechs": 6, "six": 6, "sieben": 7, "seven": 7, "acht": 8, "eight": 8, "neun": 9, "nine": 9,
    "zehn": 10, "ten": 10, "zwölf": 12, "twelve": 12,
    "halbe": 0.5, "halben": 0.5, "halber": 0.5, "halb": 0.5, "half": 0.5,
    "viertel": 0.25, "anderthalb": 1.5, "eineinhalb": 1.5
  };
  var FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

  // Häufige Pluralformen -> Grundform (für Vorrat/Einkauf-Schlüssel)
  var SINGULAR = {
    "eier": "ei", "eiern": "ei", "eggs": "ei", "egg": "ei",
    "äpfel": "apfel", "knoblauchzehen": "knoblauch", "knoblauchzehe": "knoblauch", "garlic": "knoblauch",
    "zwiebeln": "zwiebel", "onions": "zwiebel", "onion": "zwiebel",
    "karotten": "möhre", "karotte": "möhre", "möhren": "möhre", "carrots": "möhre", "carrot": "möhre",
    "paprikaschoten": "paprika", "paprikaschote": "paprika",
    "frühlingszwiebeln": "frühlingszwiebel", "lauchzwiebeln": "frühlingszwiebel", "lauchzwiebel": "frühlingszwiebel",
    "champignons": "champignon", "tomatoes": "tomate", "tomato": "tomate",
    "kichererbsen": "kichererbse", "chickpeas": "kichererbse",
    "olivenöl extra vergine": "olivenöl", "natives olivenöl": "olivenöl", "olive oil": "olivenöl",
    "salt": "salz", "pepper": "pfeffer", "water": "wasser", "sugar": "zucker", "butter": "butter",
    "flour": "mehl", "weizenmehl": "mehl", "milk": "milch", "lemon": "zitrone", "lime": "limette"
  };

  // Grundvorrat: Auswahlliste für den Nutzer. "standard" = gilt ohne Einstellung als vorhanden.
  // Festgelegt vom Nutzer (D-f): Gewürze + Öle/Essig ja, Backen/Süßen und Sonstiges nein.
  var GRUNDVORRAT = [
    { gruppe: "Würzen", eintraege: [["Salz", 1], ["Pfeffer", 1], ["Paprikapulver", 1], ["Currypulver", 1], ["Kreuzkümmel", 1], ["Zimt", 1],
      ["Chiliflocken", 1], ["Oregano", 0], ["Italienische Kräuter", 1], ["Muskat", 0], ["Knoblauchpulver", 0], ["Gemüsebrühe", 1]] },
    { gruppe: "Öle & Saucen", eintraege: [["Olivenöl", 1], ["Neutrales Öl", 1], ["Essig", 1], ["Balsamico", 1], ["Sojasauce", 0], ["Senf", 0], ["Tomatenmark", 0]] },
    { gruppe: "Backen & Süßen", eintraege: [["Zucker", 0], ["Mehl", 0], ["Backpulver", 0], ["Natron", 0], ["Vanillezucker", 0], ["Honig", 0], ["Ahornsirup", 0], ["Speisestärke", 0]] },
    { gruppe: "Sonstiges", eintraege: [["Knoblauch", 0], ["Zwiebeln", 0], ["Reis", 0], ["Nudeln", 0], ["Haferflocken", 0]] }
  ];
  // Immer vorhanden (nicht abwählbar): Wasser, Eis
  var ALWAYS = ["wasser", "eiswasser", "warmes wasser", "kaltes wasser", "eiswürfel", "nudelwasser", "kochwasser"];
  // Varianten, die zum selben Vorrats-Eintrag gehören
  var STAPLE_ALIASES = {
    "pfeffer": ["schwarzer pfeffer", "pfeffer schwarz", "weißer pfeffer", "salz und pfeffer", "salz pfeffer"],
    "salz": ["meersalz", "jodsalz", "steinsalz", "salz und pfeffer", "flocksalz", "kala namak"],
    "neutrales öl": ["öl", "rapsöl", "sonnenblumenöl", "pflanzenöl", "erdnussöl", "bratöl"],
    "olivenöl": ["natives olivenöl", "olivenöl extra vergine"], "essig": ["weißweinessig", "apfelessig", "reisessig", "rotweinessig", "branntweinessig"],
    "balsamico": ["balsamicoessig", "aceto balsamico", "balsamico essig", "heller balsamico", "balsamicocreme"],
    "gemüsebrühe": ["gemüsebrühe pulver", "brühe", "gemüsebrühpulver", "gemüsefond", "instant brühe"],
    "chiliflocken": ["chili flocken", "chiliflocke"], "paprikapulver": ["paprika edelsüß", "geräuchertes paprikapulver", "paprikapulver edelsüß", "rauchpaprika", "paprika rosenscharf"],
    "currypulver": ["curry", "curry pulver"], "italienische kräuter": ["kräuter der provence", "pizzagewürz"], "zimt": ["ceylon zimt", "zimtpulver"]
  };
  var _stapleIdx = null;
  function stapleIndex() {
    if (_stapleIdx) return _stapleIdx;
    _stapleIdx = {};
    GRUNDVORRAT.forEach(function (g) { g.eintraege.forEach(function (e) {
      var k = normName(e[0]); _stapleIdx[k] = k;
      _stapleIdx[lower(e[0])] = k;
      (STAPLE_ALIASES[lower(e[0])] || []).forEach(function (a) { _stapleIdx[normName(a)] = k; _stapleIdx[a] = k; });
    }); });
    return _stapleIdx;
  }
  // Zu welchem Vorrats-Eintrag gehört eine Zutat? (null = keiner)
  function vorratsSchluessel(key) { return stapleIndex()[key] || null; }
  function standardVorrat() {
    var out = {};
    GRUNDVORRAT.forEach(function (g) { g.eintraege.forEach(function (e) { out[normName(e[0])] = { have: !!e[1], standard: true }; }); });
    return out;
  }

  // Wörterbücher für Ernährungsstil (Teilstring-Treffer wegen deutscher Komposita)
  var DICT = {
    meat: ["hähnchen", "hühnchen", "huhn", "chicken", "pute", "truthahn", "turkey", "rind", "beef", "kalb",
      "schwein", "pork", "speck", "bacon", "schinken", "ham", "salami", "chorizo", "wurst", "würstchen",
      "hackfleisch", "hack", "mett", "lamm", "lamb", "ente", "duck", "gans", "reh", "hirsch", "steak",
      "gyros", "döner", "pancetta", "prosciutto", "leberkäse", "frikadelle", "gelatine", "gelatin",
      "bratwurst", "kassler", "geflügel", "putenbrust", "rinderbrühe", "hühnerbrühe", "chicken stock", "beef stock"],
    fish: ["fisch", "fish", "lachs", "salmon", "thunfisch", "tuna", "kabeljau", "dorsch", "seelachs", "forelle",
      "hering", "makrele", "sardine", "sardelle", "anchovis", "anchovy", "garnele", "shrimp", "prawn", "krabbe",
      "scampi", "muschel", "tintenfisch", "calamari", "oktopus", "surimi", "worcestershire", "zander", "pangasius"],
    dairy: ["milch", "milk", "butter", "sahne", "cream", "schmand", "crème fraîche", "creme fraiche", "joghurt",
      "jogurt", "yogurt", "yoghurt", "quark", "käse", "cheese", "parmesan", "mozzarella", "feta", "ricotta",
      "mascarpone", "burrata", "halloumi", "ghee", "molke", "skyr", "kefir", "gouda", "cheddar", "pecorino",
      "grana padano", "hüttenkäse", "cottage", "emmentaler", "schlagsahne", "saure sahne", "sour cream"],
    egg: ["ei", "eier", "egg", "eggs", "eigelb", "eiklar", "eidotter", "mayonnaise", "mayo"],
    honey: ["honig", "honey"]
  };
  // Treffer, die KEINE tierischen Produkte sind
  var NOT_ANIMAL = ["vegan frischkäse", "vegan käse", "vegan joghurt", "vegan butter", "vegan sahne", "vegan quark", "vegan feta", "vegan mozzarella", "vegan parmesan", "hafermilch", "sojamilch", "mandelmilch", "reismilch", "kokosmilch", "pflanzenmilch",
    "cashewmilch", "erbsenmilch", "dinkelmilch", "oat milk", "soy milk", "almond milk", "coconut milk",
    "erdnussbutter", "mandelbutter", "cashewbutter", "kakaobutter", "nussbutter", "peanut butter",
    "almond butter", "butternut", "butterbohne", "butterbohnen", "butter beans", "sojajoghurt", "kokosjoghurt",
    "haferjoghurt", "mandeljoghurt", "sojasahne", "hafersahne", "kokossahne", "coconut cream",
    "veganer", "vegane", "veganes", "vegan", "pflanzlich", "cashewkäse", "hefeflocken", "kokosnuss",
    "fischsoßenersatz", "blumenkohlsteak", "kohlsteak", "tofusteak", "selleriesteak", "tofuwurst", "sojawurst", "eisberg", "eiswürfel", "eisbergsalat", "rindenmulch"];
  // Ganze Wörter, die nur als ganzes Wort zählen (sonst "Reis" -> "ei")
  var WHOLE_WORD = { "ei": 1, "eier": 1, "egg": 1, "eggs": 1, "ham": 1, "hack": 1, "huhn": 1, "ente": 1,
    "gans": 1, "reh": 1, "rind": 1, "mayo": 1, "fish": 1, "duck": 1, "lamb": 1, "beef": 1, "milk": 1, "cream": 1 };

  // EU-Hauptallergene (VO (EU) 1169/2011, Anhang II) – Erkennung ohne Gewähr
  var ALLERGENS = {
    "Gluten": ["weizen", "mehl", "dinkel", "roggen", "gerste", "hafer", "nudel", "pasta", "spaghetti", "penne",
      "fusilli", "tagliatelle", "lasagne", "brot", "brötchen", "toast", "couscous", "bulgur", "grieß",
      "semmelbrösel", "paniermehl", "panko", "seitan", "sojasauce", "sojasoße", "tortilla", "wrap",
      "blätterteig", "pizzateig", "croutons", "malz", "flour", "bread", "noodle", "soy sauce", "gnocchi",
      "ramen", "udon", "baguette", "ciabatta", "focaccia"],
    "Krebstiere": ["garnele", "shrimp", "prawn", "krabbe", "hummer", "languste", "scampi", "krebs", "crab", "lobster"],
    "Ei": ["ei", "eier", "egg", "eggs", "eigelb", "eiklar", "mayonnaise", "mayo"],
    "Fisch": ["fisch", "fish", "lachs", "salmon", "thunfisch", "tuna", "kabeljau", "forelle", "hering", "makrele",
      "sardine", "sardelle", "anchovis", "fischsauce", "fish sauce", "worcestershire", "zander", "seelachs"],
    "Erdnüsse": ["erdnuss", "peanut"],
    "Soja": ["soja", "tofu", "tempeh", "edamame", "miso", "soy"],
    "Milch": DICT.dairy,
    "Schalenfrüchte": ["mandel", "haselnuss", "walnuss", "cashew", "pistazie", "pekannuss", "paranuss",
      "macadamia", "almond", "hazelnut", "walnut", "pistachio", "pecan"],
    "Sellerie": ["sellerie", "celery"],
    "Senf": ["senf", "mustard"],
    "Sesam": ["sesam", "tahin", "tahini", "sesame"],
    "Sulfite": ["wein", "wine", "sekt", "trockenpflaume", "getrocknete aprikose"],
    "Lupine": ["lupine", "lupin"],
    "Weichtiere": ["muschel", "tintenfisch", "calamari", "oktopus", "schnecke", "auster", "mussel", "squid", "oyster"]
  };
  var ALLERGEN_EXCEPTIONS = {
    "Gluten": ["mandelmehl", "kokosmehl", "reismehl", "maismehl", "kichererbsenmehl", "buchweizenmehl",
      "glutenfrei", "reisnudel", "glasnudel", "maistortilla", "kartoffelmehl", "tapiokamehl", "johannisbrotkernmehl",
      "erdnussmehl", "linsennudel", "kichererbsennudel", "almond flour", "coconut flour", "rice noodle"],
    "Milch": NOT_ANIMAL,
    "Ei": NOT_ANIMAL,
    "Schalenfrüchte": ["erdnuss", "kokosnuss", "muskatnuss", "mandelmilch"]
  };

  // Abteilungen im Supermarkt
  var AISLE_DICT = [
    ["Kühlregal", ["milch", "butter", "sahne", "joghurt", "quark", "käse", "feta", "mozzarella", "parmesan", "ricotta",
      "mascarpone", "schmand", "crème", "frischkäse", "skyr", "ei", "eier", "tofu", "tempeh", "hafermilch",
      "sojamilch", "mandelmilch", "kefir", "halloumi", "burrata", "hefe", "blätterteig", "pizzateig", "gnocchi"]],
    ["Fleisch & Fisch", DICT.meat.concat(["lachs", "thunfisch", "garnele", "kabeljau", "forelle", "fisch", "shrimp", "scampi"])],
    ["Tiefkühl", ["tk-", "tiefkühl", "gefroren", "frozen", "tk "]],
    ["Brot & Backwaren", ["brot", "brötchen", "toast", "baguette", "ciabatta", "tortilla", "wrap", "pita", "naan", "fladenbrot"]],
    ["Gewürze, Öle & Saucen", ["salz", "pfeffer", "öl", "essig", "paprikapulver", "kurkuma", "kreuzkümmel", "zimt",
      "curry", "chili", "oregano", "thymian getrocknet", "gewürz", "sojasauce", "sojasoße", "senf", "ketchup",
      "brühe", "tahin", "honig", "ahornsirup", "agavendicksaft", "muskat", "garam masala", "paprika edelsüß",
      "paprika rosenscharf", "vanille", "backpulver", "natron", "sirup", "sriracha", "pesto", "tomatenmark", "worcestershire", "miso"]],
    ["Obst & Gemüse", ["zwiebel", "knoblauch", "tomate", "paprika", "gurke", "zucchini", "aubergine", "möhre",
      "karotte", "kartoffel", "süßkartoffel", "brokkoli", "blumenkohl", "spinat", "salat", "rucola", "lauch",
      "sellerie", "pilz", "champignon", "avocado", "zitrone", "limette", "orange", "apfel", "banane", "beere",
      "erdbeere", "himbeere", "heidelbeere", "mango", "ananas", "ingwer", "chili", "petersilie", "koriander",
      "basilikum", "minze", "schnittlauch", "dill", "rosmarin", "thymian", "frühlingszwiebel", "kürbis",
      "rote bete", "kohl", "fenchel", "spargel", "mais", "erbsen", "bohnen grün", "pak choi", "radieschen", "obst", "gemüse"]],
    ["Getränke", ["wein", "bier", "saft", "wasser sprudel", "kaffee", "espresso", "tee"]],
    ["Trockenware & Konserven", ["mehl", "zucker", "reis", "nudel", "pasta", "spaghetti", "haferflocken", "linsen",
      "linse", "kichererbse", "bohnen", "dose", "couscous", "bulgur", "quinoa", "mandel", "nuss", "samen", "kerne",
      "chia", "leinsamen", "rosinen", "datteln", "schokolade", "kakao", "kokosmilch", "passierte tomaten",
      "gehackte tomaten", "polenta", "grieß", "semmelbrösel", "panko", "proteinpulver"]]
  ];

  var CAT_WORD_START = { latte: 1, dip: 1, drink: 1, shake: 1, bars: 1, pho: 1, poke: 1, bake: 1, rolls: 1, chips: 1, tee: 1, salsa: 1, beans: 1, riegel: 1, snack: 1, cake: 1, pudding: 1 };
  var CATEGORY_KEYWORDS = [
    ["Frühstück", ["frühstück", "breakfast", "porridge", "overnight oats", "müsli", "granola", "pancake",
      "french toast", "rührei", "omelett", "omelette", "chia pudding", "chiapudding", "brunch", "frühstücks", "bircher"]],
    ["Backen", ["kuchen", "cake", "brownie", "muffin", "cookie", "kekse", "plätzchen", "tarte", "torte",
      "zimtschnecke", "strudel", "brötchen", "bananenbrot", "banana bread", "focaccia", "brötchen backen", "brot backen", "hefezopf", "scones", "cupcake", "blechkuchen"]],
    ["Dessert", ["dessert", "nachtisch", "nachspeise", "mousse", "tiramisu", "pudding", "sorbet", "panna cotta",
      "crumble", "cheesecake", "parfait", "eiscreme", "nicecream", "nice cream", "creme brulee", "crème brûlée"]],
    ["Suppe & Eintopf", ["suppe", "soup", "eintopf", "stew", "chili con", "chili sin", "ramen", "brühe", "minestrone",
      "gulasch", "dal ", "dhal", "linsensuppe", "cremesuppe", "pho"]],
    ["Salat & Bowl", ["salat", "salad", "bowl", "buddha", "poke"]],
    ["Sauce & Dip", ["dip", "pesto", "hummus", "aufstrich", "dressing", "guacamole", "salsa", "sauce selber", "tzatziki"]],
    ["Getränk", ["smoothie", "shake", "drink", "latte", "limonade", "cocktail", "mocktail", "eistee", "lassi"]],
    ["Snack", ["snack", "energy balls", "energiebällchen", "bliss balls", "riegel", "bars", "cracker", "popcorn", "chips", "fingerfood"]],
    ["Beilage", ["beilage", "side dish", "ofengemüse", "kartoffelpüree", "pommes", "wedges", "reis als beilage"]],
    ["Hauptgericht", ["pasta", "nudel", "spaghetti", "lasagne", "lasagna", "gnocchi", "curry", "pfanne", "risotto", "auflauf", "tofu", "steak", "burger", "pizza", "tacos", "quesadilla", "noodles", "udon", "ramen", "gulasch", "manti", "maultaschen", "schupfnudel", "one pot", "ofengericht", "bake", "rolls", "naan", "tortilla", "beans", "bohnen", "kichererbsen"]]
  ];

  var EQUIPMENT = [
    ["Thermomix", /\b(thermomix|tm5|tm6|tm7|varoma|linkslauf|stufe\s*\d)/i],
    ["Airfryer", /(airfryer|air fryer|heißluftfritteuse|heissluftfritteuse)/i],
    ["Ofen", /(backofen|\bofen|oven|umluft|ober-?\s*\/?\s*unterhitze|vorheizen|preheat|\bbacken\b|bake\b|\d+\s*°\s*[cf]?\s*(umluft|o\/u))/i],
    ["Mixer", /(mixer|blender|pürier|food processor|küchenmaschine|stabmixer|zerkleinerer)/i],
    ["Pfanne", /(pfanne|\bpan\b|skillet|anbraten|braten|sautieren|fry)/i],
    ["Topf", /(\btopf|\bpot\b|kochen|köcheln|simmer|boil)/i],
    ["Mikrowelle", /(mikrowelle|microwave)/i]
  ];

  var TECHNIQUES = /(blind backen|temperier|flambier|karamellisier|emulgier|laminier|sous.?vide|fermentier|hefeteig|gehen lassen|über nacht|wasserbad|ausbacken|frittier|deep fry|proof|knead|kneten)/i;

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------

  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;
  var BULLET_RE = /^[\s\-–—•*·▪◦●○■□►▶▸➤➜➡✓✔☑✗×+>|]+/u;

  function stripEmoji(s) { return String(s || "").replace(EMOJI_RE, " ").replace(/\s{2,}/g, " ").trim(); }
  function clean(s) { return String(s == null ? "" : s).replace(/[\uFFFD\u2060\u200B-\u200D\uFEFF]/g, " ").replace(/\s+/g, " ").trim(); }
  function lower(s) { return String(s || "").toLowerCase(); }

  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
    hellip: "…", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", auml: "ä", ouml: "ö", uuml: "ü",
    Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", eacute: "é", egrave: "è", rsquo: "’", lsquo: "‘",
    rdquo: "”", ldquo: "„", bdquo: "„", times: "×" };
  function decodeEntities(s) {
    return String(s || "").replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, function (m, e) {
      if (e[0] === "#") {
        var code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
    });
  }
  function stripTags(s) { return decodeEntities(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")); }

  // Kurze Begriffe nur am Wortanfang ("Limette" enthält "mett", "Flammkuchen" enthält "lamm")
  var WORD_START = { "mett": 1, "lamm": 1, "pute": 1, "rind": 1, "kalb": 1, "speck": 1, "ente": 1, "reh": 1, "huhn": 1 };
  function containsTerm(haystack, term) {
    if (WORD_START[term] && !WHOLE_WORD[term]) return new RegExp("(^|[^a-zäöüß])" + escapeRe(term), "i").test(haystack);
    if (WHOLE_WORD[term]) {
      var re = new RegExp("(^|[^a-zäöüß])" + escapeRe(term) + "($|[^a-zäöüß])", "i");
      return re.test(haystack);
    }
    return haystack.indexOf(term) !== -1;
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function anyTerm(haystack, terms) {
    for (var i = 0; i < terms.length; i++) if (containsTerm(haystack, terms[i])) return terms[i];
    return null;
  }
  // Treffer, aber nicht, wenn eine Ausnahme im selben Text steht
  function matchWithExceptions(text, terms, exceptions) {
    var t = lower(text);
    if (exceptions) for (var i = 0; i < exceptions.length; i++) t = t.split(exceptions[i]).join(" ");
    return anyTerm(t, terms);
  }

  function round(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }

  // ---------------------------------------------------------------------------
  // Zahlen, Einheiten, Zeiten
  // ---------------------------------------------------------------------------

  // Liest eine Mengenangabe am Anfang von s. Gibt {value, max, rest} oder null.
  function readQuantity(s) {
    var str = String(s).replace(/^(ca\.?|circa|etwa|ungefähr|approx\.?|about|~)\s*/i, "");
    var m;
    // "1 1/2", "1½"
    m = str.match(/^(\d+)\s*(?:(\d+)\s*\/\s*(\d+)|([½¼¾⅓⅔⅛]))/);
    if (m && (m[2] || m[4])) {
      var frac = m[4] ? FRACTIONS[m[4]] : (+m[2] / +m[3]);
      return withRange(+m[1] + frac, str.slice(m[0].length));
    }
    m = str.match(/^(\d+)\s*\/\s*(\d+)/);
    if (m && +m[2] > 0) return withRange(+m[1] / +m[2], str.slice(m[0].length));
    m = str.match(/^([½¼¾⅓⅔⅛])/);
    if (m) return withRange(FRACTIONS[m[1]], str.slice(m[0].length));
    m = str.match(/^(\d+(?:[.,]\d+)?)/);
    if (m) return withRange(parseFloat(m[1].replace(",", ".")), str.slice(m[0].length));
    m = str.match(/^([a-zäöüß]+)\b\s*/i);
    if (m && Object.prototype.hasOwnProperty.call(NUMBER_WORDS, m[1].toLowerCase())) {
      // "eine Prise", "zwei Zwiebeln" – aber nicht "a bit"
      return withRange(NUMBER_WORDS[m[1].toLowerCase()], str.slice(m[0].length), true);
    }
    return null;
  }
  function withRange(value, rest, fromWord) {
    var m = rest.match(/^\s*(?:-|–|—|bis|to)\s*(\d+(?:[.,]\d+)?)/i);
    var max = null;
    if (m) { max = parseFloat(m[1].replace(",", ".")); rest = rest.slice(m[0].length); }
    return { value: value, max: max, rest: rest, fromWord: !!fromWord };
  }

  // Liest eine Einheit am Anfang von s (direkt angehängt erlaubt: "200g").
  function readUnit(s) {
    var str = String(s).replace(/^\s+/, "");
    var low = str.toLowerCase();
    for (var i = 0; i < UNIT_KEYS.length; i++) {
      var k = UNIT_KEYS[i];
      if (low.indexOf(k) === 0) {
        var next = low.charAt(k.length);
        // Einheit muss als Wort enden ("g " ja, "gurke" nein)
        if (next === "" || /[\s.,:;)\/]/.test(next)) {
          var rest = str.slice(k.length).replace(/^\.\s*/, " ");
          return { unit: UNIT_ALIASES[k], rest: rest };
        }
      }
    }
    return null;
  }

  // Dauer in Minuten aus ISO 8601 ("PT1H30M") oder Freitext ("1 Std. 20 Min")
  function parseDuration(s) {
    if (s == null || s === "") return null;
    if (typeof s === "number") return s;
    var str = String(s).trim();
    var iso = str.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
    if (iso && (iso[1] || iso[2] || iso[3] || iso[4])) {
      var mins = (+iso[1] || 0) * 1440 + (+iso[2] || 0) * 60 + (+iso[3] || 0) + (+iso[4] || 0) / 60;
      return mins > 0 ? Math.round(mins) : null;
    }
    var total = 0, found = false, m;
    var h = /(\d+(?:[.,]\d+)?)\s*(?:std\.?|stunden?|stunde|h\b|hrs?\b|hours?)/i;
    var mi = /(\d+)\s*(?:min\.?|minuten|minute|mins?\b|m\b)/i;
    if ((m = str.match(h))) { total += parseFloat(m[1].replace(",", ".")) * 60; found = true; }
    if ((m = str.match(mi))) { total += +m[1]; found = true; }
    return found && total > 0 ? Math.round(total) : null;
  }

  // ---------------------------------------------------------------------------
  // Zutaten
  // ---------------------------------------------------------------------------

  function normName(name) {
    var n = lower(name).replace(/\(.*?\)/g, " ").replace(/[^a-zäöüßéè\s-]/g, " ").replace(/\s+/g, " ").trim();
    if (SINGULAR[n]) return SINGULAR[n];
    if (EN_DE[n]) return EN_DE[n];
    n = n.replace(/^(finely chopped|roughly chopped|thinly sliced|freshly ground|chopped|sliced|grated|light|white|yellow|sun-?dried|fein gehackte[rsn]?|frisch geriebene[rsn]?)\s+/, "");
    n = n.replace(/^(frische[rsn]?|glatte[rsn]?|krause[rsn]?|getrocknete[rsn]?|gehackte[rsn]?|geriebene[rsn]?|kleine[rsn]?|große[rsn]?|mittelgroße[rsn]?|gelbe[rsn]?|reife[rsn]?|gefrorene[rsn]?|gewürfelte[rsn]?|zerdrückte[rsn]?|kleiner|großer|mittelgroße[rsn]?|dicke[rsn]?|gekochte[rsn]?|ungesüßte[rsn]?|neutrale[rsn]?|bio|tk|fresh|large|small|medium|dried|chopped|ripe|frozen|diced|minced|melted|roasted|toasted|unsalted|salted|ground|organic|canned|cooked|extra virgin|unsweetened)\s+/, "");
    n = n.replace(/^(roasted|toasted|unsalted|salted|ground|organic|canned|cooked|gekochte[rsn]?|geröstete[rsn]?|ungesalzene[rsn]?)\s+/, "");
    n = n.replace(/\btype\s*\d*\b/g, " ").replace(/^(heiße[sr]?|kalte[sr]?|warme[sr]?|lauwarme[sr]?|eiskalte[sr]?|each|jeweils|je|a|an)\s+/, "").replace(/^(thumb-?size[d]?|small|large|big)?\s*(piece|knob|chunk|stück)s?\s+of\s+/, "").replace(/\s+/g, " ").trim();
    if (SINGULAR[n]) return SINGULAR[n];
    if (EN_DE[n]) return EN_DE[n];
    if (EN_NAMES[n] && lower(EN_NAMES[n].split("~")[0]) !== n) return normName(EN_NAMES[n].split("~")[0]);
    if (/nüsse$/.test(n)) return n.replace(/nüsse$/, "nuss");
    // einfache Pluralregel: Zwiebeln -> Zwiebel, Tomaten -> Tomate, Kartoffeln -> Kartoffel
    if (/(eln|ern|en)$/.test(n) && n.length > 5 && !/(weizen|samen|kuchen|boden|schinken|knochen|braten|rücken|haferflocken|gnocchi)$/.test(n)) {
      var base = n.slice(0, -1);
      if (/(el|er|e)$/.test(base)) return base;
    }
    return n;
  }

  function guessAisle(name) {
    var n = lower(name);
    for (var i = 0; i < AISLE_DICT.length; i++) {
      var hit = matchWithExceptions(n, AISLE_DICT[i][1], AISLE_DICT[i][0] === "Kühlregal" ? ["kokosmilch", "eisberg"] : null);
      if (hit) return AISLE_DICT[i][0];
    }
    return "Sonstiges";
  }

  // Gilt standardmäßig als vorhanden? (Grundvorrat mit Standard "ja" oder immer vorhanden)
  function isStaple(name) {
    var n = normName(name);
    if (ALWAYS.indexOf(n) !== -1 || /^(wasser|water|eiswürfel|ice)\b/.test(n)) return true;
    var k = vorratsSchluessel(n);
    if (!k) return false;
    var def = standardVorrat()[k];
    return !!(def && def.have);
  }

  /**
   * Zerlegt eine Zutatenzeile.
   * "200 g rote Linsen, gewaschen" -> {qty:200, unit:"g", name:"rote Linsen", note:"gewaschen"}
   * "Haferflocken 50g"            -> {qty:50, unit:"g", name:"Haferflocken"}
   */
  var SIZE_WORDS = /^(gehäufte?[rnms]?|gestrichene?[rnms]?|kleine?[rnms]?|große?[rnms]?|mittelgroße?[rnms]?|mittlere?[rnms]?|dicke?[rnms]?|dünne?[rnms]?|knappe?[rnms]?|gute?[rnms]?|heaped|heaping|level|large|small|medium|big|thick|thin|generous|scant|good)\s+/i;
  var TRAILING_NOTE = /\s+((?:zum|zur|für|zum servieren|für die deko|nach (?:geschmack|belieben)|to taste|to serve|for|optional|wenn gewünscht|if desired|plus (?:extra|more)|or more|as needed|if needed)\b.*)$/i;
  // Wörter, die allein keine Zutat sind ("frischer, gehackter Koriander")
  var ADJ_ONLY = /^(frisch|frische[rsn]?|gehackte?[rsn]?|geröstete?[rsn]?|getrocknete?[rsn]?|geriebene?[rsn]?|gemahlene?[rsn]?|gekochte?[rsn]?|kleine?[rsn]?|große?[rsn]?|reife?[rsn]?|fresh|chopped|toasted|roasted|dried|grated|ground|cooked|small|large|ripe|fein|grob|finely|roughly)$/i;

  // Zustand für Nährwerte: roh/trocken, gekocht, abgetropft (Konserve)
  function detectState(text, unit) {
    var t = lower(text);
    if (/(abgetropft|drained|abgespült|rinsed|aus der dose|\bdose\b|canned|tinned|konserve)/.test(t) || unit === "Dose" || unit === "Glas") return "abgetropft";
    if (/(gekocht|gegart|vorgekocht|cooked|precooked|pre-cooked|leftover|vom vortag|reste)/.test(t) && !/ungekocht|uncooked/.test(t)) return "gekocht";
    if (/(getrocknet|trocken|\bdry\b|\bdried\b|ungekocht|uncooked|\broh\b|\braw\b)/.test(t)) return "roh";
    return "";
  }

  // Englischen Zutatennamen übersetzen; null, wenn unbekannt (dann bleibt der Name unverändert)
  function translateIngredient(name) {
    var orig = clean(name);
    if (!orig || /[äöüß]/i.test(orig)) return null;
    var s = lower(orig).replace(/\(.*?\)/g, " ").replace(/[^a-z'&\s-]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return null;
    var notes = [], guard = 0, changed = true;
    function lookup(x) {
      if (EN_NAMES[x]) return EN_NAMES[x];
      if (/es$/.test(x) && EN_NAMES[x.slice(0, -2)]) return EN_NAMES[x.slice(0, -2)];
      if (/s$/.test(x) && EN_NAMES[x.slice(0, -1)]) return EN_NAMES[x.slice(0, -1)];
      if (EN_NAMES[x + "s"]) return EN_NAMES[x + "s"];
      return null;
    }
    var hit = lookup(s);
    while (!hit && changed && guard++ < 6) {
      changed = false;
      s = s.replace(/^(of|a|an|the|some)\s+/, "");
      for (var i = 0; i < EN_WORD_KEYS.length; i++) {
        var k = EN_WORD_KEYS[i];
        if (s.indexOf(k + " ") === 0) { notes.push(EN_WORDS[k]); s = s.slice(k.length + 1); changed = true; break; }
        if (s.length > k.length && s.slice(-(k.length + 1)) === " " + k) { notes.push(EN_WORDS[k]); s = s.slice(0, -(k.length + 1)); changed = true; break; }
      }
      hit = lookup(s);
    }
    if (!hit) return null;
    return { display: hit, notes: notes.filter(function (n) { return n !== "nativ extra"; }) };
  }
  function chooseDisplay(display, qty, unit) {
    var p = display.split("~");
    if (p.length === 2 && qty != null && qty <= 1 && (unit === "" || unit === "Stk")) return p[1];
    return p[0];
  }
  // Notiz Stück für Stück übersetzen; Unbekanntes bleibt stehen
  function translateNote(note) {
    if (!note || !/[a-z]/i.test(note)) return note;
    return note.split(/\s*([,;])\s*/).map(function (seg) {
      if (seg === "," || seg === ";") return seg;
      if (/[äöüß]/i.test(seg) || langOfText(seg) === "de") return seg;
      seg = seg.replace(/^for\s+(\d+(?:\s*[-–]\s*\d+)?)\s*(hours?|minutes?|mins?)\b/i, function (_, n, u) { return n + " " + (/^h/i.test(u) ? "Std." : "Min."); });
      var low = lower(seg).trim();
      if (!low) return seg;
      if (EN_WORDS[low]) return EN_WORDS[low];
      var alt = low.match(/^(?:or|oder)\s+(.+)$/);
      if (alt) { var t = translateIngredient(alt[1]); if (t) return "oder " + chooseDisplay(t.display); }
      var cup = low.match(/^([\d.,½¼¾⅓⅔\s]+)\s*cups?$/);
      if (cup) return clean(cup[1]) + (parseFloat(cup[1]) > 1 ? " Tassen" : " Tasse");
      var out = low, any = false;
      EN_WORD_KEYS.forEach(function (k) {
        var re = new RegExp("(^|\\s)" + escapeRe(k) + "(?=\\s|$)", "g");
        if (re.test(out)) { out = out.replace(re, "$1" + EN_WORDS[k]); any = true; }
      });
      if (!any) { var ti = translateIngredient(low); return ti ? chooseDisplay(ti.display) : seg; }
      return out.replace(/\band\b/g, "und").replace(/\bwith\b/g, "mit");
    }).join("").replace(/\s*,\s*/g, ", ").replace(/\s*;\s*/g, "; ");
  }

  /**
   * Zerlegt eine Zutatenzeile.
   * "200 g rote Linsen, gewaschen"   -> {qty:200, unit:"g", name:"Rote Linsen", note:"gewaschen"}
   * "Haferflocken 50g"              -> {qty:50, unit:"g", name:"Haferflocken"}
   * "2 gehäufte EL Tomatenmark"     -> {qty:2, unit:"EL", name:"Tomatenmark", note:"gehäufte"}
   * "200 g / 2 cups rolled oats"    -> {qty:200, unit:"g", name:"Rolled oats"}
   * "Saft von 1 Limette"            -> {qty:1, unit:"Stk", name:"Limettensaft"}
   */
  function parseIngredientLine(line) {
    var raw = clean(stripEmoji(String(line || "")).replace(BULLET_RE, ""));
    if (!raw) return null;
    var res = { raw: raw, qty: null, qtyMax: null, unit: "", name: "", note: "", optional: false };
    var note = [];
    if (/\b(optional|nach belieben|nach geschmack|to taste)\b/i.test(raw)) res.optional = /optional/i.test(raw);

    var rest = raw.replace(/^optional\s*:?\s*/i, "");
    // "etwas Öl", "some salt" – bewusst ohne Menge
    var vague = rest.match(/^(etwas|ein bisschen|ein paar|einige|wenig|some|a little|a few|few|a bit of|a handful of|eine handvoll|a squeeze of|squeeze of|a splash of|splash of|scheutje|snufje|beetje)\s+/i);
    if (vague) { note.push(vague[1].toLowerCase()); rest = rest.slice(vague[0].length); }
    // "Saft von 1 Zitrone", "juice of 2 limes", "Abrieb von 1 Zitrone", "juice and zest of 1 lemon"
    var juice = rest.match(/^(?:(\d+(?:[.,]\d+)?|½)\s+)?(saft und abrieb|abrieb und saft|juice and zest|zest and juice|saft|juice|abrieb|schale|zest|sap|rasp)\s+(?:von|of|van|einer|eines|aus)?\s*(\d+(?:[.,]\d+)?|½|¼|eine[rm]?|einer|a|an|one|half(?: a)?|1\/2|(?:einer\s+)?halben?)?\s*(?:bio[- ]|organic\s+)?(zitronen?|limetten?|orangen?|lemons?|limes?|oranges?|citroenen|citroen|limoenen|limoen|sinaasappel)\b/i);
    if (juice) {
      var both = /und|and/i.test(juice[2]);
      var isZest = !both && /abrieb|schale|zest|rasp/i.test(juice[2]);
      var fruit = /lim/i.test(juice[4]) ? "Limette" : /oran|sinaas/i.test(juice[4]) ? "Orange" : "Zitrone";
      var qw = juice[3] || juice[1];
      var n = qw ? (/half|1\/2|½|halbe/i.test(qw) ? 0.5 : (readQuantity(qw) || { value: 1 }).value) : 1;
      res.qty = n; res.unit = "Stk";
      res.name = both ? fruit : isZest ? fruit + "nschale" : (fruit === "Limette" ? "Limettensaft" : fruit === "Orange" ? "Orangensaft" : "Zitronensaft");
      res.note = clean((both ? "Saft und Abrieb, " : "") + rest.slice(juice[0].length).replace(/^[,\s]+/, "")).replace(/,\s*$/, "");
      if (/[a-z]/i.test(res.note)) res.note = translateNote(res.note);
      res.key = normName(res.name); res.aisle = guessAisle(res.name); res.staple = false; res.state = "";
      if (/\b(juice|zest|lemons?|limes?|oranges?)\b/i.test(juice[0])) { res.nameOriginal = juice[0]; res.lang = "en"; }
      return res;
    }

    var sz = !vague && rest.match(/^(small|large|big|medium|generous|kleine[rsn]?|große[rsn]?|gute[rsn]?)\s+(?=(glass|glasses|handful|handfuls|bunch|pinch|glug|splash|handvoll|glas|bund|prise|schuss|spritzer)\b)/i);
    if (sz) { note.push(translateNote(sz[1].toLowerCase())); rest = rest.slice(sz[0].length); }
    var q = vague ? null : readQuantity(rest);
    if (!q && !vague) { var lu = readUnit(rest); if (lu && /^(Prise|Handvoll|Bund|Spritzer|Schuss|Msp|Zehe|Dose|Glas|Becher|Pck|Stange|Zweig)$/.test(lu.unit)) q = { value: 1, max: null, rest: rest, fromWord: false }; }
    var u = null;
    if (q) {
      var afterQ = q.rest.replace(/^\s+/, "");
      // "2x 400g tins …", "2 x Zwiebeln"
      if (/^x\s*(?=[\dA-Za-zÄÖÜäöü(])/i.test(afterQ) && !q.fromWord) {
        afterQ = afterQ.replace(/^x\s*/i, "");
        var per = afterQ.match(/^(\d+(?:[.,]\d+)?)\s*(g|ml)\s+(?!(cans?|tins?|jars?|dosen?|gläser|glas|packs?|packungen?|pck)\b)/i);
        if (per) { q.value = q.value * parseFloat(per[1].replace(",", ".")); afterQ = per[2] + " " + afterQ.slice(per[0].length); }
      }
      var size = afterQ.match(SIZE_WORDS);
      if (size) { note.push(size[1].toLowerCase()); afterQ = afterQ.slice(size[0].length); }
      // Packungsgröße vor der Einheit: "1 540ml can beans", "2 (400 g) Dosen Tomaten"
      var can = afterQ.match(/^\(?\s*(\d+(?:[.,]\d+)?)\s*(ml|g|oz)\s*\)?\s+(?=(cans?|tins?|jars?|dosen?|gläser|glas|packs?|packungen?|pck)\b)/i);
      if (can) { note.push(can[1] + " " + can[2].toLowerCase()); afterQ = afterQ.slice(can[0].length); }
      u = readUnit(afterQ);
      // Zahlwort ohne Einheit nur akzeptieren, wenn danach ein Nomen folgt ("zwei Zwiebeln")
      if (q.fromWord && !u && !/^\s*[A-ZÄÖÜ]/.test(afterQ)) q = null;
      else q.rest = afterQ;
    }
    if (q) {
      res.qty = q.value; res.qtyMax = q.max;
      rest = u ? u.rest : q.rest;
      if (u) res.unit = u.unit;
      // Zweite Mengenangabe entfernen: "200 g / 2 cups oats", "360 ml/ 1½ cups milk", "250 g (2 Tassen)"
      rest = rest.replace(/^\s*\/?\s*(?:\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(?:\s*(?:\d+\/\d+|[½¼¾⅓⅔]))?\s*(?:[-–]\s*\d+(?:[.,]\d+)?\s*)?(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|tassen?|el|tl|g|ml)\b\.?/i, function (m) { note.push(clean(m.replace(/^\s*\//, ""))); return ""; });
      rest = rest.replace(/^\s*\/\s*/, "");
    } else if (!vague) {
      // Menge am Ende: "Haferflocken 50g", "Milch: 200 ml", "Salz – 1 Prise"
      var m = raw.match(/^(.*?[A-Za-zÄÖÜäöüß)])\s*[:\-–—,]?\s*((?:ca\.?\s*)?\d+(?:[.,]\d+)?(?:\s*(?:-|–|bis)\s*\d+(?:[.,]\d+)?)?|[½¼¾])\s*([A-Za-zäöüÄÖÜ.]*)\s*$/);
      if (m) {
        var q2 = readQuantity(m[2]);
        var u2 = m[3] ? readUnit(m[3]) : null;
        if (q2 && (u2 || !m[3])) {
          res.qty = q2.value; res.qtyMax = q2.max;
          if (u2) res.unit = u2.unit;
          rest = m[1];
        }
      }
    }
    rest = clean(rest).replace(/^(?:von|vom|of|an|a|the|piece of|pieces of|thumb-?size(?:d)? piece of|knob of)\s+/i, "");
    rest = clean(rest.replace(/^(?:von|of)\s+/i, ""));
    var size2 = rest.match(SIZE_WORDS);
    if (size2) { note.push(size2[1].toLowerCase()); rest = rest.slice(size2[0].length); }
    // "Kopf Wirsing", "Stange Lauch" ohne Einheit davor
    var head = rest.match(/^(kopf|köpfe|stange|stangen|knolle|bund|zehen?|dose|dosen|glas|packung|pck\.?)\s+/i);
    if (head && !res.unit) { var hu = readUnit(head[1]); res.unit = hu ? hu.unit : (/kopf|köpfe/i.test(head[1]) ? "Stk" : /knolle/i.test(head[1]) ? "Stk" : ""); rest = rest.slice(head[0].length); }

    // Notiz abtrennen: Klammern, Anhängsel ("zum Anbraten"), nach Komma
    rest = rest.replace(/\(([^)]*)\)/g, function (_, inner) { note.push(clean(inner)); return " "; });
    rest = clean(rest).replace(TRAILING_NOTE, function (_, n) { note.push(clean(n)); return ""; });
    var comma = rest.indexOf(",");
    if (comma > 1) {
      var before = clean(rest.slice(0, comma)), after = clean(rest.slice(comma + 1));
      // "frischer, gehackter Koriander": Adjektiv vor dem Komma gehört zum Namen dahinter
      if (ADJ_ONLY.test(before) && after) {
        var a2 = after.split(/\s*,\s*/); var nm = a2.shift();
        note.push(before.toLowerCase()); rest = nm.replace(/^(gehackte?[rsn]?|geriebene?[rsn]?|chopped|grated)\s+/i, function (m) { note.push(clean(m).toLowerCase()); return ""; });
        if (a2.length) note.push(a2.join(", "));
      } else { note.push(after); rest = before; }
    }
    // Alternativen: "Oats or spelt flakes", "Ahornsirup oder Honig" -> erste Wahl
    var alt = rest.match(/^(.{3,}?)\s+(?:oder|or|\/)\s+(.+)$/i);
    if (alt && ADJ_ONLY.test(clean(alt[1])) && alt[2].split(/\s+/).length >= 2) {
      // "frische oder gefrorene Mango" -> Mango (frische oder gefrorene)
      var w2 = alt[2].split(/\s+/); var noun = w2.pop();
      note.push(clean(alt[1]).toLowerCase() + " oder " + w2.join(" ")); rest = noun;
    } else if (alt && !/^(salz|salt)\b/i.test(alt[1])) { note.push("oder " + clean(alt[2])); rest = alt[1]; }
    res.name = clean(rest.replace(/[.:;,]+$/, "")).replace(/^[a-zäöü]/, function (c) { return c.toUpperCase(); });
    res.note = note.filter(Boolean).join(", ");
    res.state = detectState(res.name + " " + res.note, res.unit);

    // Englisch -> Deutsch: Name und Notiz direkt übersetzen, Original unsichtbar behalten
    var tr = translateIngredient(res.name);
    if (tr) {
      res.nameOriginal = res.name; res.lang = "en";
      res.name = chooseDisplay(tr.display, res.qty, res.unit);
      if (tr.notes.length) res.note = tr.notes.concat(res.note ? [res.note] : []).join(", ");
    }
    if (res.note && /[a-z]/i.test(res.note)) res.note = translateNote(res.note);
    if (/^Knoblauchzehen?$/.test(res.name) && res.unit === "Zehe") res.name = "Knoblauch";

    // Angloamerikanische Einheiten umrechnen, Original in der Notiz behalten
    if (res.qty != null && UNIT_CONVERT[res.unit]) {
      var c = UNIT_CONVERT[res.unit];
      var orig = res.unit === "cup" ? fmtQty(res.qty) + (res.qty > 1 ? " Tassen" : " Tasse") : fmtQty(res.qty) + " " + res.unit;
      var factor = c.f, unit = c.unit;
      if (res.unit === "cup") {
        var ln = lower(res.name);
        for (var g = 0; g < CUP_GRAMS.length; g++) {
          if (CUP_GRAMS[g][0].test(ln) && !/(milk|milch|oil|öl|water|wasser|juice|saft|broth|brühe|cream$|sahne|drink|creme|sauce|passierte)/.test(ln)) {
            factor = CUP_GRAMS[g][1]; unit = "g"; break;
          }
        }
      }
      res.qty = roundSensible(res.qty * factor);
      if (res.qtyMax != null) res.qtyMax = roundSensible(res.qtyMax * factor);
      res.unit = unit;
      res.note = res.note ? res.note + "; " + orig : orig;
    }
    if (!res.name || res.name.length < 2) return null;
    if (/^(fett|fat|kohlenhydrate|kh|carbs?|kalorien|kcal|calories|ballaststoffe|fibre|fiber|zucker gesamt|das rezept|rezept|toppings?|optional|deko|garnitur|makros?|nährwerte|step by step|zum servieren|to serve)$/i.test(res.name)) return null;
    if (/^(protein|eiweiß|eiweiss)$/i.test(res.name) && res.unit === "g") return null;
    if (res.unit === "g" && /^((plant-based|pflanzliche[sn]?|vegane[sn]?)\s+)?(protein|eiweiß|eiweiss|fibre|fiber|ballaststoffe|carbs|kohlenhydrate|fett|fat|zucker gesamt)\b/i.test(res.nameOriginal || res.name)) return null;
    if (res.name.length > 25 && /\b(minuten|minutes|köcheln|lassen|anbraten|bis|until|stir|cook for|bake for)\b/i.test(res.name)) return null;
    if (!res.unit && /^(minuten|minute|min|stunden?|std|sekunden|minutes?|hours?|grad|°)\b/i.test(res.name)) return null;
    if (/^[:\-–]/.test(res.name) || /^(vermischen|verrühren|genießen|servieren|fertig|enjoy|done|else|everything else|alles andere|so machst du es|so geht's)$/i.test(res.name.replace(/:$/, ""))) return null;
    if (ADJ_ONLY.test(res.name) || /^(fein|grob) gehackt$/i.test(res.name)) return null;
    if (isStepLike(res.raw) && !res.unit) return null;
    // Arbeitsschritt statt Zutat: "ablöschen.", "EINRÜHREN", "In Öl anbraten", "Über Nacht einfrieren"
    if (res.qty == null && !res.unit) {
      var rw = res.raw.replace(/^[-–•*\s]+/, "").replace(/[.!:]+$/, "").split(/\s+/), lw = rw[rw.length - 1] || "";
      var verbish = /(en|ern|eln)$/i.test(lw) && (DE_VERBS.test(lw) || STEP_VERBS.test(lw) || /^[a-zäöü]/.test(lw) || (lw === lw.toUpperCase() && lw.length > 3));
      if (verbish && !/\b(zum|zur|für|for|to|nach|zum)\b/i.test(res.raw) && !/^(bohnen|linsen|nudeln|zwiebeln|kartoffeln|möhren|karotten|tomaten|oliven|erbsen|beeren|haferflocken|samen|kernen|nüssen|chiliflocken|flocken|zucchinen?|auberginen|paprikaschoten)$/i.test(lw)) return null;
    }
    if (/^(enjoy|etwas|außerdem|ausserdem|sonst|sonstiges|teil \d+|bereiding|voor erbij|ingrediënten|crispy|hand|beutel|saft|süße|sirup|gesalzene|helle|rote|dinkel-|holz-|agaven-|crunch\b.*)$/i.test(res.name.replace(/[!.:]+$/, "")) || /\b(rezepte|recipes)\b/i.test(res.name)) return null;
    if (res.qty == null && res.name.split(/\s+/).length >= 4 && /^(ich|du|ihr|wir|das ist|es ist|dieses?|this|it|i|we|you)\b/i.test(res.name)) return null;
    res.key = normName(res.name);
    res.aisle = guessAisle(res.name + " " + res.key);
    res.staple = isStaple(res.name);
    return res;
  }

  function roundSensible(n) {
    if (n >= 100) return Math.round(n / 5) * 5;
    if (n >= 10) return Math.round(n);
    return round(n, 1);
  }

  // Sieht eine Zeile wie ein Arbeitsschritt aus? ("Den Salat geben und alles gut vermengen")
  var STEP_VERBS = /\b(vermisch|vermeng|verrühr|unterrühr|unterheb|hineingeben|dazugeben|zugeben|gebt|gib|köcheln|anbraten|anbräun|schneid|hinzufüg|umrühr|rühr|servier|abschmeck|pürier|aufkoch|ziehen lassen|backen lassen)\w*|\b(?:mix|add|stir|cook|bake|place|serve|combine|pour|blend|heat|simmer|toss|whisk|fold|drizzle|sprinkle|transfer|bring|until)(?:es|s|ing)?\b|\bgeben\b|\bvermische\b|\blassen\b|\bbis (?:es|sie|alles|die|der|das)\b/i;
  function isStepLike(line) {
    var l = clean(stripEmoji(String(line || "")).replace(BULLET_RE, ""));
    var words = l.split(/\s+/).length;
    if (words < 3) return false;
    if (/\b(zum|zur|for)\s+[a-zäöü]/i.test(l) && words < 7) return false; // "Öl zum Anbraten"
    return STEP_VERBS.test(l) && (words >= 4 || /[.!]$/.test(l));
  }

  // Sieht eine Zeile wie eine Zutat aus? (für Captions ohne Überschriften)
  function looksLikeIngredient(line) {
    var l = clean(stripEmoji(line).replace(BULLET_RE, ""));
    if (!l || l.length > 90) return false;
    if (/^\d+\s*[.)]\s+\S/.test(l) && l.length > 45) return false; // nummerierter Schritt
    var q = readQuantity(l);
    if (q && !q.fromWord) {
      var u = readUnit(q.rest);
      if (u) return true;
      // "2 Zwiebeln" – Zahl + großgeschriebenes Nomen, kurz
      if (/^\s*[A-ZÄÖÜ][a-zäöüß]/.test(q.rest) && l.length < 50) return true;
      if (/^\s*[a-z]/.test(q.rest) && l.length < 40 && !/^\s*(min|minuten|std|grad|°)/i.test(q.rest)) return true;
    }
    if (q && q.fromWord && readUnit(q.rest)) return true;
    // Menge am Ende: "Haferflocken 50g", "Zimt 1 Prise", "Banane 1"
    var m = l.match(/^(.*[A-Za-zäöüß)])\s*[:\-–]?\s*(\d+(?:[.,]\d+)?|[½¼¾])\s*([A-Za-zäöüÄÖÜ]*)\.?$/);
    if (m && m[1].length <= 40) {
      if (m[3] ? readUnit(m[3]) : (l.length < 30 && /^[A-ZÄÖÜ]/.test(m[1]))) return true;
    }
    return false;
  }

  // Emojis trennen in Captions oft Abschnitte ("Overnight Oats 🥣 Haferflocken 50g").
  // Zeile nur aufteilen, wenn danach etwas wie eine Zutat folgt.
  var EMOJI_SPLIT = /\s*(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}][\u{FE0F}\u{200D}]?)+\s*/u;
  function splitOnEmoji(line) {
    var parts = line.split(EMOJI_SPLIT).map(clean).filter(Boolean);
    if (parts.length < 2) return [line];
    return parts.slice(1).some(looksLikeIngredient) ? parts : [line];
  }

  // Lange Absätze in Sätze teilen (nicht bei "ca. 400" oder "1. Schritt")
  function splitSentences(line) {
    if (clean(line).length < 60) return [line];
    return line.split(/(?<=[a-zäöüß)\]][.!?])\s+(?=[A-ZÄÖÜ])/);
  }

  // ---------------------------------------------------------------------------
  // Caption / Freitext
  // ---------------------------------------------------------------------------

  var HEAD_ING = /^(?:\W*)(zutaten|ingredients|du brauchst|ihr braucht|you need|you['’]?ll need|what you['’]?ll need|what you need|was du brauchst|was ihr braucht|was brauchen wir|was wir brauchen|das brauchst du|benötigt|einkaufsliste|für (?:den|die|das) [a-zäöüß]+\s*:?$)/i;
  var HEAD_STEP = /^(?:\W*)(zubereitung|anleitung|so geht['’`]?s|so wird['’`]?s gemacht|instructions|method|directions|steps|how to make|preparation|schritte|vorgehen)/i;
  // Zeilen, die weder Zutat noch Schritt sind
  var NOISE = /^(werbung|anzeige|unbezahlt|unbeauftragt|ad\b|sponsored|in kooperation|makros|macros|nährwerte|naehrwerte|nutrition|kcal|kalorien|speichern|save this|full recipe|ganzes rezept|das ganze rezept|rezept auf meinem blog|link in (my|meiner) bio|folge mir|follow me|follow for|teile (diesen|das|den) (post|beitrag|reel|rezept)|share this|link in bio|rezept in der bio)/i;

  function splitLines(text) {
    var t = String(text || "").replace(/\r/g, "");
    // Einzeilige Captions mit Trennzeichen aufbrechen
    t = t.replace(/\s+[•·▪◦]\s+/g, "\n• ");
    // Zahlen-Emojis als Aufzählung ("1️⃣ Ofen vorheizen")
    t = t.replace(/([0-9])️?⃣/g, "\n$1. ");
    return t.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function isHashtagLine(l) {
    var tokens = l.split(/\s+/);
    var tags = tokens.filter(function (t) { return /^[#@]/.test(t); }).length;
    return tokens.length > 0 && tags / tokens.length >= 0.6;
  }

  function extractUrls(text) {
    var out = [];
    String(text || "").replace(/\b((?:https?:\/\/|www\.)[^\s<>"')]+)/gi, function (m) {
      var u = m.replace(/[.,;:!?]+$/, "");
      if (!/^https?:/i.test(u)) u = "https://" + u;
      if (!/instagram\.com|instagr\.am/i.test(u)) out.push(u);
      return m;
    });
    return out;
  }

  var PIECE_WORDS = "stück|stk|pieces|cookies|kekse|muffins|cupcakes|riegel|bars|balls|bällchen|kugeln|scheiben|slices|brötchen|rolls|buns|zimtschnecken|waffeln|pancakes|pfannkuchen|tacos|wraps|burger|patties|bratlinge|frikadellen|energy balls|bites|donuts|brownies|törtchen";
  // Portionen bzw. Stückzahl aus dem Text: {n, stueck}
  function findServingsInfo(text) {
    var t = String(text);
    var m = t.match(new RegExp("(?:für|for|serves|makes|ergibt|reicht für|portionen?:|servings?:|yield:?|yields)\\s*(?:ca\\.?\\s*|about\\s*|approx\\.?\\s*)?(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?\\s*(portionen|personen|pers\\.?|servings|people|portion|" + PIECE_WORDS + "|bowls?)?\\b(?!\\s*(?:[-–]\\s*\\d|[.,]\\d|min|minuten|minutes|mins|grad|°|g\\b|ml\\b|hours?|stunden?|std|h\\b|tage?|days?|weeks?|wochen|sek|sec|tbsp|tsp|cups?|el\\b|tl\\b|cm|mm|x\\b))", "i"));
    if (m) return { n: +m[1], stueck: !!m[2] && new RegExp("^(" + PIECE_WORDS + ")$", "i").test(m[2]) };
    m = t.match(/(\d{1,2})\s*(portionen|personen|servings|portion)\b/i);
    if (m) return { n: +m[1], stueck: false };
    m = t.match(new RegExp("\\((\\d{1,2})\\s*(" + PIECE_WORDS + ")\\)", "i")) || t.match(new RegExp("\\b(\\d{1,2})\\s+(?:kleine |große |small |large |mini )?(" + PIECE_WORDS + ")\\b(?!\\s*(?:aus|of|from))", "i"));
    return m && +m[1] >= 2 ? { n: +m[1], stueck: true } : null;
  }
  function findServings(text) { var i = findServingsInfo(text); return i ? i.n : null; }

  // Backform -> typische Stückzahl (Nutzer-Regeln B2)
  var BAKING_FORMS = [
    [/(backblech|blech\b|blechkuchen|sheet pan|baking tray|baking sheet|traybake)/i, 20, "Stück", "Backblech"],
    [/(springform|tarteform|tart pan|tart tin|springform pan|cake tin|tortenform|\b2[2-8]\s?cm\b)/i, 12, "Stück", "Springform"],
    [/(kastenform|loaf pan|loaf tin|brotform)/i, 12, "Scheiben", "Kastenform"],
    [/(muffinblech|muffinform|muffin tin|muffin pan|cupcake)/i, 12, "Stück", "Muffinblech"],
    [/(brownie.?form|20\s?x\s?20|8\s?x\s?8|square pan|quadratische form)/i, 9, "Stück", "Brownie-Form"],
    [/(auflaufform|casserole|baking dish|ofenform)/i, 4, "Portionen", "Auflaufform"]
  ];
  function findBakingForm(text) {
    for (var i = 0; i < BAKING_FORMS.length; i++) if (BAKING_FORMS[i][0].test(text)) return { n: BAKING_FORMS[i][1], unit: BAKING_FORMS[i][2], form: BAKING_FORMS[i][3] };
    return null;
  }

  // Nährwerte, die der Creator selbst angibt ("610 kcal | 48 g Protein")
  function findDeclaredNutrition(text) {
    var t = String(text);
    var kcal = t.match(/(\d{2,4})\s*(?:kcal|kalorien|calories|cal)\b/i);
    if (!kcal) return null;
    var g = function (re) { var m = t.match(re); return m ? parseFloat(m[1].replace(",", ".")) : null; };
    return {
      kcal: +kcal[1],
      protein: g(/(\d+(?:[.,]\d+)?)\s*g\s*(?:protein|eiweiß|eiweiss|p\b)/i) || g(/(?:protein|eiweiß|eiweiss)\s*:?\s*(\d+(?:[.,]\d+)?)\s*g/i) || g(/\b[EP]\s*:\s*(\d+(?:[.,]\d+)?)\s*g/),
      carbs: g(/(\d+(?:[.,]\d+)?)\s*g\s*(?:kh|kohlenhydrate|carbs?)/i) || g(/(?:kh|kohlenhydrate|carbs?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*g/i) || g(/\b(?:K|KH|C)\s*:\s*(\d+(?:[.,]\d+)?)\s*g/),
      fat: g(/(\d+(?:[.,]\d+)?)\s*g\s*(?:fett|fat)/i) || g(/(?:fett|fat)\s*:?\s*(\d+(?:[.,]\d+)?)\s*g/i) || g(/\bF\s*:\s*(\d+(?:[.,]\d+)?)\s*g/),
      fiber: g(/(\d+(?:[.,]\d+)?)\s*g\s*(?:ballaststoffe|fiber|fibre)/i),
      perServing: true, basis: "laut Creator"
    };
  }

  function findTimes(text) {
    var t = String(text);
    var res = { total: null, prep: null, cook: null, explicit: false };
    var lab = function (re) { var m = t.match(re); return m ? parseDuration(m[1]) : null; };
    // Dauer muss mit einer Zahl beginnen (sonst passt der leere String)
    var dur = "((?=\\d)(?:\\d+(?:[.,]\\d+)?\\s*(?:std\\.?|stunden?|h|hrs?|hours?)\\b\\s*(?:und|and|,)?\\s*)?(?:\\d+\\s*(?:min\\.?|minuten|mins?|minutes?)(?![a-zäöü]))?|\\d+(?:[.,]\\d+)?\\s*(?:std\\.?|stunden?|h|hours?)\\b)";
    var pre = "(?:^|[^a-zäöüß])";
    res.total = lab(new RegExp(pre + "(?:gesamtzeit|gesamt|total time|total|insgesamt|dauer|zeit|time|fertig in|ready in|in nur|in)\\s*:?\\s*(?:ca\\.?\\s*)?" + dur, "i"));
    res.prep = lab(new RegExp(pre + "(?:zubereitungszeit|vorbereitung|vorbereitungszeit|arbeitszeit|prep time|prep)\\s*:?\\s*(?:ca\\.?\\s*)?" + dur, "i"));
    res.cook = lab(new RegExp(pre + "(?:kochzeit|backzeit|garzeit|cook time|bake time|cooking time)\\s*:?\\s*(?:ca\\.?\\s*)?" + dur, "i"));
    if (!res.total && /⏱|⏰|🕐|⌚/.test(t)) {
      var m = t.match(/(?:⏱|⏰|🕐|⌚)️?\s*:?\s*(\d+(?:\s*(?:min|minuten|std|h)\.?))/i);
      if (m) res.total = parseDuration(m[1]);
    }
    if (!res.total && res.prep && res.cook) res.total = res.prep + res.cook;
    if (!res.total && (res.prep || res.cook)) res.total = res.prep || res.cook;
    res.explicit = !!res.total;
    return res;
  }

  // Grobe Zeitschätzung aus Schritten ("25 Minuten backen")
  function estimateTimeFromSteps(steps) {
    var sum = 0;
    steps.forEach(function (s) {
      var m = String(s).match(/(\d+)\s*(?:-|–|bis)?\s*(\d+)?\s*(min|minuten|minutes|mins)\b/i);
      if (m) sum += +(m[2] || m[1]);
      var h = String(s).match(/(\d+(?:[.,]\d+)?)\s*(std|stunden?|hours?|h)\b/i);
      if (h) sum += parseFloat(h[1].replace(",", ".")) * 60;
    });
    if (!sum) return null;
    return Math.round(sum + Math.max(5, steps.length * 2)); // plus Schnippelzeit
  }

  var TITLE_BAD = /^(https?:|www\.|\(?\s*(?:recipe|rezept)\b|comment|kommentier|i'?m curious|follow|.*\bi used\b|.*:\s*\d+$|rezept|zum rezept|das rezept|recipe|portionen|servings|perfekt (für|zum)|schnell gemacht|kann kochen|comment|kommentier|werbung|anzeige|unbezahlt|gewinnspiel|ad\b|follow|folge|save|speicher|teil \d|part \d|step by step|veganuary|must try|naja|glaubst|aufmerksam|mit den produkten|mit \w+ so |etwas |some |& so|und so|schwierigkeit|zubereitungszeit|dauer|what you need|was brauchen|[\d\s\/]+$)|\b(gewinnspiel|anzeige)\b|^[^(]*\)|^[\wäöüÄÖÜß-]+:\s/i;
  var TITLE_SENTENCE = /^(ich|du|ihr|wir|er|sie|es|man|dieser|diese|dieses|der|die|das|wenn|als|falls|endlich|heute|hier|hört|habt|kennt|ein|eine|i|i'm|we|you|this|these|if|when|my|our|the|so|und|aber|oder|davon|durch|kombiniert|probier|teste|a fun|what a)\b/i;
  var FOOD_HINT = /(pasta|nudel|salat|salad|suppe|soup|curry|bowl|kuchen|cake|brot|bread|tofu|bohnen|beans|linsen|gnocchi|lasagn|porridge|oats|smoothie|latte|sauce|soße|dip|pesto|pfanne|auflauf|steak|burger|pizza|tortilla|quesadilla|wrap|cookies|kekse|muffin|brownie|risotto|eintopf|gulasch|chili|noodle|udon|ramen|rolls|focaccia|naan|toast|pancake|pfannkuchen|waffel|eis\b|ice cream|tiramisu|cheesecake|hummus|falafel|bratling|schnitzel|frikadell|spieße|manti|maultasch|zimtschnecke|schnecken|stew|pot pie|\bpie\b|schmortopf|knödel|spiesjes|moqueca|fufu|\bdal\b|shawarma|kofta|katsu|tarte|quiche|gratin|omelett|shakshuka|bolognese|carbonara|spaghetti|orzo|couscous|bulgur|quinoa|wedges|nuggets|dumplings|teigtaschen|sushi|poke|granola|müsli|pudding|mousse|crumble|riegel|strudel|brötchen|teewurst|aufstrich|chutney|kichererbsen|chickpeas|auberginen|kofta|steaks?|bowls?|porridge|tacos|burrito|enchilada|lasagne|wraps?|sandwich|bagel|gemüse|ofengemüse)/i;

  function cleanTitle(t) {
    t = clean(stripEmoji(t).replace(/[#@][^\s]+/g, " ").replace(/\*+/g, " "));
    t = t.replace(/^\(?\s*(werbung|anzeige|ad|unbezahlte werbung)\s*[\/|]?\s*(ad)?\s*\)?\s*[:\-–|]?\s*/i, "");
    t = t.replace(/^(rezept|recipe)\s*:\s*/i, "").replace(/^(meine?|my)\s+(liebling[s-]*|favou?rite)\s*/i, "");
    // "15min tomato-chickpeas", "190g Protein Süßkartoffel-Salat", "Ep. 2: …", "Diese Gnocchi"
    t = t.replace(/^\d+\s*(?:-\s*)?(?:min(?:ute)?s?|minuten|min\.)\s+/i, "").replace(/^\d+\s*g\s+(?:protein|eiweiß|eiweiss)\s+/i, "");
    t = t.replace(/^(?:ep(?:isode)?\.?|folge|teil|part|day|tag)\s*\d+\s*[:.\-–]\s*/i, "");
    t = t.replace(/^(?:diese[rs]?|this|these)\s+(?=[A-ZÄÖÜ])/i, "");
    // Serienzusätze: "Veganuary Nr. 24", "Tag 6/10", "auf die 1", "Ep 4"
    t = t.replace(/\s+(?:veganuary\s*)?(?:nr|no|tag|day|ep|teil|part)\.?\s*\d+(?:\s*\/\s*\d+)?\b.*$/i, "").replace(/\s+auf (?:die|platz) \d+.*$/i, "");
    t = t.replace(/^(?:best|beste[rs]?|the best|favou?rite)\s+(?=\S+\s*$)/i, "");
    // "(3-4 servings, 1h prep time):" am Ende entfernen
    t = t.replace(/\s*\((?:[^)]*\b(?:servings?|portionen|personen|prep|min|stück)\b[^)]*)\)?\s*:?\s*$/i, "");
    // nicht geschlossene Klammer am Ende ("Sushi Rolls (")
    var open = t.lastIndexOf("("); if (open > 0 && t.indexOf(")", open) === -1) t = t.slice(0, open);
    t = clean(t.split(/\s[|–—]\s|[!?](?:\s|$)|\.\s/)[0]).replace(/[:.,!;\-–]+$/, "");
    // REINE GROSSBUCHSTABEN lesbar machen
    if (t.length > 3 && t === t.toUpperCase() && /[A-ZÄÖÜ]{3}/.test(t)) {
      t = t.toLowerCase().replace(/(^|[\s\-„"(\/+])([a-zäöüß])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }
    return t.replace(/^[a-zäöü]/, function (c) { return c.toUpperCase(); });
  }

  var GROUP_MARK = "\u0001G:";
  // "Für das Dressing:" -> "Dressing", "MISO SAUCE" -> "Miso-Sauce"
  function groupName(t) {
    var g = clean(stripEmoji(String(t))).replace(/:\s*$/, "").replace(/^\W*(?:zutaten\s+)?(?:für|for)\s+(?:den|die|das|the)?\s*/i, "").replace(/^zutaten\s*/i, "");
    if (g === g.toUpperCase()) g = g.toLowerCase();
    return g.replace(/^./, function (c) { return c.toUpperCase(); });
  }
  var SUBHEAD_WORD = /^(?:(?:für (?:das|den|die)|for the)\s+)?(dressing|sauce|soße|sosse|marinade|topping|toppings|teig|füllung|glasur|glaze|creme|frosting|crust|filling|dough|beilage|chutney|kräuteröl|streusel|boden|base|garnish|garnitur)$/i;
  function titleFrom(lines) {
    var cands = [];
    for (var i = 0; i < lines.length && i < 8; i++) {
      var plainLine = clean(stripEmoji(lines[i]));
      if (HEAD_ING.test(plainLine) && plainLine.length < 60) break; // ab der Zutatenliste kein Titel mehr
      // Serie "FAVORITE SAUCE NR. 5" + nächste Zeile "Amba" = Gerichtsname
      if (/\b(nr|no)\.?\s*\d+/i.test(plainLine) && lines[i + 1]) {
        var nx = clean(stripEmoji(lines[i + 1]));
        if (nx && nx.split(/\s+/).length <= 4 && !/\d/.test(nx) && !/[.!?:]$/.test(nx)) cands.push({ t: cleanTitle(nx), score: 25 });
      }
      var segs = lines[i].split(EMOJI_SPLIT).map(clean).filter(function (s) { return s.length >= 3; });
      var fullLine = clean(stripEmoji(lines[i]));
      if (segs.length > 1 && (/\(/.test(lines[i]) || (fullLine.length <= 60 && !TITLE_SENTENCE.test(fullLine) && !/[.!?]/.test(fullLine)))) segs.unshift(fullLine);
      if (/^[^:]{2,40}:\s*$/.test(fullLine) && i > 0) continue; // Unterüberschrift "Sauce:"
      for (var j = 0; j < segs.length && j < 4; j++) {
        var raw = clean(stripEmoji(segs[j]).replace(/[#@][^\s]+/g, " "));
        if (!raw || HEAD_ING.test(raw) || HEAD_STEP.test(raw) || looksLikeIngredient(raw) || /^[-–•*]/.test(raw)) continue;
        if (j > 0 && /^[a-zäöü]/.test(raw) && raw !== fullLine) continue; // Satzfortsetzung nach Emoji
        if (/^\(/.test(raw) && !/\)\s*\S/.test(raw)) continue; // "(Noch schneller geht's …)"
        var colon = raw.match(/^([^:]{2,40}):\s*(.{3,})$/);
        if (colon && hasFoodWord(colon[2]) && !hasFoodWord(colon[1])) raw = colon[2];
        var t = cleanTitle(raw);
        // Satz ("Der gesündeste Apfelkuchen der Welt …", "This super easy Vegan Pot Pie is …"): nur den Gerichtsnamen nehmen
        var fromSentence = 0;
        if (TITLE_SENTENCE.test(clean(stripEmoji(raw)))) { t = hasFoodWord(raw) ? dishPhrase(raw) : ""; if (!t) continue; fromSentence = dishPhrase.strength <= 2 ? -1 : -6; }
        // "Curry ist einfach, cremig …" -> "Curry"
        t = t.replace(/\s+(ist|sind|schmeckt|schmecken|kombiniert|könnte|wird|macht|machen|bringt|gibt|isn['’]t|is|are|tastes|makes)\b.*$/i, "");
        var tw = t.split(/\s+/); while (tw.length > 1 && TITLE_STOP.test(tw[0])) tw.shift(); t = tw.join(" ");
        if (t.split(/\s+/).length > 6) t = t.split(/\s+(?:with|mit)\s+/)[0];
        if (t.length < 3 || TITLE_BAD.test(t) || NOISE.test(t) || /^\d/.test(t) || readUnit(t) || /\b(rezept|recipe|rezepte|recipes)\b/i.test(t)) continue;
        var words = t.split(/\s+/).length, food = hasFoodWord(t);
        if (!food && (TITLE_SENTENCE.test(t) || words >= 7 || /[!?]/.test(raw) || words >= 4 && /^[A-ZÄÖÜ]/.test(t) && t !== t.toUpperCase() && /\s[a-zäöü]/.test(t) && langOfText(t) === "de")) continue;
        if (EN_IMP.test(t) || (isStepLike(t) && !food)) continue;
        if (words === 1 && !food && i > 0) continue;
        if (/\b(kannst|könnt|musst|möchtest|wirst|werdet)\b/i.test(t)) continue;
        var score = 10 - i * 1.2 - j;
        if (t.length <= 45) score += 3; else if (t.length > 70) score -= 4;
        if (food) score += 4;
        if (TITLE_SENTENCE.test(t)) score -= 5;
        score += fromSentence;
        if (GENERIC_TITLE.test(t)) score -= 3;
        if (raw === raw.toUpperCase() && /[A-ZÄÖÜ]{3}/.test(raw)) score += 2;
        cands.push({ t: t, score: score });
      }
    }
    cands.sort(function (a, b) { return b.score - a.score; });
    var best = cands[0];
    if (!best || best.score < 4) return "";
    var t = best.t;
    // Satz-Titel ("Tofu isn't here to imitate anything", "Meet my new favorite soup: Easy Thai Coconut Soup")
    if (t.split(/\s+/).length >= 8 || /[,:]|\/\/|\s\|\s/.test(t) || TITLE_SENTENCE.test(t)) {
      var parts = t.split(/\s*(?::|\/\/|\||,|\s[-–—]\s)\s*/).filter(function (x) { return x !== t && hasFoodWord(x) && x.split(/\s+/).length <= 7 && !TITLE_SENTENCE.test(x) && /^[A-ZÄÖÜ\d]/.test(x) && !/\b(kannst|könnt|musst|verwenden|use)\b/i.test(x) && !/^(meet|comment|recipe|rezept)\b/i.test(x); }).map(cleanTitle).filter(function (x) { return x.length >= 3; });
      if (parts.length) t = parts[0];
      else {
        var dpAll = dishPhrase(lines.join("\n")), dp = dishPhrase(t);
        t = (dpAll && dpAll.split(/\s+/).length >= 2 ? dpAll : dp) || (TITLE_SENTENCE.test(t) || t.split(/\s+/).length >= 6 ? "" : t);
      }
    }
    return t.length > 70 ? t.slice(0, 67).replace(/\s\S*$/, "") + "…" : t;
  }

  var FOOD_LIST = FOOD_HINT.source.replace(/^\(|\)$/g, "").replace(/\\b/g, "").split("|").filter(function (h) { return h.indexOf(" ") === -1 && h.indexOf("?") === -1; });
  // Ist ein Wort ein Gericht? Ganzes Wort, Plural oder Kompositum ("Maultaschenauflauf"), nicht "Platten" oder "pastamäßig"
  function isFoodWord(w) {
    var l = lower(String(w || "")).replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/g, "");
    if (l.length < 2) return false;
    var parts = l.split("-");
    return parts.some(function (x) {
      return FOOD_LIST.some(function (h) {
        if (x === h) return true;
        var SUF = /^(s|n|e|en|es|er|chen|lein)?$/;
        if (x.indexOf(h) === 0 && SUF.test(x.slice(h.length))) return true;
        var at = x.lastIndexOf(h);
        return at >= 3 && h.length >= 3 && SUF.test(x.slice(at + h.length));
      }) || /^steaks?$|^tacos?$/.test(x);
    });
  }
  function hasFoodWord(t) { return /pot pie|ice cream|one pot/i.test(t) || String(t || "").split(/[\s\/]+/).some(isFoodWord); }
  var GENERIC_TITLE = /^(dressing|sauces?|ofengericht|gericht|kuchen|curry|salat|soße|sosse|sauce|reis|pasta|suppe|bowl|gnocchi|tofu|brot|lasagne|riegel|dip|pfanne|auflauf|nudeln|spaghetti|eintopf|smoothie|porridge|steak|burger|wrap|tacos|bowls?)$/i;

  // Gerichtsname aus Fließtext ("Comment RECIPE … for this Bright Green Basil Coconut Curry", "This super easy Vegan Pot Pie is …")
  var TITLE_STOP = /^(the|a|an|this|that|these|those|my|our|for|of|with|and|average|ultra|actually|best|easy|simple|quick|viral|so|really|super|very|die|der|das|den|dem|ein|eine|einen|mit|und|beste[nrs]?|einfache[nrs]?|leckere[nrs]?|schnelle[nrs]?|mein[e]?|meinen|unser[e]?|i|you|we|it|is|to|in|on|als|wie|heute|gibt|gibts|gibt's|es|g|kg|ml|el|tl|x|tbsp|tsp|cups?|tolerate|average|than|less|more)$/i;
  function dishPhrase(text) {
    var t = clean(stripEmoji(String(text || "")).replace(/[#@]\S+/g, " ").replace(/https?:\/\/\S+/g, " ")).slice(0, 700);
    var cap = "((?:[A-ZÄÖÜ][\\w’'&-]*\\s+){0,5}[A-ZÄÖÜ][\\w’'-]*)";
    var m = t.match(new RegExp("(?:recipe for (?:this |my |the )?|for this |rezept für (?:diese[ns]? |das |den |die |meine?n? )?)" + cap));
    dishPhrase.strength = 1;
    if (m && hasFoodWord(m[1])) return tidyPhrase(m[1]);
    m = t.match(new RegExp("\\b(?:This|These|My|Our|Diese[rsn]?|Meine?)\\s+(?:(?:super|so|really|very|easy|simple|quick|new|favou?rite|einfache[rn]?|schnelle[rn]?)\\s+)*" + cap + "\\s+(?:is|are|was|ist|sind|war|könnte|könnten|kann|kannst|schmeckt|schmecken|wird|werden|gibt)\\b", "i"));
    dishPhrase.strength = 2;
    if (m && hasFoodWord(m[1])) return tidyPhrase(m[1]);
    dishPhrase.strength = 3;
    // Wortweise: erstes Gericht-Wort mit davorstehenden Namenswörtern und "alla …"/"mit …"
    var w = t.split(/\s+/);
    for (var i = 0; i < w.length; i++) {
      if (!isFoodWord(w[i])) continue;
      var a = i;
      while (a > 0 && i - a < 3) {
        var pw = w[a - 1].replace(/[.,!?;:"“”„()]+$/g, "");
        if (/[.,!?;:]$/.test(w[a - 1]) || TITLE_STOP.test(pw) || TITLE_SENTENCE.test(pw)) break;
        var capd = /^[A-ZÄÖÜ]/.test(pw), lowFood = !capd && (TW[lower(pw)] || EN_NAMES[lower(pw)] || isFoodWord(pw));
        if (!(capd || lowFood) || /(en|t)$/.test(pw) && !capd && !lowFood) break;
        if (capd && langOfText(t) === "de" && !isFoodWord(pw) && !TW[lower(pw)] && (a - 1 === 0 || !/(e|er|es|en|em|isch)$/.test(lower(pw)))) break; // Satzanfang oder Nomen
        a--;
      }
      var b = i;
      var tailM = w.slice(i + 1, i + 4).join(" ").match(/^(all['’]\S+|alla \S+|al \S+|con \S+|de [A-Z]\S+|di \S+|mit [A-ZÄÖÜ][\wäöüß-]+(?: (?:und|&) [A-ZÄÖÜ][\wäöüß-]+)?|[Ww]ith [A-Za-z-]+(?: (?:and|&) [A-Za-z-]+)?)/);
      var phrase = w.slice(a, b + 1).join(" ") + (tailM ? " " + tailM[1] : "");
      return tidyPhrase(phrase.replace(/[.,!?;:]+$/, "").replace(/[,;].*$/, ""));
    }
    return "";
  }
  function tidyPhrase(p) {
    var w = clean(String(p).replace(/[()\[\]]/g, " ")).split(/\s+/).filter(function (x) { return !/^\d/.test(x) && !/^(ZUTATEN|INGREDIENTS|REZEPT|RECIPE|METHOD)$/i.test(x); });
    while (w.length > 1 && TITLE_STOP.test(w[0])) w.shift();
    // Kleingeschriebene Wortfolge aus dem Fließtext: nur Wörter behalten, die nach Essen klingen
    if (w.length > 1 && w.slice(1).join(" ") === w.slice(1).join(" ").toLowerCase() && !/[äöüß]/.test(w.join(""))) {
      var keep = w.filter(function (x, i) { var l = lower(x); return i === w.length - 1 || TW[l] || EN_NAMES[l] || FOOD_HINT.test(l); });
      if (keep.length) w = keep;
    }
    var out = w.join(" ").replace(/[.,!?;:]+$/, "");
    if (out === out.toLowerCase() || out === out.toUpperCase()) out = out.toLowerCase().replace(/(^|\s|-)([a-zäöüß])/g, function (_, a, b) { return a + b.toUpperCase(); });
    return out.replace(/^[a-zäöü]/, function (c) { return c.toUpperCase(); });
  }

  function cleanStep(s) {
    return clean(stripEmoji(s).replace(BULLET_RE, "").replace(/^(?:schritt\s*)?\d+\s*[.):]\s*/i, ""));
  }

  /**
   * Analysiert Freitext (Caption, Texterkennung). Gibt ein Teil-Rezept zurück.
   */
  // Zweisprachige Captions ("🇩🇪 … 🇬🇧 …"): die deutsche Fassung nehmen
  var FLAG_DE = "🇩🇪", FLAG_GB = "🇬🇧", FLAG_US = "🇺🇸";
  var DE_MARK = /(zutaten|das brauchst du|du brauchst|zubereitung|so machst du|so geht|\bEL\b|\bTL\b|prise|zwiebel|knoblauch)/i;
  function preferGerman(text) {
    var t = String(text || "");
    var hasDe = t.indexOf(FLAG_DE) !== -1, hasEn = t.indexOf(FLAG_GB) !== -1 || t.indexOf(FLAG_US) !== -1;
    if (!hasDe || !hasEn) return dropEnglishHalf(t);
    var parts = t.split(new RegExp("(" + FLAG_DE + "|" + FLAG_GB + "|" + FLAG_US + ")"));
    var head = parts[0], best = null;
    for (var i = 1; i < parts.length; i += 2) {
      var seg = parts[i + 1] || "";
      if (parts[i] === FLAG_DE && DE_MARK.test(seg) && (!best || seg.length > best.length)) best = seg;
    }
    if (!best) return t;
    // Hashtags am Ende behalten
    var tags = (t.match(/(#[^\s#]+\s*)+$/) || [""])[0];
    return head + "\n" + best + "\n" + tags;
  }

  // Sprache eines Textstücks über häufige Wörter ("de" | "en" | "nl" | "fr" | "?")
  var LANG_WORDS = {
    de: / (und|mit|die|der|das|bis|dann|minuten|den|ein|eine|für|von|zu|im|auf|ich|ist|nicht|sie|es|wir|du|in den|etwas|alles|noch) /g,
    en: / (the|and|with|until|add|into|then|minutes|your|cook|stir|for|of|it|on|this|is|you|my|to|in a|until|some|all) /g,
    nl: / (de|het|een|en|met|van|tot|op|voor|naar|je|ze|erdoor|bak|meng|ui|knoflook|minuten|laat|tot|olie) /g,
    fr: / (le|la|les|et|avec|du|des|une|pour|dans|est|qui|que|on|pas|au|aux|c’est|c'est) /g
  };
  function langOfText(t) {
    t = " " + lower(String(t || "")).replace(/[^a-zäöüßéèàçâêîôûœ’' ]/g, " ") + " ";
    var best = "?", bestN = 0, total = 0;
    Object.keys(LANG_WORDS).forEach(function (l) { var n = (t.match(LANG_WORDS[l]) || []).length; total += n; if (n > bestN) { bestN = n; best = l; } });
    return bestN >= 2 && bestN >= total * 0.45 ? best : "?";
  }
  // Zweisprachige Caption ohne Flaggen (erst Englisch, dann Deutsch): nur den deutschen Teil behalten
  function dropEnglishHalf(text) {
    // Zwei Fassungen, getrennt durch eine Trennzeile ("-", "—", "***")
    var halves = String(text || "").split(/\n\s*[-–—_=*~.•]{1,5}\s*\n/);
    if (halves.length >= 2) {
      var hl = halves.map(langOfText);
      var deH = halves.filter(function (h, i) { return hl[i] === "de"; }), enH = halves.filter(function (h, i) { return hl[i] === "en"; });
      if (deH.length && enH.length && deH.join("").length > 150 && enH.join("").length > 150) return deH.join("\n\n");
    }
    var paras = String(text || "").split(/\n\s*\n/);
    if (paras.length < 3) return text;
    var langs = [], cur = "?";
    paras.forEach(function (p) { var l = langOfText(p); if (l !== "?") cur = l; langs.push(l === "?" ? cur : l); });
    var enChars = 0, deChars = 0;
    paras.forEach(function (p, i) { if (langs[i] === "en") enChars += p.length; if (langs[i] === "de") deChars += p.length; });
    var deText = paras.filter(function (p, i) { return langs[i] === "de"; }).join("\n\n");
    if (enChars < 120 || deChars < 120 || !(DE_MARK.test(deText) || /\d\s?(g|ml|el|tl)\b/i.test(deText))) return text;
    // Erste Zeile (Titel) behalten, englische Absätze weglassen
    var first = paras[0];
    return [first].concat(paras.slice(1).filter(function (p, i) { return langs[i + 1] !== "en"; })).join("\n\n");
  }

  var KNOWN_FOOD = /^(petersilie|basilikum|koriander|schnittlauch|dill|minze|thymian|rosmarin|oregano|chiliflocken|chili|paprikapulver|kreuzkümmel|kurkuma|zimt|muskat|salz|pfeffer|brot|baguette|reis|nudeln|pasta|zitrone|limette|zitronensaft|limettensaft|sesam|frühlingszwiebeln?|zwiebeln?|knoblauch|ingwer|tomaten?|gurke|avocado|feta|parmesan|joghurt|sahne|butter|öl|olivenöl|honig|ahornsirup|sojasauce|sojasoße|senf|ketchup|mayo|toppings?|croutons|nüsse|walnüsse|mandeln|cashews|erdnüsse|rucola|spinat|salat|kresse|sprossen|granatapfelkerne)$/;

  var ADJ_WORD = /^(frische|gehackte|getrocknete|glatte|krause|rote|grüne|gelbe|weiße|braune|schwarze|kleine|große|mittelgroße|reife|gefrorene|geriebene|gemahlene|geröstete|gekochte|vegane|pflanzliche|helle|dunkle|feine|grobe|halbe|ganze)[rsnm]?$/i;
  // Captions ohne Zeilenumbrüche (z. B. aus der Einbettungsseite) wieder in Zeilen zerlegen
  var SECTION_WORDS = "(?:Zutaten(?: für [^:]{1,30})?|Das brauchst du|Du brauchst|Ihr braucht|Was du brauchst|Was brauchen wir|Ingredients|What you need|You need|Zubereitung|Anleitung|So machst du es|So geht['’]?s|So wird['’]?s gemacht|Instructions|Method|Directions|How to make it|Für (?:den|die|das) [A-ZÄÖÜ][a-zäöüß]+)";
  function resegment(text) {
    var t = String(text || "");
    var lines = t.split(/\n/).filter(function (l) { return l.trim() && !isHashtagLine(l.trim()); });
    var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
    // Abschnitts-Überschriften mitten in der Zeile immer abtrennen ("Noodles 🍜 Ingredients: …")
    t = t.replace(new RegExp("([^\\n])\\s(" + SECTION_WORDS + ")\\s*:\\s*", "g"), "$1\n$2:\n");
    if (longest < 220) return t; // hat sonst schon echte Zeilen
    // Abschnitte
    t = t.replace(new RegExp("\\s(" + SECTION_WORDS + ")\\s*:?\\s", "g"), "\n$1:\n");
    // Nummerierte Schritte "1. Zwiebeln …"
    t = t.replace(/\s(\d{1,2})\.\s(?=[A-ZÄÖÜa-zäöü])/g, "\n$1. ");
    // Aufzählungspunkte
    t = t.replace(/\s[•·▪]\s/g, "\n• ");
    // In Zutaten-Abschnitten vor jeder Mengenangabe trennen
    var units = "(?:g|kg|ml|l|EL|TL|Prise|Prisen|Stk|Stück|Dose|Dosen|Bund|Zehen?|Pck|Packung|Becher|Glas|cups?|tbsp|tsp|tablespoons?|teaspoons?|cloves?|cans?|large|small|medium|große?|kleine?|mittelgroße?)";
    t = t.split("\n").map(function (line) {
      if (line.length < 60 || /^\d{1,2}\.\s/.test(line)) return line;
      var qty = new RegExp("(?<!\\b(?:for|in|of|about|to|or|and|für|von|bis|ca\\.?|etwa|à|x|into|à))\\s(?=(?:\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+)?|\\d+\\/\\d+|[½¼¾])\\s?" + units + "?\\s?[A-ZÄÖÜa-zäöü])(?!\\d+(?:\\s*[-–]\\s*\\d+)?\\s?(?:Minuten|minutes|min|Min|°|cm|mm|hours?|Stunden?|Std|days?|Tage?)\\b)", "g");
      var pieces = line.split(qty);
      // nur trennen, wenn es nach einer Zutatenliste aussieht (mind. 3 Mengen)
      return pieces.length >= 3 ? pieces.join("\n") : line;
    }).join("\n");
    // Bekannte Zutaten ohne Menge trennen: "1 EL Senf Petersilie, fein gehackt Chiliflocken Brot zum Dippen"
    var firstLine = true;
    t = t.split("\n").map(function (line) {
      if (firstLine && line.trim()) { firstLine = false; if (line.length < 80) return line; } // Titelzeile nicht zerlegen
      if (line.length > 140 || /[.!?]$/.test(line.trim()) || /^\d{1,2}\.\s/.test(line)) return line;
      var words = line.split(/\s+/), out = [], cur = [], nouns = 0;
      words.forEach(function (w) {
        var bare = w.replace(/[^A-Za-zÄÖÜäöüß-]/g, "");
        var isNoun = /^[A-ZÄÖÜ]/.test(bare) && bare.length > 2 && !ADJ_WORD.test(bare) && !readUnit(bare);
        var prev = cur.length ? cur[cur.length - 1] : "";
        var prevColon = /:$/.test(prev) || ADJ_WORD.test(prev.replace(/[^A-Za-zÄÖÜäöüß]/g, "")) || !!readUnit(prev);
        if (isNoun && nouns >= 1 && !prevColon && KNOWN_FOOD.test(bare.toLowerCase())) { out.push(cur.join(" ")); cur = []; nouns = 0; }
        if (isNoun) nouns++;
        cur.push(w);
      });
      if (cur.length) out.push(cur.join(" "));
      return out.join("\n");
    }).join("\n");
    // Mengenlose Zutaten am Ende eines Stücks abtrennen ("… 200 g Frischkäse (v) Etwas Öl Salz, Pfeffer")
    t = t.replace(/\s(Etwas|Some|Salz, Pfeffer|Salt, pepper|Salz und Pfeffer|Salt and pepper)\b/g, "\n$1");
    return t;
  }

  // ---------------------------------------------------------------------------
  // Schritte bereinigen: Werbung/Erzähltext raus, Zutaten zurück, Überschriften, Bruchstücke, °F -> °C
  // ---------------------------------------------------------------------------
  var CTA = /(\bcomment\b|kommentier|\bdm\b|\bdms\b|inbox|link (?:is )?in (?:my |the )?bio|link in der bio|\bfollow\b|folge mir|folgt mir|folgt uns|folge uns|für mehr (?:\w+ )*rezepte|for more (?:\w+ )*recipes|save (?:this|for later)|speicher(?:t|e)? (?:dir|euch)|\bshare\b|teil(?:t|e) (?:das|den|es)|membership|subscribe|abonnier|newsletter|website|\bapp\b|use code|rabatt|discount|for less than|access to|giveaway|gewinnspiel|werbung|anzeige|sponsored|pinned (?:in )?comment|angepinnt|(?:full )?recipe (?:is )?(?:on|in|at)|rezept (?:gibt'?s |findest du )?(?:auf|im|in)|get (?:it|the recipe)|send (?:it|you)|schick(?:e)? (?:dir|euch)|my (?:cook)?book|mein (?:koch)?buch|amazon|tesco|out now|over \d+ (?:people|of you)|already cooking|abspeichern|speichern (?:&|und) |auf meinem profil|in meinem profil|highlight|nicht kennst|link in my|see my page)/i;
  var FILLER = /^(genießen|geniessen|enjoy|guten appetit|lass(?:t)? es (?:dir|euch) schmecken|an guadn|have fun|viel spaß|fertig|done|serve!?|yum+|so good|lecker)[!.\s]*$/i;
  var EN_IMP = /^(?:[^,]{0,70},\s*)?(?:(?:then|next|now|finally|meanwhile|first|also|and)\s+)?(add|mix|stir|cook|bake|heat|preheat|place|pour|blend|combine|chop|slice|dice|mince|toss|serve|season|bring|reduce|simmer|roast|fry|saut[eé]|whisk|fold|transfer|top|garnish|drain|rinse|let|remove|spread|roll|cut|grate|squeeze|sprinkle|drizzle|marinate|coat|arrange|layer|divide|mash|boil|steam|grill|toast|warm|set|leave|allow|prepare|peel|soak|press|wrap|fill|form|shape|assemble|finish|throw|put|cover|line|flip|turn|repeat|store|keep|refrigerate|chill|freeze|melt|beat|knead|scoop|pulse|process|microplane|shred|crumble|massage|dress|plate|dish|use|scatter|sear|brown|char|deglaze|braise|poach|blanch|pur[eé]e|strain|sift|measure|grease|check|taste|adjust|return|stuff|blitz|smash|break|pat|crisp|lower|increase|rest|wait|cool|slide|pop|tip|sauté|squish|dice)\b/i;
  var DE_INF_END = /\b[a-zäöüß-]+(?:en|ern|eln)[.!…]*\s*$/;
  var DE_VERBS = /\b(backen|kochen|braten|garen|rösten|mixen|pürieren|schneiden|würfeln|hacken|reiben|verteilen|geben|vermischen|vermengen|verrühren|rühren|abschmecken|würzen|servieren|garnieren|abkühlen|erhitzen|vorheizen|anbraten|dünsten|schmoren|köcheln|aufkochen|abgießen|abtropfen|formen|ausrollen|kneten|einweichen|marinieren|bestreuen|beträufeln|füllen|lassen|hinzufügen|dazugeben|zugeben|unterheben|schwenken|binden|ablöschen|einkochen|entfernen|nehmen|legen|stellen|streichen|drücken|zerrupfen|zerdrücken|pressen|mischen|anrühren|aufgießen|aufgiessen|toppen|belegen|halbieren|schälen|waschen|abspülen|reduzieren|frittieren|grillen|dämpfen|blanchieren|abdecken|wenden|umdrehen|swirlen|gib|rühre|brate|lege|stelle|schneide|mische|koche|backe|würze|vorheizen|aufschlagen|schlagen)\b/i;
  var NARRATIVE = /^(?:i|i'm|i’m|i've|i’ve|my|we|our|this|these|it's|it’s|that's|that’s|there|ich|mein|meine|wir|unser|das ist|es ist|heute|dieser|diese|dieses|you(?:'ll|’ll)? (?:love|need|won't|get))\b/i;
  function fToC(t) {
    return String(t).replace(/(\d{3})\s*°?\s*(?:F|Fahrenheit)\b(?:\s*\/\s*\d{2,3}\s*°?\s*C)?/g, function (m, f) {
      var c = Math.round((+f - 32) * 5 / 9 / 5) * 5; return c + " °C";
    }).replace(/(\d{2,3})\s*°?\s*(?:C|Celsius)\s*\/\s*\d{3}\s*°?\s*(?:F|Fahrenheit)\b/g, "$1 °C").replace(/(\d{2,3})\s*(?:°\s*)?C\b(?!\w)/g, "$1 °C").replace(/°\s*°/g, "°");
  }
  function capsToSentence(t) {
    return String(t).replace(/\b([A-ZÄÖÜ]{2,})\b/g, function (w) { return /^(BBQ|DIY|TK|XXL|USA|UK|EL|TL|PS|OK|TV|AI)$/.test(w) ? w : w.toLowerCase(); }).replace(/^\s*([a-zäöü])/, function (c) { return c.toUpperCase(); });
  }
  // Koch-Handlungen: deutsche Verbstämme mit trennbaren Vorsilben ("andünsten", "einrühren", "untermengen") und englische Verben
  var DE_ACT = /(?:^|[\s,(])(?:an|auf|aus|ein|mit|unter|durch|zu|ab|hinein|heraus|dazu|hinzu|über|darüber|nach|vor|weg|zusammen|um|ver|zer|be|ge|unterm|her)?(?:dünst|rühr|meng|tauch|leg|gieß|giess|drück|press|schwenk|streu|heb|brat|koch|back|gar|röst|misch|mix|püri|schneid|würfel|hack|reib|teil|geb|gib|füll|form|roll|knet|weich|mari|träufel|würz|abschmeck|servier|garnier|kühl|hitz|heiz|wend|dreh|deck|lass|lässt|stell|schäl|wasch|spül|tupf|zupf|schicht|streich|quell|zieh|reduzier|blanchier|dämpf|grill|frittier|toast|brösel|kleiner|schlag|sieb|glasier|karamellisier|lösch|tunk|halbier|viertel|köchel|simmer|schütt|wickel|bestreu|beträufel|leg|ordne|platzier|füg|nimm|nehm|verquirl|quirl|emulgier|sprüh|pinsel|bestreich|lager|frier|tau|zerkleiner|zerdrück|stampf|reib|ras|hobel|portionier|richt|pürier|vermeng|vermisch|schwitz|anschwitz|schmor|brutzel|bräun|garnier|dekorier|tränk|schöpf|abschöpf|klopf|raspel|hobel)(?:e|en|t|st|est|el|eln|ern|n|eren|ert)?\b/;
  var EN_ACT = /\b(add|mix|stir|cook|bake|heat|preheat|place|pour|blend|combine|chop|slice|dice|mince|toss|serve|season|bring|reduce|simmer|roast|fry|saut[eé]|whisk|fold|transfer|top|garnish|drain|rinse|reserve|remove|spread|roll|cut|grate|squeeze|sprinkle|drizzle|marinate|coat|arrange|layer|divide|mash|boil|steam|grill|toast|soak|knead|shape|form|press|wrap|fill|cover|chill|freeze|refrigerate|melt|beat|cream|scoop|flip|turn|let|leave|allow|set aside|cool|rest|squash|crumble|massage|peel|core|halve|quarter|line|grease|brush|pulse|process|puree|strain|sift|scatter|finish|assemble|stuff|plate|portion)(?:s|ed|ing)?\b/i;
  function isInstruction(st, lang, strict) {
    if (/\?\s*$/.test(st) || /\b(unterstützen|support us|folgt uns|follow (?:me|us))\b/i.test(st)) return false;
    var stl = st.replace(/^[A-ZÄÖÜ]/, function (c) { return c.toLowerCase(); });
    if (/\b(let it be|you['’]ve never|have you ever|you won['’]t|you['’]ll love|ich liebe|i love|my favou?rite|mein liebling|must try)\b/i.test(st) || /\bwenn du\b.*\b(magst|liebst|willst)\b/i.test(st) || /\b(kannst du|kannst Du|könnt ihr|kann man|you can)\b/.test(st) && /\b(praktisch|jeden tag|diät|immer|every day)\b/i.test(st)) return false;
    if (/\b(schmeckt|schmecken|tastes?|ist ein|is a)\b/i.test(st) && !/\babschmeck/i.test(st)) return false;
    if (lang !== "en" && /\b(wird|werden)\b.*\b\w*ge\w+(t|en)\b/i.test(st) && !/\b(ich|wir)\b/i.test(st)) return true; // "Die Haferflocken werden … aufgekocht"
    if (lang !== "en" && /^(dann|danach|anschließend|zuerst|zum schluss|jetzt|nun)\b/i.test(st) && DE_ACT.test(lower(st))) return true;
    if (strict) {
      // Fließtext ohne Rezept-Überschrift: nur klare Anweisungen (Befehlsform am Anfang, Infinitiv am Ende)
      if (/\b(i|i'm|i’m|we|my|you['’]ll|that['’]s|ich|wir|mein)\b/i.test(st.replace(/\([^)]*\)/g, " "))) return false;
      if (lang === "en") return EN_IMP.test(st.replace(/^\w+ly\s+/i, ""));
      var main = stl.replace(/\([^)]*\)/g, " ").split(/[,;]\s|\s[–-]\s/)[0];
      return DE_INF_END.test(st.replace(/\s*\([^)]*\)\s*[.!]?\s*$/, ".")) || DE_ACT.test(main) || DE_INF_END.test(main) || /^\w+en Sie\b/.test(st);
    }
    var narrative = /\b(let it be|you['’]ve never|have you ever|you won['’]t|you['’]ll love|ich liebe|i love|my favou?rite|mein liebling|follow|folg|kommentier|comment)\b/i.test(st) || /^(ich|wir|mein|unser|heute|das ist|es ist|i|we|my|our|today|this is|\d+ (tage|days))\b/i.test(st);
    if (narrative) return false;
    if (/^\s*(eiweiß|protein|fett|fat|kohlenhydrate|carbs|kcal|kalorien|ballaststoffe)\b/i.test(st)) return false;
    if (st.length < 100 && /\b(in (?:eine|die|den|das|einen)|auf (?:den|die|das)|drüber|darüber|on top|into a|onto)\b/i.test(st)) return true; // "Alles in eine Bowl, Dressing drüber"
    if (lang === "en") return EN_IMP.test(st) || EN_ACT.test(st) || STEP_VERBS.test(st);
    if (lang === "de") return DE_ACT.test(stl) || STEP_VERBS.test(st) || DE_VERBS.test(st) || DE_INF_END.test(st);
    return EN_IMP.test(st) || EN_ACT.test(st) || DE_ACT.test(stl) || STEP_VERBS.test(st) || DE_VERBS.test(st) || DE_INF_END.test(st);
  }
  function cleanSteps(raw, trusted) {
    var out = [], desc = [], ings = [];
    // "5-7min/FRY with the onion/STIR in …" -> einzelne Schritte
    var list = [];
    raw.forEach(function (st) {
      st.split(/\s*\/\s*(?=[A-ZÄÖÜ]{3,}\b)/).forEach(function (p) { if (clean(p)) list.push(clean(p)); });
    });
    // Bruchstücke vorab zusammenführen ("Mit Olivenöl beträufeln und mit" + "Salz und Pfeffer würzen.")
    var joined = [];
    list.forEach(function (st) {
      var prev = joined[joined.length - 1], c = clean(stripEmoji(st));
      if (prev && !/:\s*$/.test(prev) && !/^#/.test(c) && (/\b(und|oder|mit|von|zu|auf|bei|bis|in|and|or|with|to|at|of|the|den|die|das|dem|einer|einem|eine|ein)$/i.test(prev) || (/^[a-zäöü]/.test(c) && !/[.!?:)]$/.test(prev)))) joined[joined.length - 1] = prev + " " + c;
      else joined.push(c);
    });
    list = joined;
    list.forEach(function (st) {
      var t = clean(stripEmoji(st));
      // Werbung am Ende eines langen Schritts abschneiden ("… mit Puderzucker bestreuen für mehr Rezepte folgt uns")
      var ctaAt = t.search(CTA);
      if (ctaAt > 40) t = t.slice(0, ctaAt).replace(/[\s,;–-]+(?:für|for)?\s*$/i, "").replace(/[\s,;]+$/, "");
      if (!t || t.length < 3) return;
      if (/^(fett|fat|kohlenhydrate|kh|carbs?|protein|eiweiß|eiweiss|kalorien|kcal|calories|ballaststoffe|fib(?:re|er)|zucker|portionen|servings|schwierigkeit\w*|zubereitungszeit|kochzeit|nährwerte|makros?)\b[^.]{0,40}[:|]/i.test(t) || /schwierigkeitsgrad/i.test(t) && t.length < 80) return;
      if (/^(euer|eure|deine?|your|xoxo|love|big love)\s+\S+$/i.test(t)) return; // Signatur "Euer Gian"
      if (/^## (zutaten|ingredients)$/i.test(t)) return;
      if (!/\s/.test(t) && !/(en|ern|eln)$/i.test(t) && !EN_IMP.test(t)) return; // einzelnes Wort ("Gurke", "Alle")
      if (CTA.test(t) || FILLER.test(t) || /^https?:\/\//i.test(t) || /^\(?[^()]{0,30}\)$/.test(t) && /comment|kommentar/i.test(t)) return;
      var caps = t === t.toUpperCase() && /[A-ZÄÖÜ]{3}/.test(t);
      // Zwischenüberschrift ("Für die Sauce:", "MISO SAUCE")
      if ((/:\s*$/.test(t) && t.length < 45 && !/\d\s?(g|ml|el|tl|tbsp|tsp|cups?)\b/i.test(t)) || (caps && t.split(/\s+/).length <= 5 && !/\d/.test(t))) {
        out.push("## " + capsToSentence(t.replace(/:\s*$/, ""))); return;
      }
      // Zutatenzeile mitten in den Schritten
      var q = readQuantity(t);
      if (q && !q.fromWord && t.length < 90 && (readUnit(q.rest) || /^\s*(x\s|[A-Za-zÄÖÜäöü])/.test(q.rest)) && !EN_IMP.test(q.rest.replace(/^[^A-Za-z]+/, "")) && !DE_VERBS.test(t) && !/[.!]$/.test(t) && !/\b(min|mins|minuten|minutes|°|grad|sek|sec)\b/i.test(t)) { ings.push(t); return; }
      if (/^(gewürze|spices|toppings?|optional)\s*:/i.test(t) && t.length < 120) { ings.push.apply(ings, t.replace(/^[^:]+:\s*/, "").split(/\s*,\s*/)); return; }
      if (caps) t = capsToSentence(t);
      t = capsToSentence(t.replace(/\b([A-ZÄÖÜ]{3,})\b/, function (w) { return w; }));
      var lang = langOfText(t);
      var instr = isInstruction(t, lang, !trusted);
      // Erzählung in der Ich-Form oder Hintergrund ("Meine Mutter hat …", "Normalerweise wird …")
      if (/^(hi|hallo|hey|normalerweise|eigentlich|ursprünglich|traditionell|es gibt|dieses rezept|this recipe|meine?|my|ich|i|wir|we)\b/i.test(t) && !/^(ich|i|wir|we)\s+(gebe|mische|brate|koche|add|mix|stir)\b/i.test(t)) { desc.push(t); return; }
      if (/\b(ich|mein\w*|wir|unser\w*|I|my|we|our)\b/.test(t) && !(STEP_VERBS.test(t.split(/\s+/).slice(0, 8).join(" ")) || DE_VERBS.test(t.split(/\s+/).slice(0, 8).join(" ")) || EN_IMP.test(t))) { desc.push(t); return; }
      if (NARRATIVE.test(t) && !instr) { desc.push(t); return; }
      if (!trusted && !instr) { desc.push(t); return; }
      // Nur echte Arbeitsschritte: ohne Koch-Handlung ist es Beschreibung oder Tipp (auch in nummerierten Listen)
      if (trusted && !instr && (lang === "en" || lang === "de" || lang === "?") && !/\d+\s*(min|minuten|minutes|°|grad|std|stunden)/i.test(t)) { desc.push(t); return; }
      out.push(fToC(t));
    });
    // Bruchstücke zusammenführen ("preheat your oven to" + "230 °C (note …")
    var merged = [];
    out.forEach(function (st) {
      var prev = merged[merged.length - 1];
      if (prev && !/^## /.test(prev) && !/^## /.test(st) && (/\b(to|or|and|with|at|about|even|auf|bei|mit|und|oder|von|zu|ca\.?|etwa)$/i.test(prev) || (/^[a-zäöü\d(]/.test(st) && !/[.!?:)]$/.test(prev)))) {
        merged[merged.length - 1] = prev + " " + st;
      } else merged.push(st);
    });
    // Überschriften ohne folgenden Schritt entfernen
    var final = merged.filter(function (st, i) { return !/^## /.test(st) || (merged[i + 1] && !/^## /.test(merged[i + 1])); });
    return { steps: final, description: desc, ingredients: ings };
  }

  // Mathematische Unicode-Buchstaben ("𝐅𝐔𝐋𝐋 𝐑𝐄𝐂𝐈𝐏𝐄") in normale Buchstaben umwandeln
  function normalizeFancy(s) {
    return String(s || "").replace(/[\u{1D400}-\u{1D7FF}]/gu, function (c) { return c.normalize ? c.normalize("NFKC") : c; });
  }

  // Wo steht das Rezept, wenn nicht in der Caption? (Blog, Bio-Link, Kommentar, Nachricht, Kochbuch, Newsletter)
  function findElsewhere(text, r) {
    var t = lower(normalizeFancy(text));
    var m;
    if (/(pinned comment|pinned (?:in|below|in the) comments?|(?:method|instructions|steps?) (?:are |is )?(?:in the |in )comments?|angepinnte[nm]? kommentar|recipe (?:is )?in (?:the )?comments?|recipes? (?:are )?pinned|rezept (?:steht |ist )?in den kommentaren|rezept im kommentar|first comment|ersten kommentar|comment the recipe back)/.test(t)) return { wo: "kommentar" };
    if ((m = t.match(/(?:comment|kommentier\w*|schreib\w*)\s+[„"“'‘]([^"”“'’]{2,25})["”“'’]/)) && /(dm|nachricht|message|recipe|rezept|link)/.test(t)) return { wo: "nachricht", stichwort: m[1] };
    if (/(to your dms|in your dms|per dm|per direktnachricht|in deine dms|schicke? (?:ich )?dir (?:das|die) rezept)/.test(t)) return { wo: "nachricht" };
    if ((m = t.match(/(?:pg\.?|page|seite|s\.)\s*(\d{1,3})\b/)) && /(cookbook|kochbuch|my book|mein buch|book)/.test(t)) return { wo: "kochbuch", seite: +m[1] };
    if (/(cookbook|kochbuch)/.test(t) && /(recipe|rezept)/.test(t) && !(r.links || []).length) return { wo: "kochbuch" };
    if (/(newsletter|substack)/.test(t) && /(recipe|rezept)/.test(t)) return { wo: "newsletter" };
    if ((r.links || []).length) return { wo: "blog", url: r.links[0] };
    if (/(on my (?:blog|website|site)|auf meinem blog|auf meiner (?:website|seite|homepage)|full recipe (?:here|on|at)|recipe is on|rezept (?:gibt'?s|findest du|steht) auf)/.test(t)) return { wo: "blog" };
    if (r.linkInBio) return { wo: "bio" };
    return null;
  }

  function parseText(text, origin) {
    if (origin === "ocr") {
      // Zeilenumbruch im Bild: "Hokkaido" / "Kürbis" -> "Hokkaido Kürbis"
      var ol = String(text || "").split("\n"), oj = [];
      ol.forEach(function (l) {
        var prev = oj[oj.length - 1], c = clean(l);
        if (prev && /^[A-ZÄÖÜ][a-zäöüß-]+$/.test(clean(prev)) && /^[A-ZÄÖÜ][a-zäöüß-]+$/.test(c)) {
          var pi = parseIngredientLine(clean(prev)), ci = parseIngredientLine(c);
          if (pi && ci && pi.aisle === "Sonstiges" && !pi.nameOriginal && /^(kürbis|kartoffeln?|tomaten?|paprika|zwiebeln?|bohnen|linsen|pilze|salat|kohl|äpfel|apfel|reis|nudeln)$/i.test(c) && !/(hack|fleisch|wurst|käse|tofu|seitan|filet)/i.test(prev)) { oj[oj.length - 1] = clean(prev) + " " + c; return; }
        }
        oj.push(l);
      });
      text = oj.join("\n");
    }
    text = resegment(preferGerman(normalizeFancy(text)));
    // "Salmon Sushi Bowl #sushibowl #sushi …": Text vor den Hashtags behalten
    var rawLines = splitLines(text).map(function (l) {
      return /^[^#@\s]/.test(l) ? l.replace(/(\s+[#@][^\s#@]+)+\s*$/, "") : l;
    }).filter(function (l) { return l && !isHashtagLine(l); });
    var r = emptyRecipe();
    var src = origin || "caption";

    r.title = titleFrom(rawLines);
    var lines = [];
    rawLines.forEach(function (l) {
      splitOnEmoji(l).forEach(function (p) {
        // Überschrift mit Inhalt in derselben Zeile nicht in Sätze zerlegen
        if (HEAD_STEP.test(clean(stripEmoji(p)))) { lines.push(p); return; }
        splitSentences(p).forEach(function (s) { lines.push(s); });
      });
    });
    var mode = null; // "ing" | "step"
    var stepHeadingSeen = false;
    var ingredients = [], steps = [], loose = [];

    lines.forEach(function (line) {
      var plain = clean(stripEmoji(line).replace(/(^|\s)#[^\s#]+/g, " "));
      if (!plain || NOISE.test(plain) || /^[\W_]+$/.test(plain)) return;
      if (HEAD_ING.test(plain) && (plain.length < 50 || /^\W*[a-zäöüß' ]+\s*(\([^)]*\))?\s*:/i.test(plain))) {
        mode = "ing";
        if (/^\W*für (den|die|das) /i.test(plain)) ingredients.push(GROUP_MARK + groupName(plain));
        var after = plain.replace(HEAD_ING, "").replace(/^\s*(\([^)]*\))?[\s:]*/, "");
        var sv = findServings(plain); if (sv) r.servings = sv;
        if (after) after.split(/\s*[,;]\s*(?=\d|[A-ZÄÖÜ])/).forEach(function (a) { if (looksLikeIngredient(a)) ingredients.push(a); });
        return;
      }
      if (HEAD_STEP.test(plain) && (plain.length < 60 || /^\W*[a-zäöüß' ]+\s*:/i.test(plain))) {
        mode = "step"; stepHeadingSeen = true;
        var after2 = plain.replace(HEAD_STEP, "").replace(/^[\s:]+/, "");
        if (after2.length > 3) steps.push(after2);
        return;
      }
      if (mode === "ing" && SUBHEAD_WORD.test(plain)) { ingredients.push(GROUP_MARK + groupName(plain)); return; } // Unterüberschrift ohne Doppelpunkt
      if (mode === "ing" && !/\d/.test(plain) && (/:\s*$/.test(plain) || (plain === plain.toUpperCase() && /[A-ZÄÖÜ]{3}/.test(plain) && plain.split(/\s+/).length <= 5))) { ingredients.push(GROUP_MARK + groupName(plain)); return; } // "Glaze:", "MISO SAUCE"
      // "Topping: Joghurt oder Skyr, Kokosraspeln" – Liste hinter einer Unterüberschrift
      var sub = plain.match(/^(toppings?|topping-ideen|garnish|garnitur|deko|zum servieren|to serve|für das topping|for the topping|extras?|optional)\s*:\s*(.{3,})$/i);
      if (sub && (mode === "ing" || ingredients.length)) {
        sub[2].split(/\s*,\s*|\s+(?:und|and)\s+/).forEach(function (a) { if (a && a.length < 40) ingredients.push("optional: " + a + " (" + sub[1].toLowerCase() + ")"); });
        return;
      }
      if (mode === "ing") {
        var startsQty = (function () { var q = readQuantity(clean(plain.replace(BULLET_RE, ""))); return q && !q.fromWord; })();
        if (isStepLike(plain) && !startsQty) { mode = "step"; steps.push(line); return; }
        if (looksLikeIngredient(line) || (plain.length < 45 && !/[.!?]$/.test(plain) && BULLET_RE.test(line))) {
          ingredients.push(line); return;
        }
        if (/^(für|for)\b.{0,30}:$/i.test(plain)) { ingredients.push(GROUP_MARK + groupName(plain)); return; } // Unterüberschrift "Für die Sauce:"
        // Kommaliste kurzer Namen: "herbs, chili flakes, olive oil, salt & pepper"
        var segs = plain.split(/\s*,\s*/);
        if (!startsQty && segs.length >= 2 && segs.every(function (x) { return x && x.split(/\s+/).length <= 4; }) && !isStepLike(plain) && !segs.slice(1).some(function (x) { return /\b(chopped|diced|sliced|minced|grated|torn|roughly|finely|peeled|drained|rinsed|gehackt|geschnitten|gewürfelt|gerieben|geschält|fein|grob|abgetropft)\b/i.test(x); })) {
          segs.forEach(function (x) { ingredients.push(x); }); return;
        }
        // "Large handful fresh basil, leaves roughly chopped" – Zutat mit Zubereitungshinweis
        if (plain.length < 80 && !/[.!?]$/.test(plain) && /,\s*[^,]*\b(chopped|diced|sliced|minced|grated|torn|peeled|drained|rinsed|gehackt|geschnitten|gewürfelt|gerieben|geschält|abgetropft)\b/i.test(plain)) { ingredients.push(line); return; }
        // Zeile mit Menge am Anfang bleibt Zutat ("2-3 Hände voll Himbeeren (gefrorene …)")
        if (startsQty && plain.length < 110 && !/^\d+\s*[.):]\s/.test(plain)) { ingredients.push(line); return; }
        if (plain.length > 45 || /^\d+\s*[.):]\s*[A-ZÄÖÜa-zäöü]/.test(plain)) { mode = "step"; steps.push(line); return; }
        ingredients.push(line); return;
      }
      if (mode === "step") { steps.push(line); return; }
      loose.push(line);
    });

    // Keine Überschriften gefunden: Zeilen nach Form verteilen
    if (!ingredients.length) {
      var lastIng = false;
      loose.forEach(function (l, i) {
        var p = clean(stripEmoji(l));
        if (i === 0 && r.title && p.indexOf(r.title) !== -1) return;
        if (SUBHEAD_WORD.test(p.replace(/:\s*$/, ""))) { lastIng = false; ingredients.push(GROUP_MARK + groupName(p)); return; }
        if (/\b\d+\s*kcal\b|^\s*[EKF]:\s*\d|\b(eiweiß|protein|kohlenhydrate|fett)\s*:?\s*\d+\s*g\b/i.test(p)) return; // Nährwert-Angaben
        if (looksLikeIngredient(l)) { ingredients.push(l); lastIng = true; return; }
        if (src === "ocr" && p.split(/\s+/).length <= 4 && !/[.!?:]$/.test(p)) { var oi = parseIngredientLine(p); if (oi && (oi.aisle !== "Sonstiges" || oi.nameOriginal)) { ingredients.push(l); lastIng = true; return; } }
        // kurze Zeile mitten in einer Zutatenliste ("Gurke, Tomaten nach Belieben")
        if (lastIng && p.length < 45 && !/[.!]$/.test(p) && !/^(so|und|dann|jetzt)\b/i.test(p)) { ingredients.push(l); return; }
        lastIng = false;
        if (/^\s*(?:\d+\s*[.)]|[-•]\s*\S.{30,})/.test(stripEmoji(l)) || p.length > 50) steps.push(l);
      });
    } else if (!steps.length) {
      loose.forEach(function (l) { if (/^\s*\d+\s*[.)]/.test(stripEmoji(l))) steps.push(l); });
    }

    // Mehrere nummerierte Schritte in einer Zeile aufteilen
    var expanded = [];
    var trusted = stepHeadingSeen || steps.some(function (s) { return /^\s*\d{1,2}\s*[.):]\s/.test(stripEmoji(String(s))); });
    steps.forEach(function (s) {
      var parts = String(s).split(/\s(?=\d{1,2}[.)]\s+[A-ZÄÖÜa-zäöü])/);
      parts.forEach(function (p) { expanded.push(p); });
    });

    // "Plant-based cream + veggie broth" -> zwei Zutaten
    ingredients = [].concat.apply([], ingredients.map(function (l) {
      if (String(l).indexOf(GROUP_MARK) === 0) return [l];
      var p = clean(stripEmoji(l).replace(BULLET_RE, ""));
      var parts = p.split(/\s+\+\s+/);
      return parts.length > 1 && parts.every(function (x) { return x.split(/\s+/).length <= 5; }) ? parts : [l];
    }));
    // Zeilen, die eher Schritte sind, in die Zubereitung verschieben
    ingredients = ingredients.filter(function (l) {
      if (String(l).indexOf(GROUP_MARK) === 0) return true;
      var p = clean(stripEmoji(l).replace(BULLET_RE, ""));
      if (p.length > 30 && isStepLike(p) && !(readQuantity(p) && readUnit(readQuantity(p).rest))) { expanded.push(l); return false; }
      return true;
    });
    var grp = "";
    r.ingredients = [];
    ingredients.forEach(function (l) {
      if (String(l).indexOf(GROUP_MARK) === 0) { grp = String(l).slice(GROUP_MARK.length); return; }
      var ing = parseIngredientLine(l);
      if (ing) { if (grp) ing.group = grp; r.ingredients.push(ing); }
    });
    // Zutaten stehen nur im Fließtext der Zubereitung ("blend 1 can white beans, 2 cups of peas …")
    if (r.ingredients.filter(function (i) { return i.qty != null; }).length < 3) {
      var inline = extractInlineIngredients(expanded.join(" \n "));
      if (inline.length >= 3) {
        var have = {}; r.ingredients.forEach(function (i) { have[i.key] = i; });
        inline.forEach(function (i) { if (!have[i.key] || have[i.key].qty == null) { if (have[i.key]) r.ingredients.splice(r.ingredients.indexOf(have[i.key]), 1); r.ingredients.push(i); have[i.key] = i; } });
        r.ingredientsFromSteps = true;
      }
    }
    var rawSteps = expanded.map(function (s) { return cleanStep(String(s).replace(/(^|\s)#[^\s#]+/g, " ")); })
      .filter(function (s) { return s.length > 3 && !isHashtagLine(s) && !NOISE.test(s); });
    var cs = cleanSteps(rawSteps, trusted);
    r.steps = cs.steps;
    if (cs.description.length) r.description = cs.description.slice(0, 3).join(" ");
    cs.ingredients.forEach(function (l) { var ing = parseIngredientLine(l); if (ing && !r.ingredients.some(function (x) { return x.key === ing.key; })) r.ingredients.push(ing); });
    r.nutritionDeclared = findDeclaredNutrition(text);
    if (!r.servings) r.servings = findServings(text);
    var times = findTimes(text);
    r.timeTotal = times.total; r.timePrep = times.prep; r.timeCook = times.cook;
    r.timeEstimated = false;
    r.links = extractUrls(text);
    r.linkInBio = /link\s*(in|im)\s*(der\s*|my\s*|meiner\s*)?(bio|profil)|rezept\s*(in|im)\s*(der\s*|meiner\s*)?bio|recipe\s*(in|at|on)\s*(my\s*)?(bio|blog)|(full|ganze[sn]?)\s*(recipe|rezept)\s*(on|auf)\s*(my|meinem)\s*blog/i.test(text);
    // "Drveganblog dot com" -> https://drveganblog.com
    String(text).replace(/\b([a-z0-9-]{3,})\s+(?:dot|punkt)\s+(com|de|at|ch|net|org|co\.uk|blog)\b/gi, function (_, d, tld) { r.links.push("https://" + d.toLowerCase() + "." + tld.toLowerCase()); return _; });
    r.thermomixSettings = /\d+\s*(sek|sec|min)\.?\s*\/\s*(stufe|speed)/i.test(text) || /\bstufe\s*\d/i.test(text);
    r.creatorClaims = findClaims(text);
    r.elsewhere = findElsewhere(text, r);
    {
      var prose = String(text || "").split(/\n/).filter(function (l) { var c = clean(stripEmoji(l)); return c && !looksLikeIngredient(c) && !(readQuantity(c) && !readQuantity(c).fromWord) && !/^\s*\d+\s*[.)]/.test(c); }).join("\n");
      var dp = dishPhrase(prose); if (dp) { r.dishTitle = dp; }
      // erste erwähnte Zutat im Text (für "Eintopf" -> "Linsen-Eintopf")
      var fw = prose.slice(0, 600).split(/[^A-Za-zÄÖÜäöüß-]+/);
      for (var fi = 0; fi < fw.length && !r.textFood; fi++) {
        if (fw[fi].length < 4 || GENERIC_TITLE.test(fw[fi]) || TITLE_STOP.test(fw[fi])) continue;
        var tri = /^[A-Z]?[a-z]+$/.test(fw[fi]) ? translateIngredient(lower(fw[fi])) : null;
        if (tri && tri.display) r.textFood = chooseDisplay(tri.display);
      }
    }
    // Ersatz-Titel aus dem ersten Gericht-Hashtag ("#lasagne" -> "Lasagne")
    var tags = (String(text).match(/#[A-Za-zÄÖÜäöüß]{4,30}/g) || []).map(function (h) { return h.slice(1); });
    var dishTag = tags.filter(function (h) { return FOOD_HINT.test(h) && !/(recipe|rezept|food|vegan|healthy|easy|lover|ideas|inspo)/i.test(h); })[0];
    if (dishTag) {
      var ht = dishTag.charAt(0).toUpperCase() + dishTag.slice(1).toLowerCase();
      // "Biscoffcheesecake" -> "Biscoff-Cheesecake", "Pokebowl" -> "Poke-Bowl", "Linsendal" -> "Linsen-Dal"
      var fm = ht.match(/^(.{3,}?)(cheesecake|bowl|dal|curry|bread|cake|pasta|ramen|tacos?|burger|pie|shawarma|kofta)$/i);
      if (fm && FOOD_LIST.indexOf(lower(ht)) === -1 && !/^(cheese|pan|cup|pot|short|fish|sponge|carrot|cheese)$/i.test(fm[1])) ht = fm[1] + "-" + fm[2].charAt(0).toUpperCase() + fm[2].slice(1);
      r.hashtagTitle = ht;
    }
    r.bakingForm = findBakingForm(text);
    r.yieldInfo = findServingsInfo(text);
    if (r.yieldInfo && r.yieldInfo.stueck && r.servings === r.yieldInfo.n) r.servingsUnit = "Stück";
    markProvenance(r, src);
    return r;
  }

  // Was der Creator selbst behauptet ("proteinreich", "vegan") – wird als "laut Creator" markiert
  function findClaims(text) {
    var t = lower(text), out = [];
    var map = [["proteinreich", /(high.?protein|proteinreich|eiweißreich|eiweissreich|\d+\s*g\s*(protein|eiweiß))/],
      ["vegan", /(#?vegan\b|pflanzlich)/], ["vegetarisch", /(vegetarisch|vegetarian|#veggie)/],
      ["glutenfrei", /(glutenfrei|gluten.?free)/], ["laktosefrei", /(laktosefrei|lactose.?free|dairy.?free|milchfrei)/],
      ["low-carb", /(low.?carb|lowcarb|keto)/], ["kalorienarm", /(kalorienarm|low.?cal|\bdefizit|kcal.?arm)/],
      ["meal-prep", /(meal.?prep|vorkochen)/]];
    map.forEach(function (p) { if (p[1].test(t)) out.push(p[0]); });
    return out;
  }

  // Mengenangaben mitten im Fließtext finden: "blend 1 can white beans, 2 cups of thawed peas and 1/4 cup yeast"
  function extractInlineIngredients(text) {
    var units = UNIT_KEYS.filter(function (k) { return k.length > 1 || k === "g" || k === "l"; }).map(escapeRe).join("|");
    var re = new RegExp("(?:^|[\\s(,])((?:\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?|[½¼¾⅓⅔])\\s*(?:-\\s*\\d+\\s*)?(?:\\d+\\s*(?:ml|g)\\s+)?(?:" + units + ")\\.?\\s+(?:of\\s+|von\\s+)?(?:(?:loose|packed|heaped|thawed|frozen|fresh|chopped|cooked|frische[nrs]?|gehackte[nrs]?)\\s+)?[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß' -]{1,40}?)(?=\\s*(?:,|\\.|;|\\)|\\band\\b|\\bund\\b|\\buntil\\b|\\bbis\\b|\\bin\\b|\\bwith\\b|\\bmit\\b|\\binto\\b|\\bto\\b|$))", "gi");
    var out = [], seen = {}, m;
    var t = String(text || "").replace(/\s+/g, " ");
    while ((m = re.exec(t)) !== null) {
      var line = m[1].replace(/\s+of\s+/i, " ");
      if (/\b(minuten|minutes|min|grad|degrees|°)\b/i.test(line)) continue;
      var ing = parseIngredientLine(line);
      if (ing && ing.unit && !seen[ing.key]) { seen[ing.key] = 1; ing.fromSteps = true; out.push(ing); }
    }
    // Zahl + Zutat ohne Einheit ("juice of 1/2 lemon", "2 Zwiebeln")
    var re2 = /(?:juice of|saft von|zest of|abrieb von)\s+(?:\d+(?:\/\d+)?|½|a|an|one|half(?: a)?|einer?)\s+(?:organic\s+|bio[- ])?(?:lemons?|limes?|oranges?|zitronen?|limetten?|orangen?)/gi;
    while ((m = re2.exec(t)) !== null) {
      var j = parseIngredientLine(m[0]);
      if (j && !seen[j.key]) { seen[j.key] = 1; j.fromSteps = true; out.push(j); }
    }
    return out;
  }

  /**
   * Analysiert ein Transkript (gesprochener Text ohne Zeilenumbrüche).
   */
  // Gesprochener Text aus dem Video (Kurzbefehl „Audio transkribieren“). Deutsch oder Englisch,
  // oft ohne Zeilen und mit Füllwörtern: Mengenangaben werden zu Zutaten, Koch-Sätze zu Schritten.
  function parseTranscript(text) {
    var r = emptyRecipe();
    var t = String(text || "").replace(/\s+/g, " ").trim();
    var sentences = t.split(/(?<=[.!?])\s+|\s+(?=(?:then|next|now|after that|dann|danach|jetzt|anschließend|als nächstes)\b)/i).map(clean).filter(Boolean);
    var numWords = "(?:\\d+(?:[.,]\\d+)?(?:\\s*(?:-|–|to|bis)\\s*\\d+)?|½|¼|¾|(?:a|an)(?=\\s+(?:handful|pinch|can|tin|cup|bunch|clove|splash|dash))|" + Object.keys(NUMBER_WORDS).filter(function (w) { return w.length > 2; }).join("|") + ")";
    var unitWords = "(?:" + UNIT_KEYS.filter(function (k) { return k.length > 1; }).map(escapeRe).join("|") + ")";
    var re = new RegExp("\\b(" + numWords + "\\s*(?:" + unitWords + "\\.?\\s+)?(?:of\\s+|an\\s+)?(?:(?:the|some|frische[nrs]?|fresh)\\s+)?[A-Za-zÄÖÜäöüß-]{3,}(?:\\s+(?!and|und|then|dann|into|in|to|with|mit|for|für|until|bis)[A-Za-zÄÖÜäöüß-]{3,}){0,2})", "gi");
    var seen = {}, m;
    while ((m = re.exec(t)) !== null) {
      var phrase = m[1].replace(/\s+(and|und|then|dann|into|to|in|with|mit|for|für|until|bis)\b.*$/i, "");
      // Zahlwort -> Ziffer ("one onion" -> "1 onion", "a handful" -> "1 handful")
      phrase = phrase.replace(/^([A-Za-zäöü]+)\b/, function (w) { var v = NUMBER_WORDS[lower(w)]; return v != null && !/^(a|an)$/i.test(w) || /^(a|an)$/i.test(w) ? String(v != null ? v : 1) : w; });
      // Deutsch: nach dem letzten Nomen abschneiden ("Feta darüber bröseln" -> "Feta")
      var pw = phrase.split(/\s+/), lastCap = -1;
      pw.forEach(function (w, i) { if (i > 0 && /^[A-ZÄÖÜ]/.test(w)) lastCap = i; });
      if (lastCap > 0) phrase = pw.slice(0, lastCap + 1).join(" ");
      if (/^\S+\s+(minuten|minutes?|mins?|stunden?|hours?|sekunden|seconds?|grad|degrees?|portionen|servings?|personen|people|tage|days|mal|times|teile|pieces)\b/i.test(phrase)) continue;
      var ing = parseIngredientLine(phrase);
      if (!ing || seen[ing.key]) continue;
      // nur echte Lebensmittel: übersetzt (englisch) oder einem Supermarkt-Bereich zugeordnet
      if (!(ing.nameOriginal || (ing.aisle && ing.aisle !== "Sonstiges"))) continue;
      seen[ing.key] = 1; r.ingredients.push(ing);
    }
    r.steps = sentences.filter(function (s) {
      if (s.length < 12 || CTA.test(s) || /^(hey|hi|hallo|welcome|willkommen|so guys|okay so|ok so|heute|today|this is|das ist)\b/i.test(s) || /\b(gibt es|we are making|we're making|machen wir heute)\b/i.test(s)) return false;
      return EN_IMP.test(s.replace(/^(so|and|now|okay|ok|then|next)\s+/i, "")) || STEP_VERBS.test(s) || DE_VERBS.test(s) || DE_INF_END.test(s) || /\b(we're going to|i'm going to|you want to|wir geben|ich gebe|kommt rein|kommen rein|dazu|hinzu)\b/i.test(s);
    }).map(function (s) { return fToC(s.replace(/^(so|and|okay|ok|also|und|jetzt)\s+/i, "").replace(/^./, function (c) { return c.toUpperCase(); })); });
    r.title = "";
    var intro = sentences.filter(function (s) { return /\b(making|make|machen|gibt es|recipe for|rezept für)\b/i.test(s); })[0];
    if (intro) { var dpT = dishPhrase(intro); if (dpT) r.dishTitle = dpT; }
    r.servings = findServings(t);
    var times = findTimes(t);
    r.timeTotal = times.total;
    r.creatorClaims = findClaims(t);
    markProvenance(r, "speech");
    return r;
  }

  // Text aus vielen Videobildern (Live Text je Bild): gleiche und sich wiederholende Zeilen zusammenfassen,
  // Bedienelemente von Instagram weglassen, Reihenfolge des ersten Auftretens behalten
  var IG_UI = /^(gefällt|liked by|folgen|follow|following|abonniert|audio(?:-original)?|original audio|originalton|reels?|kommentare?|comments?|teilen|share|senden|send|mehr|more|… mehr|\.\.\. more|gesponsert|sponsored|\d+(?:[.,]\d+)?\s*(?:k|mio|tsd)?\s*(?:likes?|kommentare|comments|aufrufe|views)?|\d{1,2}:\d{2}|lte|5g|\d+\s*%|@[\w.]+|#\w+)$/i;
  var IG_UI_START = /^(gefällt|liked by|alle \d+ kommentare|view all|kommentieren|kommentar hinzufügen|add a comment|vor \d+ (?:min|std|tag)|\d+ (?:min|std|h|d|w) ago|‹|one sec|[\w.]+ und \d+ weitere|.*\bsind follower\b|.*\bfollowed by\b)/i;
  function mergeFrameText(text) {
    var lines = String(text || "").split(/\n+/).map(function (l) { return clean(stripEmoji(l)); }).filter(function (l) {
      return l.length >= 2 && !IG_UI.test(l) && !IG_UI_START.test(l) && !/^[\W\d]{1,4}$/.test(l) && !/^[a-z0-9_-]+\.[a-z]{2,6}$/i.test(l); // Uhrzeit, Zahlen, Symbole, "fitgirls.wiki"
    });
    var out = [], norm = function (l) { return lower(l).replace(/[^a-zäöüß0-9]+/g, ""); };
    lines.forEach(function (l) {
      var n = norm(l); if (n.length < 2) return;
      for (var i = 0; i < out.length; i++) {
        var o = norm(out[i]);
        if (o === n || (o.indexOf(n) === 0 && n.length >= 6)) return;   // schon da (oder Anfang einer längeren Zeile)
        if (n.indexOf(o) === 0 && o.length >= 6) { out[i] = l; return; } // längere Fassung derselben Zeile (Text baut sich auf)
      }
      out.push(l);
    });
    return out.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Blog-Rezeptdaten (schema.org/Recipe als JSON-LD)
  // ---------------------------------------------------------------------------

  function extractJsonLdBlocks(html) {
    var out = [];
    var re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(String(html || ""))) !== null) {
      var raw = m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").replace(/^\s*<!--|-->\s*$/g, "").trim();
      try { out.push(JSON.parse(raw)); }
      catch (e) {
        try { out.push(JSON.parse(raw.replace(/,\s*([}\]])/g, "$1").replace(/[\u0000-\u001F]+/g, " "))); } catch (e2) { /* ignorieren */ }
      }
    }
    return out;
  }

  function findRecipeNode(node, depth) {
    if (!node || depth > 8) return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) { var f = findRecipeNode(node[i], depth + 1); if (f) return f; }
      return null;
    }
    if (typeof node !== "object") return null;
    var type = node["@type"];
    var types = Array.isArray(type) ? type : [type];
    if (types.some(function (t) { return /(^|\/)Recipe$/i.test(String(t || "")); })) return node;
    if (node["@graph"]) { var g = findRecipeNode(node["@graph"], depth + 1); if (g) return g; }
    if (node.mainEntity) { var me = findRecipeNode(node.mainEntity, depth + 1); if (me) return me; }
    return null;
  }

  function textOf(v) {
    if (v == null) return "";
    if (typeof v === "string") return clean(stripTags(v));
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) return textOf(v[0]);
    if (v.text) return textOf(v.text);
    if (v.name) return textOf(v.name);
    if (v["@value"]) return textOf(v["@value"]);
    return "";
  }

  function flattenInstructions(v) {
    var out = [];
    (function walk(x) {
      if (!x) return;
      if (typeof x === "string") {
        stripTags(x).split(/\n+/).map(clean).filter(Boolean).forEach(function (s) { out.push(s); });
        return;
      }
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.itemListElement) { walk(x.itemListElement); return; }
      if (x.text) { walk(x.text); return; }
      if (x.name && !x.itemListElement) { walk(x.name); }
    })(v);
    return out.map(cleanStep).filter(function (s) { return s.length > 2; });
  }

  function num(v) {
    if (v == null) return null;
    var m = String(v).replace(",", ".").match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  /**
   * Liest schema.org/Recipe aus HTML (oder schon geparstem JSON-LD).
   * Gibt ein vollständiges Rezept oder null zurück.
   */
  function parseSchemaOrg(input, pageUrl) {
    var blocks = typeof input === "string" ? extractJsonLdBlocks(input) : [input];
    var node = null;
    for (var i = 0; i < blocks.length && !node; i++) node = findRecipeNode(blocks[i], 0);
    if (!node) return null;
    var r = emptyRecipe();
    r.title = textOf(node.name);
    var y = Array.isArray(node.recipeYield) ? node.recipeYield.map(textOf).join(" ") : textOf(node.recipeYield);
    r.servings = num(y);
    var ings = node.recipeIngredient || node.ingredients || [];
    if (!Array.isArray(ings)) ings = [ings];
    r.ingredients = ings.map(function (s) { return parseIngredientLine(textOf(s)); }).filter(Boolean);
    r.steps = flattenInstructions(node.recipeInstructions);
    r.timePrep = parseDuration(textOf(node.prepTime));
    r.timeCook = parseDuration(textOf(node.cookTime));
    r.timeTotal = parseDuration(textOf(node.totalTime)) || ((r.timePrep || 0) + (r.timeCook || 0)) || null;
    var cats = [].concat(node.recipeCategory || []).map(textOf).filter(Boolean);
    r.blogCategory = cats.join(", ");
    r.cuisine = [].concat(node.recipeCuisine || []).map(textOf).filter(Boolean).join(", ");
    r.keywords = textOf(node.keywords);
    r.blogDiets = [].concat(node.suitableForDiet || []).map(function (d) {
      return String(textOf(d) || d).replace(/^https?:\/\/schema\.org\//i, "");
    });
    if (node.nutrition) {
      var n = node.nutrition;
      r.nutritionDeclared = {
        kcal: num(n.calories), protein: num(n.proteinContent), carbs: num(n.carbohydrateContent),
        fat: num(n.fatContent), fiber: num(n.fiberContent), sugar: num(n.sugarContent), salt: num(n.sodiumContent),
        perServing: true, basis: "laut Blog"
      };
    }
    var author = node.author && (Array.isArray(node.author) ? node.author[0] : node.author);
    r.source.blogUrl = textOf(node.url) || pageUrl || "";
    r.source.blogAuthor = textOf(author);
    markProvenance(r, "blog");
    return r;
  }

  // ---------------------------------------------------------------------------
  // Klassifizierung (ohne LLM)
  // ---------------------------------------------------------------------------

  function classify(r) {
    var ingText = r.ingredients.map(function (i) {
      if (/(^|,\s*)(v|vegan|vegane?r?|pflanzlich)(\s*,|$)/i.test(i.note || "")) return "vegan " + lower(i.name);
      return lower(i.name + " " + (i.note || ""));
    }).join(" | ");
    var allText = lower(r.title + " | " + ingText + " | " + r.steps.join(" | ") + " | " + (r.description || "") + " | " + (r.keywords || "") + " | " + (r.blogCategory || ""));

    // Ernährungsstil
    var diet = [];
    if (r.ingredients.length >= 2) {
      var meat = matchWithExceptions(ingText, DICT.meat, NOT_ANIMAL);
      var fish = matchWithExceptions(ingText, DICT.fish, NOT_ANIMAL);
      var dairy = matchWithExceptions(ingText, DICT.dairy, NOT_ANIMAL);
      var egg = matchWithExceptions(ingText, DICT.egg, NOT_ANIMAL);
      var honey = matchWithExceptions(ingText, DICT.honey, NOT_ANIMAL);
      if (!meat && !fish && !dairy && !egg && !honey) diet.push("vegan");
      if (!meat && !fish) diet.push("vegetarisch");
      else if (!meat && fish) diet.push("pescetarisch");
      else diet.push("mit Fleisch");
      r.dietEvidence = { meat: meat, fish: fish, dairy: dairy, egg: egg, honey: honey };
    }
    r.diet = diet;

    // Allergene
    var allergens = [];
    Object.keys(ALLERGENS).forEach(function (a) {
      if (matchWithExceptions(ingText, ALLERGENS[a], ALLERGEN_EXCEPTIONS[a])) allergens.push(a);
    });
    if (/glutenfrei|gluten.?free/.test(allText)) allergens = allergens.filter(function (a) { return a !== "Gluten"; });
    r.allergens = allergens;

    // Kategorie: Titel zählt dreifach
    var best = null, bestScore = 0, scores = {};
    var title = lower(r.title + " " + (r.titleOriginal || ""));
    CATEGORY_KEYWORDS.forEach(function (c) {
      var score = 0;
      c[1].forEach(function (k) {
        if (title.indexOf(k) !== -1) score += 3;
        else if (CAT_WORD_START[k] ? new RegExp("(^|[^a-zäöüß])" + k).test(allText) : allText.indexOf(k) !== -1) score += (c[0] === "Hauptgericht" ? 0.6 : c[0] === "Sauce & Dip" || c[0] === "Suppe & Eintopf" || c[0] === "Getränk" ? 0.4 : 1);
      });
      scores[c[0]] = score;
      if (score > bestScore) { bestScore = score; best = c[0]; }
    });
    // Backen-Muster: Mehl + Backtriebmittel + Ofen
    if (bestScore < 3 && /mehl|flour/.test(ingText) && /(backpulver|natron|hefe|baking powder|yeast)/.test(ingText) && /(ofen|oven|backen|bake)/.test(allText) && /zucker|sugar|sirup|honig/.test(ingText)) best = "Backen";
    // Gerichtsart am Titelende hat Vorrang ("Lasagne-Suppe", "Linsen-Salat")
    var tEnd = lower(r.title || "").match(/(suppe|soup|eintopf|stew|schmortopf|salat|salad|bowl|kuchen|cake|muffins?|brot|brote|brötchen|strudel|cookies|smoothie|dip|pesto|hummus|-eis|eiscreme|nicecream)$/);
    if (tEnd) { best = /suppe|soup|eintopf|stew|schmortopf/.test(tEnd[1]) ? "Suppe & Eintopf" : /salat|salad|bowl/.test(tEnd[1]) ? "Salat & Bowl" : /kuchen|cake|muffin|brot|brötchen|strudel|cookies/.test(tEnd[1]) ? "Backen" : /eis|cream/.test(tEnd[1]) ? "Dessert" : /smoothie/.test(tEnd[1]) ? "Getränk" : "Sauce & Dip"; bestScore = 9; scores[best] = Math.max(scores[best] || 0, 9); }
    // Viele Zutaten + nur "Dressing"/"Sauce" im Text: eher Salat oder Hauptgericht als reiner Dip
    if (best === "Sauce & Dip" && bestScore < 3 && (r.ingredients.length > 12 || /dressing/.test(allText) && r.ingredients.length > 5)) {
      best = /dressing/.test(allText) && /(gurke|salat|avocado|kohl|cucumber|lettuce|spinat|rucola)/.test(ingText) ? "Salat & Bowl" : null;
      bestScore = 0;
    }
    r.category = best || "Hauptgericht";
    r.categoryAlso = Object.keys(scores).filter(function (c) { return c !== r.category && scores[c] >= 3; });
    r.categoryBasis = best ? "Stichworte" : "Standard";

    // Geräte
    var full = r.title + " " + r.steps.join(" ");
    r.equipment = EQUIPMENT.filter(function (e) { return e[1].test(full); }).map(function (e) { return e[0]; });
    if (!r.equipment.length && r.steps.length) r.equipment = ["ohne Kochen"];

    // Schwierigkeit (Heuristik)
    var score = r.steps.length + r.ingredients.length / 3;
    if (TECHNIQUES.test(full)) score += 4;
    if ((r.timeTotal || 0) > 90) score += 3;
    r.difficulty = score <= 8 ? "einfach" : score <= 14 ? "mittel" : "anspruchsvoll";

    // Ernährungsfokus: erst einmal nur aus deklarierten Nährwerten (Blog) nach EU-Schwellen.
    // Mit der BLS-Datenbank wird das später für jedes Rezept berechnet.
    r.focus = focusFromNutrition(r.nutritionDeclared, r.nutritionDeclared ? r.nutritionDeclared.basis : "");
    (r.creatorClaims || []).forEach(function (c) {
      if (["proteinreich", "kalorienarm", "low-carb", "meal-prep"].indexOf(c) !== -1 && !r.focus.some(function (f) { return f.label === c; })) {
        r.focus.push({ label: c, basis: "laut Creator" });
      }
    });
    return r;
  }

  // Schwellen angelehnt an die EU-Regeln für nährwertbezogene Angaben (VO (EG) 1924/2006, Anhang)
  // und die Nährstoffbezugswerte (NRV) der LMIV. "hoher Gehalt" = mind. 30 % NRV – hier je Portion.
  //   proteinreich      ≥ 20 % der Energie aus Protein
  //   ballaststoffreich ≥ 3 g je 100 kcal
  //   eisenreich        ≥ 4,2 mg (30 % von 14 mg)
  //   calciumreich      ≥ 240 mg (30 % von 800 mg)
  //   magnesiumreich    ≥ 112,5 mg (30 % von 375 mg)
  //   vitamin-C-reich   ≥ 24 mg (30 % von 80 mg)
  //   omega-3-reich     ≥ 0,6 g Omega-3 je 100 kcal
  var FOCUS_RULES = [
    ["proteinreich", function (n) { return n.protein != null && (n.protein * 4) / n.kcal >= 0.2; }],
    ["ballaststoffreich", function (n) { return n.fiber != null && n.fiber / (n.kcal / 100) >= 3; }],
    ["eisenreich", function (n) { return n.iron != null && n.iron >= 4.2; }],
    ["calciumreich", function (n) { return n.calcium != null && n.calcium >= 240; }],
    ["magnesiumreich", function (n) { return n.magnesium != null && n.magnesium >= 112.5; }],
    ["vitamin-C-reich", function (n) { return n.vitC != null && n.vitC >= 24; }],
    ["omega-3-reich", function (n) { return n.omega3 != null && n.omega3 / (n.kcal / 100) >= 0.6; }]
  ];
  function focusFromNutrition(n, basis) {
    var out = [];
    if (!n || !n.kcal) return out;
    FOCUS_RULES.forEach(function (r) { if (r[1](n)) out.push({ label: r[0], basis: basis }); });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Vollständigkeit, Zusammenführen, Analyse-Kette
  // ---------------------------------------------------------------------------

  function emptyRecipe() {
    return {
      schema: SCHEMA_VERSION, title: "", servings: null, ingredients: [], steps: [],
      timeTotal: null, timePrep: null, timeCook: null, timeEstimated: false,
      category: "", diet: [], allergens: [], difficulty: "", focus: [], equipment: [],
      source: { url: "", account: "", blogUrl: "" }, links: [], linkInBio: false,
      creatorClaims: [], provenance: {}
    };
  }

  function markProvenance(r, src) {
    ["title", "servings", "ingredients", "steps", "timeTotal"].forEach(function (f) {
      var v = r[f];
      if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) r.provenance[f] = src;
    });
  }

  function ingredientQuality(list) {
    if (!list || !list.length) return 0;
    var withQty = list.filter(function (i) { return (i.qty != null && !i.qtyEstimated) || /prise|etwas|nach geschmack|to taste|optional/i.test(i.raw); }).length;
    return list.length * (0.4 + 0.6 * (withQty / list.length));
  }

  /**
   * Wie vollständig ist das Rezept? score 0–100, missing = fehlende Teile,
   * enough = genug zum Kochen (Zutaten + Schritte).
   */
  function completeness(r) {
    var missing = [], score = 0;
    var ingOk = r.ingredients.length >= 3 && ingredientQuality(r.ingredients) >= r.ingredients.length * 0.7;
    var stepsOk = r.steps.length >= 2 || (r.steps.length === 1 && r.steps[0].length > 120);
    if (r.title) score += 10; else missing.push("Titel");
    if (ingOk) score += 40;
    else { missing.push(r.ingredients.length >= 3 ? "Mengenangaben" : "Zutaten"); score += Math.min(25, r.ingredients.length * 5); }
    if (stepsOk) score += 30; else { missing.push("Zubereitung"); score += r.steps.length * 10; }
    if (r.servings) score += 10; else missing.push("Portionen");
    if (r.timeTotal) score += 10; else missing.push("Dauer");
    return { score: Math.min(100, score), missing: missing, enough: ingOk && stepsOk };
  }

  // Füllt Lücken in a mit Werten aus b. a hat Vorrang, außer b ist klar besser.
  function merge(a, b, src) {
    if (!b) return a;
    var r = a;
    ["title", "servings", "timeTotal", "timePrep", "timeCook", "cuisine", "keywords", "blogCategory", "nutritionDeclared",
      "elsewhere", "bakingForm", "yieldInfo", "servingsUnit", "ingredientsFromSteps", "hashtagTitle", "titleFromTranslation", "dishTitle", "description", "textFood"].forEach(function (f) {
      if ((r[f] == null || r[f] === "") && b[f] != null && b[f] !== "") { r[f] = b[f]; r.provenance[f] = src; }
    });
    if (ingredientQuality(b.ingredients) > ingredientQuality(r.ingredients) * 1.15) {
      r.ingredients = b.ingredients; r.provenance.ingredients = src;
    }
    var bLen = b.steps.join(" ").length, aLen = r.steps.join(" ").length;
    if (b.steps.length > r.steps.length && bLen > aLen * 1.1) { r.steps = b.steps; r.provenance.steps = src; }
    r.links = uniq((r.links || []).concat(b.links || []));
    r.creatorClaims = uniq((r.creatorClaims || []).concat(b.creatorClaims || []));
    r.linkInBio = r.linkInBio || b.linkInBio;
    r.thermomixSettings = r.thermomixSettings || b.thermomixSettings;
    if (b.source) Object.keys(b.source).forEach(function (k) { if (!r.source[k] && b.source[k]) r.source[k] = b.source[k]; });
    return r;
  }

  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  var STEP_NAMES = {
    blog: "Blog-Rezeptdaten", caption: "Caption", ocr: "Texterkennung", comment: "Kommentar", speech: "Spracherkennung", model: "Lokales Modell"
  };

  /**
   * Die Analyse-Kette. Synchron für alles außer dem optionalen Modell.
   *
   * input = {
   *   url, account,            // Instagram-Post
   *   caption,                 // Text der Caption
   *   blogHtml | blogJson,     // Rezeptseite (vom Kurzbefehl/der App geholt)
   *   blogUrl,
   *   ocrText,                 // Text aus Screenshots/Videobildern
   *   transcript               // gesprochener Text
   * }
   * Gibt { recipe, trace, completeness, next } zurück.
   * next sagt der Oberfläche, was als Nächstes helfen würde (sparsamster Schritt zuerst).
   */
  function analyse(input) {
    input = input || {};
    var t0 = now();
    var trace = [];
    var r = emptyRecipe();
    r.source.url = input.url || "";
    r.source.account = (input.account || "").replace(/^@/, "");

    function step(name, available, fn) {
      var before = completeness(r);
      if (before.enough && name !== "caption") {
        trace.push({ step: name, label: STEP_NAMES[name], status: "übersprungen", reason: "Rezept war schon vollständig" });
        return;
      }
      if (!available) { trace.push({ step: name, label: STEP_NAMES[name], status: "nicht verfügbar" }); return; }
      var s = now();
      var part = fn();
      if (!part) { trace.push({ step: name, label: STEP_NAMES[name], status: "nichts gefunden", ms: now() - s }); return; }
      var hadTitle = !!r.title;
      merge(r, part, name);
      if (!hadTitle && part.title) r.title = part.title;
      var after = completeness(r);
      trace.push({ step: name, label: STEP_NAMES[name], status: "verwendet", gained: after.score - before.score, ms: now() - s });
    }

    // 1. Blog (wenn vorhanden): exakteste Quelle
    step("blog", !!(input.blogHtml || input.blogJson), function () {
      return input.blogJson ? parseSchemaOrg(input.blogJson, input.blogUrl) : parseRecipeHtml(input.blogHtml, input.blogUrl);
    });
    // 2. Caption: läuft immer, liefert auch Links, Creator-Angaben und Bio-Hinweis
    step("caption", !!input.caption, function () { return parseText(input.caption, "caption"); });
    // 3. Texterkennung
    step("ocr", !!input.ocrText, function () { return parseText(mergeFrameText(input.ocrText), "ocr"); });
    // Angepinnter Kommentar mit dem Rezept (vom Nutzer kopiert)
    step("comment", !!input.commentText, function () { return parseText(input.commentText, "comment"); });
    // 4. Spracherkennung
    step("speech", !!input.transcript, function () { return parseTranscript(input.transcript); });
    // Deutsche Übersetzung der Caption (z. B. Apples Übersetzer im Kurzbefehl): Schritte und Titel daraus,
    // Mengen und Zutaten weiter aus dem Original (dort sind sie verlässlicher)
    if (input.captionDe && clean(input.captionDe)) {
      var de = parseText(input.captionDe, "translation");
      if (de.steps.length && de.steps.length >= Math.max(1, r.steps.length - 1)) uebersetzeSchritte(r, de.steps);
      if (de.title) r.titleFromTranslation = de.title;
      trace.push({ step: "translation", label: "Übersetzung", status: de.steps.length ? "verwendet" : "nichts gefunden" });
    }

    finalize(r);
    var c = completeness(r);
    return { recipe: r, trace: trace, completeness: c, next: suggestNext(r, c, input), ms: now() - t0, version: VERSION };
  }

  /**
   * Optionaler 5. Schritt: ein lokales Modell. Der Kern ruft es nur auf, wenn
   * die Regeln nicht gereicht haben. modelFn(prompt) muss ein Promise mit
   * JSON-Text liefern (z. B. EuroLLM im Browser oder Apples Modell in der App).
   */
  function analyseWithModel(input, modelFn) {
    var res = analyse(input);
    if (res.completeness.enough || typeof modelFn !== "function") return Promise.resolve(res);
    var text = [input.caption, input.ocrText, input.transcript].filter(Boolean).join("\n\n").slice(0, 6000);
    return Promise.resolve(modelFn(buildModelPrompt(text, res.completeness.missing))).then(function (out) {
      var parsed = typeof out === "string" ? safeJson(out) : out;
      if (!parsed) { res.trace.push({ step: "model", label: STEP_NAMES.model, status: "keine gültige Antwort" }); return res; }
      var part = emptyRecipe();
      part.title = clean(parsed.title || "");
      part.servings = num(parsed.servings);
      part.timeTotal = num(parsed.timeTotal);
      part.ingredients = (parsed.ingredients || []).map(function (s) {
        return parseIngredientLine(typeof s === "string" ? s : [s.qty, s.unit, s.name].filter(Boolean).join(" "));
      }).filter(Boolean);
      part.steps = (parsed.steps || []).map(String).map(cleanStep).filter(Boolean);
      var before = res.completeness.score;
      merge(res.recipe, part, "model");
      finalize(res.recipe);
      res.completeness = completeness(res.recipe);
      res.trace.push({ step: "model", label: STEP_NAMES.model, status: "verwendet", gained: res.completeness.score - before });
      res.next = suggestNext(res.recipe, res.completeness, input);
      return res;
    }, function () {
      res.trace.push({ step: "model", label: STEP_NAMES.model, status: "Fehler" });
      return res;
    });
  }

  function buildModelPrompt(text, missing) {
    return "Extrahiere aus dem folgenden Text ein Kochrezept auf Deutsch. Antworte NUR mit JSON: " +
      '{"title": string, "servings": number, "timeTotal": number (Minuten), ' +
      '"ingredients": ["200 g Linsen", ...], "steps": ["...", ...]}. ' +
      "Erfinde nichts, was nicht im Text steht. Fehlend sind vor allem: " + missing.join(", ") + ".\n\nText:\n" + text;
  }

  function safeJson(s) {
    try { return JSON.parse(s); } catch (e) {
      var m = String(s).match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (e2) { return null; } }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Titel: leicht anpassen (Werbe-/Serienwörter weg) und Englisch direkt übersetzen
  // ---------------------------------------------------------------------------

  // Wort -> {n: Nomen, g: Genus (m/f/n/p), m: Vorderglied im Kompositum, a: Adjektivstamm, x: weglassen, s: Nachsatz, c: Bindewort}
  var TW = {};
  (function () {
    function add(list, f) { list.split(",").forEach(function (e) { var p = e.split(":"); f(p[0].trim(), p[1], p[2], p[3]); }); }
    // Kopf-Nomen mit Genus; Vorderglied = 4. Feld oder Nomen
    add("pasta:Pasta:f,noodles:Nudeln:p:Nudel,noodle:Nudeln:p:Nudel,soup:Suppe:f,salad:Salat:m,bowl:Bowl:f,bowls:Bowls:p,curry:Curry:n,stew:Eintopf:m," +
      "cake:Kuchen:m,cheesecake:Käsekuchen:m,cookies:Cookies:p:Cookie,cookie:Cookie:m,brownies:Brownies:p:Brownie,brownie:Brownie:m,muffins:Muffins:p:Muffin," +
      "bread:Brot:n,pancakes:Pancakes:p:Pancake,waffles:Waffeln:p:Waffel,porridge:Porridge:m,smoothie:Smoothie:m,shake:Shake:m,wrap:Wrap:m,wraps:Wraps:p:Wrap," +
      "tacos:Tacos:p:Taco,burger:Burger:m,burgers:Burger:p,pizza:Pizza:f,lasagna:Lasagne:f,lasagne:Lasagne:f,risotto:Risotto:n,sauce:Sauce:f,dip:Dip:m," +
      "dressing:Dressing:n,hummus:Hummus:m,pesto:Pesto:n,tofu:Tofu:m,rice:Reis:m,dumplings:Teigtaschen:p:Teigtaschen,sandwich:Sandwich:n,toast:Toast:m," +
      "chili:Chili:n,dal:Dal:n,dhal:Dal:n,gnocchi:Gnocchi:p,quiche:Quiche:f,tart:Tarte:f,pie:Pie:m,bars:Riegel:p,balls:Bällchen:p,bites:Happen:p," +
      "granola:Granola:n,mousse:Mousse:f,pudding:Pudding:m,fries:Pommes:p,wedges:Wedges:p,skewers:Spieße:p:Spieß,patties:Bratlinge:p:Bratling," +
      "fritters:Puffer:p,flatbread:Fladenbrot:n,flatbreads:Fladenbrote:p,focaccia:Focaccia:f,nuggets:Nuggets:p,shawarma:Shawarma:n,kebab:Kebab:m," +
      "sushi:Sushi:n,ramen:Ramen:p,udon:Udon:p,stir-fry:Pfanne:f,stirfry:Pfanne:f,traybake:Blechgericht:n,bake:Auflauf:m,casserole:Auflauf:m," +
      "gratin:Gratin:n,omelette:Omelett:n,omelet:Omelett:n,scramble:Rührei:n,lentils:Linsen:p:Linsen,chickpeas:Kichererbsen:p:Kichererbsen," +
      "beans:Bohnen:p:Bohnen,potatoes:Kartoffeln:p:Kartoffel,veggies:Gemüse:n,vegetables:Gemüse:n,tofu:Tofu:m,tempeh:Tempeh:m,salmon:Lachs:m," +
      "chicken:Hähnchen:n,cream:Creme:f,spread:Aufstrich:m,jam:Marmelade:f,latte:Latte:m,tea:Tee:m,lemonade:Limonade:f,ice-cream:Eis:n,gelato:Eis:n," +
      "rolls:Röllchen:p,buns:Brötchen:p,loaf:Brot:n,frittata:Frittata:f,tortilla:Tortilla:f,quesadillas:Quesadillas:p,quesadilla:Quesadilla:f," +
      "enchiladas:Enchiladas:p,burrito:Burrito:m,nachos:Nachos:p,falafel:Falafel:p,bolognese:Bolognese:f,carbonara:Carbonara:f,spaghetti:Spaghetti:p," +
      "orzo:Orzo:m,couscous:Couscous:m,quinoa:Quinoa:f,oats:Haferflocken:p:Hafer,mac:Mac:m,crumble:Crumble:m,parfait:Parfait:n,tiramisu:Tiramisu:n," +
      "truffles:Pralinen:p:Pralinen,fudge:Fudge:n,donuts:Donuts:p,salsa:Salsa:f,guacamole:Guacamole:f,raita:Raita:f,tzatziki:Tzatziki:n,feta:Feta:m",
      function (k, n, g, m) { TW[k] = { n: n, g: g, m: m || n }; });
    // Nur Vorderglieder (Zutat/Thema)
    add("tomato:Tomaten,tomatoes:Tomaten,spinach:Spinat,lemon:Zitronen,lime:Limetten,garlic:Knoblauch,mushroom:Pilz,mushrooms:Pilz,peanut:Erdnuss," +
      "sesame:Sesam,chickpea:Kichererbsen,lentil:Linsen,bean:Bohnen,potato:Kartoffel,pumpkin:Kürbis,carrot:Möhren,pea:Erbsen,peas:Erbsen," +
      "broccoli:Brokkoli,cauliflower:Blumenkohl,zucchini:Zucchini,courgette:Zucchini,eggplant:Auberginen,aubergine:Auberginen,avocado:Avocado," +
      "coconut:Kokos,chocolate:Schoko,banana:Bananen,apple:Apfel,berry:Beeren,blueberry:Blaubeer,strawberry:Erdbeer,raspberry:Himbeer," +
      "cinnamon:Zimt,vanilla:Vanille,pistachio:Pistazien,almond:Mandel,walnut:Walnuss,oat:Hafer,protein:Protein,beef:Rind,cheese:Käse," +
      "onion:Zwiebel,ginger:Ingwer,miso:Miso,tahini:Tahin,mango:Mango,matcha:Matcha,pecan:Pekannuss,hazelnut:Haselnuss,cashew:Cashew," +
      "kale:Grünkohl,leek:Lauch,corn:Mais,pepper:Paprika,herb:Kräuter,herbs:Kräuter,basil:Basilikum,veggie:Gemüse,vegetable:Gemüse,garden:Garten," +
      "summer:Sommer,winter:Winter,autumn:Herbst,fall:Herbst,breakfast:Frühstücks,dinner:Abendessen,lunch:Mittags,sweet-potato:Süßkartoffel," +
      "chili-oil:Chiliöl,teriyaki:Teriyaki,gochujang:Gochujang,peanut-butter:Erdnussbutter,cookie-dough:Keksteig,yogurt:Joghurt,yoghurt:Joghurt," +
      "orange:Orangen,cherry:Kirsch,plum:Pflaumen,pear:Birnen,rhubarb:Rhabarber,beetroot:Rote-Bete,asparagus:Spargel,salmon:Lachs,tuna:Thunfisch," +
      "shrimp:Garnelen,egg:Ei,butter:Butter,caramel:Karamell,biscoff:Karamellkeks,date:Dattel,fig:Feigen,pomegranate:Granatapfel,lentil:Linsen",
      function (k, m) { TW[k] = TW[k] || {}; TW[k].m = TW[k].m || m; if (!TW[k].n) TW[k].onlyM = true; });
    // Adjektive (Stamm)
    add("spicy:scharf,creamy:cremig,crispy:knusprig,crunchy:knusprig,healthy:gesund,vegan:vegan,fluffy:fluffig,sweet:süß,roasted:geröstet," +
      "baked:gebacken,fried:gebraten,grilled:gegrillt,stuffed:gefüllt,homemade:hausgemacht,green:grün,red:rot,smoky:rauchig,buttery:buttrig," +
      "warm:warm,hearty:herzhaft,fresh:frisch,thai:Thai-,korean:koreanisch,indian:indisch,mexican:mexikanisch,greek:griechisch,italian:italienisch," +
      "japanese:japanisch,chinese:chinesisch,asian:asiatisch,mediterranean:mediterran,moroccan:marokkanisch,lebanese:libanesisch,french:französisch," +
      "vegetarian:vegetarisch,gluten-free:glutenfrei,glutenfree:glutenfrei,dairy-free:milchfrei,sugar-free:zuckerfrei,cold:kalt,hot:heiß," +
      "chocolate-covered:schokoliert,garlicky:Knoblauch-,cheesy:Käse-,lemony:Zitronen-,mini:Mini-,giant:Riesen-,braised:geschmort,glazed:glasiert," +
      "marinated:mariniert,pickled:eingelegt,whipped:aufgeschlagen,frozen:gefroren,no-knead:ohne Kneten",
      function (k, a) { TW[k] = TW[k] || {}; TW[k].a = a; });
    // Weglassen (Werbung, Füllwörter)
    "easy,quick,simple,best,ultimate,perfect,viral,delicious,amazing,the,my,our,favorite,favourite,insanely,super,really,so,cozy,cosy,epic,famous,legendary,crazy,literally,new,classic,high,tasty,yummy,lazy,minute,minutes,5-minute,10-minute,15-minute,20-minute,30-minute,recipe,style,inspired,bomb,dreamy,life-changing,addictive,irresistible,secret".split(",")
      .forEach(function (k) { TW[k] = TW[k] || {}; TW[k].x = true; });
    // Nachsätze und Bindewörter
    TW["one-pot"] = { s: "aus einem Topf" }; TW["onepot"] = TW["one-pot"]; TW["one-pan"] = { s: "aus einer Pfanne" }; TW["sheet-pan"] = { s: "vom Blech" };
    TW["no-bake"] = { s: "ohne Backen" }; TW["air-fryer"] = { s: "aus dem Airfryer" }; TW["airfryer"] = TW["air-fryer"];
    TW["with"] = { c: "mit" }; TW["and"] = { c: "und" }; TW["&"] = { c: "und" }; TW["+"] = { c: "und" };
    TW["overnight-oats"] = { n: "Overnight Oats", g: "p", m: "Overnight-Oats" }; TW["banana-bread"] = { n: "Bananenbrot", g: "n", m: "Bananenbrot" };
    TW["cinnamon-rolls"] = { n: "Zimtschnecken", g: "p", m: "Zimtschnecken" }; TW["carrot-cake"] = { n: "Karottenkuchen", g: "m", m: "Karottenkuchen" };
    TW["fried-rice"] = { n: "Gebratener Reis", g: "m", fixed: true }; TW["mac-and-cheese"] = { n: "Mac and Cheese", g: "m", fixed: true };
    TW["chia-pudding"] = { n: "Chiapudding", g: "m", m: "Chiapudding" }; TW["energy-balls"] = { n: "Energy Balls", g: "p", m: "Energy-Ball" };
    TW["ice-cream"] = { n: "Eis", g: "n", m: "Eis" }; TW["nice-cream"] = { n: "Nicecream", g: "f", m: "Nicecream" };
    TW["sweet-potato"].n = "Süßkartoffel"; TW["sweet-potato"].g = "f"; TW["peanut-butter"].n = "Erdnussbutter"; TW["peanut-butter"].g = "f";
    TW["chili-oil"].n = "Chiliöl"; TW["chili-oil"].g = "n"; TW["stir-fry"].s = null;
  })();
  var PHRASES = ["one pot", "one pan", "sheet pan", "no bake", "air fryer", "overnight oats", "banana bread", "cinnamon rolls", "carrot cake", "fried rice",
    "mac and cheese", "mac n cheese", "chia pudding", "energy balls", "ice cream", "nice cream", "sweet potato", "peanut butter", "chili oil", "cookie dough",
    "stir fry", "gluten free", "dairy free", "sugar free", "no knead"];

  function declineAdj(stem, g) {
    if (/-$/.test(stem) || / /.test(stem)) return stem;
    return stem + (g === "m" ? "er" : g === "n" ? "es" : "e");
  }
  function capFirst(s) { return s.replace(/^[a-zäöü]/, function (c) { return c.toUpperCase(); }); }

  // Übersetzt einen englischen Titel nur, wenn jedes Wort bekannt ist; sonst null
  function translateTitle(title) {
    var tr = translateTitle1(title);
    if (!tr && /[a-z]-[a-z]/i.test(title || "")) tr = translateTitle1(String(title).replace(/([a-z])-([a-z])/gi, "$1 $2"));
    return tr;
  }
  function translateTitle1(title) {
    if (!title || /[äöüß]/i.test(title)) return null;
    var t = " " + lower(title).replace(/[’']s\b/g, "").replace(/[,!.:]/g, " ") + " ";
    PHRASES.forEach(function (p) { t = t.split(" " + p + " ").join(" " + p.replace(/ /g, "-") + " "); });
    t = t.replace(/\bmac-n-cheese\b/, "mac-and-cheese").replace(/\b(\d+)-?min(ute)?s?\b/g, "minute");
    var toks = t.trim().split(/\s+/).filter(Boolean);
    if (!toks.length || toks.length > 9) return null;
    var main = [], tail = [], suffix = [], inTail = false, englishHits = 0;
    for (var i = 0; i < toks.length; i++) {
      var w = TW[toks[i]];
      if (!w) return null;
      if (w.x) { englishHits++; continue; }
      if (w.s) { suffix.push(w.s); englishHits++; continue; }
      if (w.c === "mit") { inTail = true; englishHits++; continue; }
      if (w.c && !inTail) return null; // "Protein & Fibre Pasta": zu unsicher
      (inTail ? tail : main).push({ tok: toks[i], w: w });
      if (!/^(pasta|tofu|curry|risotto|pizza|pesto|hummus|burger|toast|sushi|ramen|falafel|gnocchi|tempeh|mango|matcha|miso|feta|dip|bowl|wrap|chili|quinoa|couscous|orzo)$/.test(toks[i])) englishHits++;
    }
    if (!main.length || !englishHits) return null;
    // Kopf = letztes Wort mit Nomen-Form
    var hi = -1;
    for (var j = main.length - 1; j >= 0; j--) if (main[j].w.n) { hi = j; break; }
    if (hi === -1) return null;
    var head = main[hi].w, adjs = [], mods = [];
    for (var k = 0; k < main.length; k++) {
      if (k === hi) continue;
      var e = main[k].w;
      if (k > hi) return null; // Wörter nach dem Kopf
      if (e.a && !(e.m && main[k + 1] && !main[k + 1].w.a && k + 1 !== hi && false)) {
        if (/-$/.test(e.a)) mods.push(e.a.replace(/-$/, "")); else adjs.push(declineAdj(e.a, head.g));
      } else if (e.m) mods.push(e.m);
      else return null;
    }
    var noun = head.fixed ? head.n : (mods.length ? mods.concat([head.n]).join("-") : head.n);
    var out = adjs.concat([noun]).join(" ");
    if (tail.length) {
      var items = tail.map(function (x) { return x.w.n || (x.w.m && x.w.onlyM ? null : x.w.m); });
      if (items.some(function (x) { return !x; })) return null;
      out += " mit " + (items.length > 1 ? items.slice(0, -1).join(", ") + " und " + items[items.length - 1] : items[0]);
    }
    if (suffix.length) out += " " + suffix.join(" ");
    return capFirst(out.replace(/\s+/g, " ").trim());
  }

  // "COZY SOUP SZN EP 4: VIRAL ONE-POT VEGAN LASAGNE SOUP" -> "One-Pot Vegan Lasagne Soup"
  function polishTitle(t) {
    var s = clean(t);
    s = s.replace(/^.{0,40}?\b(?:ep|episode|teil|part|folge|series|serie|day|tag)\s*\.?\s*\d+\s*[:\-–|]\s*/i, "");
    // Klammer am Ende mit Werbung oder Ernährungsangabe weg: "Lemon Pasta (Best Summer Pasta)", "Bowl (vegan)"
    s = s.replace(/\s*\((?:[^)]*\b(?:best|beste[rsn]?|easy|viral|perfect|perfekte[rsn]?|vegan|vegetarisch|vegetarian|high protein|gluten.?free|glutenfrei|recipe|rezept|plant.?based|pflanzlich|personen|persons|servings|portionen|people|serves)\b[^)]*)\)\s*$/i, "");
    s = s.replace(/\s*\(\s*(?:english|englisch|eng|deutsch|german|de\s*\/\s*en|en\s*\/\s*de)[^)]*\)\s*/gi, " ").replace(/[“”„"«»]/g, "");
    s = s.replace(/^(?:the\s+)?(?:best|ultimate|perfect|viral|easiest|easy|beste[rsn]?|ultimative[rsn]?|perfekte[rsn]?|virale[rsn]?)\s+(?=\S)/i, "");
    s = s.replace(/\s+(?:recipe|rezept)$/i, "");
    // Vorsatz wie "Of Vsk 2024:" oder "Folge 3 –" weg, wenn danach ein Titel folgt
    s = s.replace(/^[^:]{1,25}\b(?:19|20)\d{2}\s*:\s*(?=\S{3,})/, "");
    // Teilweise GROSS geschriebene Wörter angleichen ("CRISPY GNOCCHI auf die 1")
    if (/[a-zäöü]/.test(s)) s = s.replace(/\b([A-ZÄÖÜ])([A-ZÄÖÜ]{2,})\b/g, function (m, a, b) { return /^(BBQ|DIY|XXL|TK|USA|UK)$/.test(m) ? m : a + b.toLowerCase(); });
    return clean(s) || clean(t);
  }

  // Maschinelle Übersetzung in Rezeptsprache bringen: "Kochen Sie die Nudeln, bis …" -> "Die Nudeln kochen, bis …",
  // "Geben Sie das Öl hinzu." -> "Das Öl hinzugeben."
  var PARTIKEL = /^(hinzu|dazu|an|auf|ab|aus|bei|ein|mit|nach|vor|zu|zurück|unter|darüber|darauf|um|durch|weg|heraus|herein|hinein|beiseite|fest|gar|kalt|warm|bereit)$/i;
  function rezeptStil(text) {
    return String(text || "").split(/(?<=[.!?])\s+/).map(function (satz) {
      var m = satz.match(/^([A-ZÄÖÜ][a-zäöüß]+(?:en|ern|eln))\s+Sie\s+(.+)$/);
      if (!m) return satz.replace(/\b(Ihre[nrms]?|Ihr)\b/g, function (w) { return { "Ihr": "den", "Ihre": "die", "Ihren": "den", "Ihrem": "dem", "Ihrer": "der", "Ihres": "des" }[w] || w; });
      var verb = m[1].toLowerCase(), rest = m[2];
      var cut = rest.search(/,|[.!?]$|\s(?:und|oder|bis|dann)\s/);
      var teil = cut === -1 ? rest : rest.slice(0, cut), danach = cut === -1 ? "" : rest.slice(cut);
      var w = teil.trim().split(/\s+/), last = w[w.length - 1] || "";
      if (PARTIKEL.test(last)) { w.pop(); verb = last.toLowerCase() + verb; }
      var vorn = w.join(" ").replace(/\b(Ihre[nrms]?|Ihr)\b/g, function (x) { return { "Ihr": "den", "Ihre": "die", "Ihren": "den", "Ihrem": "dem", "Ihrer": "der", "Ihres": "des" }[x] || x; });
      var neu = (vorn ? vorn.charAt(0).toUpperCase() + vorn.slice(1) + " " + verb : verb.charAt(0).toUpperCase() + verb.slice(1)) + danach;
      return neu.replace(/\b(Ihre[nrms]?|Ihr)\b/g, function (x) { return { "Ihr": "den", "Ihre": "die", "Ihren": "den", "Ihrem": "dem", "Ihrer": "der", "Ihres": "des" }[x] || x; });
    }).join(" ");
  }

  // Übersetzte Schritte einsetzen; das Original bleibt erhalten ("Original zeigen")
  function uebersetzeSchritte(r, stepsDe) {
    var st = (stepsDe || []).map(function (x, k) {
      var head = /^## /.test(r.steps[k] || "") || /^##\s/.test(String(x));
      var t = String(x).replace(/^##\s*/, "");
      return head ? "## " + clean(t).replace(/:\s*$/, "") : rezeptStil(cleanStep(t));
    }).filter(function (x) { return x.replace(/^## /, "").length > 2; });
    if (!st.length) return r;
    if (!r.stepsOriginal) r.stepsOriginal = r.steps.slice();
    r.steps = st; r.stepsTranslated = true; r.lang = "de";
    return r;
  }
  // Übersetzte Zutatenzeilen (z. B. aus dem Niederländischen) neu einlesen; Original bleibt erhalten
  function uebersetzeZutaten(r, linesDe) {
    var out = [];
    r.ingredients.forEach(function (old, k) {
      var line = linesDe && linesDe[k];
      var ing = line ? parseIngredientLine(line) : null;
      if (!ing) { out.push(old); return; }
      ing.nameOriginal = old.nameOriginal || old.name; ing.rawOriginal = old.raw; ing.lang = "de";
      if (old.optional) ing.optional = true;
      out.push(ing);
    });
    r.ingredients = out; r.ingredientsTranslated = true;
    return r;
  }
  // Welche Zutaten werden in welchem Schritt verwendet? -> [[Zutat-Index, …], …] je Schritt (Überschriften: [])
  function stepIngredients(r) {
    var steps = r.steps || [], ings = r.ingredients || [];
    var heads = ings.map(function (i) {
      var names = [i.name, i.nameOriginal || ""].concat(i.key ? [i.key] : []).join(" ").toLowerCase().replace(/[()]/g, " ");
      var w = names.split(/[\s,\/]+/).filter(function (x) { return x.length >= 3 && !ADJ_WORD.test(x) && !/^(und|oder|and|or|mit|with|von|für|frisch|frische|gehackt|getrocknet|gemahlen|gekocht|gekochte|braune|rote|grüne|weiße|schwarze|dunkle|helle|vegane|veganer|veganes|pflanzliche|pflanzlicher|neutrales|extra|fein|grob)$/.test(x); });
      return w.map(function (x) { return x.replace(/(e|en|n|s|er)$/, "").replace(/-$/, ""); }).filter(function (x) { return x.length >= 3 && !/^(aus|dem|der|die|das|den|vom|zum|glas|dose|pck|packung|koro|bio|light)$/.test(x); });
    });
    var used = {};
    var res = steps.map(function (st, si) {
      if (/^## /.test(st)) return [];
      var low = " " + lower(st).replace(/[^a-zäöüß0-9 -]+/g, " ") + " ";
      var hits = [];
      ings.forEach(function (i, n) {
        var ok = heads[n].some(function (h) {
          if (h.length <= 3) return new RegExp("[\\s-]" + escapeRe(h) + "(e|en|n|s)?[\\s-]").test(low);
          return new RegExp("[\\s-]" + escapeRe(h) + "[a-zäöüß]*").test(low) || new RegExp("[a-zäöüß]{3,}" + escapeRe(h) + "(e|en|n|s|würfel|stücke|scheiben)?[\\s-]").test(low);
        });
        if (ok) hits.push(n);
      });
      // "Paprika" nicht zusätzlich, wenn nur "Paprikapulver" gemeint ist
      hits = hits.filter(function (n) {
        return !hits.some(function (m) {
          if (m === n) return false;
          var a = lower(ings[n].name), b = lower(ings[m].name);
          return b.length > a.length && b.indexOf(a) !== -1 && low.indexOf(b) !== -1 && low.split(b).join("").indexOf(a) === -1;
        });
      });
      hits.forEach(function (n) { used[n] = 1; });
      return hits;
    });
    // "Alle Zutaten für das Dressing …": Zutaten dieser Gruppe; "restliche Zutaten": bisher ungenutzte
    steps.forEach(function (st, si) {
      var l = lower(st);
      if (!/\b(alle\w*\s+(?:\w+\s+)?zutaten|all (?:the )?(?:\w+ )?ingredients|restlichen|übrigen|remaining)\b/.test(l)) return;
      var groups = {}; ings.forEach(function (i) { if (i.group) groups[lower(i.group)] = 1; });
      var g = Object.keys(groups).filter(function (gn) { return gn.split(/[\s-]+/).some(function (w) { return w.length > 3 && l.indexOf(w.replace(/(e|en|s)$/, "")) !== -1; }); })[0];
      var dry = /trocken|dry/.test(l), wet = /flüssig|nass|wet/.test(l);
      var LIQ = /(drink|milch|joghurt|öl$|^öl|wasser|saft|sirup|sahne|creme|butter|essig|sauce|soße)/;
      if (g) { ings.forEach(function (i, n) { if (lower(i.group || "") === g && res[si].indexOf(n) === -1 && !(dry && LIQ.test(i.key || "")) && !(wet && !LIQ.test(i.key || ""))) { res[si].push(n); used[n] = 1; } }); return; }
      if (/\b(für|for) (den|die|das|the)\b/.test(l) && !/restlich|übrig|remaining/.test(l)) return; // Gruppe unbekannt: lieber nichts
      ings.forEach(function (i, n) { if (!used[n] && !i.staple && res[si].indexOf(n) === -1) { res[si].push(n); used[n] = 1; } });
    });
    return res;
  }

  // Ist ein Titel (noch) englisch? ("Romesco-Style Butter Beans" ja, "Linsen-Curry" nein)
  function isEnglishTitle(t) {
    t = String(t || ""); if (!t || /[äöüß]/i.test(t) || /\b(alla|al|all['’]\S*|con|di|de|à la|aus|einem|einer|mit|und|vom|im|auf|nach|art)\b/i.test(t)) return false;
    var toks = lower(t).split(/[\s\-–,&+()]+/).filter(Boolean), hits = 0;
    toks.forEach(function (w) {
      if (/^(with|and|the|of|style|easy|creamy|crispy|spicy|sweet|quick|best|healthy|homemade|baked|roasted|fried|one|pot|pan|sheet)$/.test(w)) hits++;
      else if (TW[w] && lower(TW[w].n) !== w) hits++;
      else if (EN_NAMES[w] && lower(EN_NAMES[w].split("~")[0]) !== w) hits++;
    });
    // deutsche Wörter ("Glutenfreier", "Blechkuchen") sprechen dagegen
    var de = toks.filter(function (w) { return w.length > 4 && /(er|es|en|e|ung|chen)$/.test(w) && !TW[w] && !EN_NAMES[w] && !/^(the|other|over|under|water|butter|cheese|sauce|maple|apple|whole|fresh|green|orange|white|purple|ginger|pepper|spice|sweet|large|little|simple|style|frozen|baked|roasted|fried|toasted|loaded|stuffed|smashed|shredded|creamy|garden|chicken|chickpea|onion|tomatoes|potatoes|noodles|fries|cookies|brownies|pancakes|bites|bars|balls|tacos|wraps|burgers|lentils|beans)$/.test(w); }).length;
    return hits >= 1 && hits > de && langOfText(t) !== "de";
  }
  // Sprache der Zubereitung grob bestimmen ("de" | "en" | "?")
  function detectLang(r) {
    if (r.stepsTranslated) return "de";
    // Mehrheit der Schritte entscheidet (zweisprachige Captions)
    var votes = {};
    r.steps.forEach(function (st) { if (/^## /.test(st)) return; var l = langOfText(st); if (l !== "?") votes[l] = (votes[l] || 0) + 1; });
    var langs = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    if (!langs.length) {
      var all = langOfText(r.ingredients.map(function (i) { return i.raw; }).join(" ") + " " + (r.titleOriginal || r.title));
      if (all !== "?") return all;
      var enIng = r.ingredients.filter(function (i) { return i.lang === "en"; }).length;
      return enIng > r.ingredients.length / 2 ? "en" : (r.ingredients.length ? "de" : "?");
    }
    return langs[0];
  }


  // ---------------------------------------------------------------------------
  // Labels: mehrere je Rezept, gruppiert, wichtigste Gruppe zuerst (B5)
  // ---------------------------------------------------------------------------

  var LABEL_GRUPPEN = ["Gang", "Ernährung", "Zeit", "Hauptzutat", "Praktisch", "Nährwert-Fokus", "Aufwand", "Küche", "Saison & Anlass"];
  var HAUPTZUTAT = [
    ["Pasta", /(nudel|pasta|spaghetti|penne|fusilli|tagliatelle|linguine|rigatoni|orzo|lasagne|gnocchi|tortellini|ravioli|udon|ramen|soba)/],
    ["Reis", /(^|\s)(reis|basmatireis|jasminreis|vollkornreis|sushireis|risotto)/],
    ["Kartoffel", /(kartoffel|süßkartoffel)/],
    ["Hülsenfrüchte", /(linse|kichererbse|bohne|edamame|erbse|hummus)/],
    ["Tofu & Co.", /(tofu|tempeh|seitan|sojaschnetzel|sojahack)/],
    ["Getreide", /(quinoa|couscous|bulgur|buchweizen|hirse|haferflocken|dinkelflocken|polenta)/],
    ["Ei", /^(ei|eier|eigelb)$/],
    ["Fisch", new RegExp("(" + DICT.fish.join("|") + ")")],
    ["Fleisch", /(hähnchen|huhn|rind|schwein|hack|speck|schinken|pute|lamm|chicken|beef|bacon)/],
    ["Pilze", /(champignon|pilz|shiitake|austernpilz)/],
    ["Obst", /(banane|apfel|beere|mango|ananas|himbeere|erdbeere|heidelbeere|kirsch|pfirsich|birne)/]
  ];
  var VEG_RE = /(zwiebel|knoblauch|tomate|paprika|gurke|zucchini|aubergine|möhre|brokkoli|blumenkohl|spinat|grünkohl|kohl|lauch|sellerie|kürbis|fenchel|spargel|mais|rote bete|pak choi|rucola|salat|radieschen|mangold|wirsing)/;
  var KUECHE = [
    ["italienisch", /(pasta|risotto|pesto|parmesan|gnocchi|lasagne|pizza|focaccia|bruschetta|tiramisu|italienisch|italian|carbonara|bolognese|caprese|burrata|mozzarella|orzo|minestrone)/],
    ["asiatisch", /(sojasauce|sesamöl|ingwer.*soja|thai|korean|koreanisch|gochujang|miso|udon|ramen|reisnudel|kimchi|teriyaki|sushi|pak choi|hoisin|asiatisch|asian|currypaste|kokosmilch.*(limette|koriander)|bao|dumpling|wok|edamame|tamari)/],
    ["indisch", /(garam masala|\bdal\b|dhal|naan|tikka|masala|paneer|chana|indisch|indian|korma|biryani|samosa|pakora|raita|bombay)/],
    ["orientalisch", /(tahin|hummus|falafel|za.?atar|sumach|shawarma|harissa|ras el hanout|libanesisch|marokkan|orientalisch|shakshuka|baba ganoush|tabouleh|halloumi)/],
    ["mexikanisch", /(tortilla|taco|burrito|quesadilla|enchilada|guacamole|salsa|chipotle|jalapeñ|mexikanisch|mexican|nachos|fajita)/],
    ["griechisch & mediterran", /(feta|tzatziki|gyros|griechisch|greek|souvlaki|mediterran|oliven)/],
    ["deutsch & regional", /(spätzle|knödel|klöße|rotkohl|maultasche|sauerkraut|schnitzel|kartoffelsalat|kaiserschmarrn|flammkuchen|schupfnudel|rahm)/]
  ];
  var SAISON = [
    ["Herbst", /(kürbis|marone|herbst|autumn|\bfall\b|pilz.*saison|zwetschge|pflaume)/],
    ["Winter", /(rosenkohl|grünkohl|winter|glühwein|lebkuchen|maronen)/],
    ["Weihnachten", /(weihnacht|christmas|lebkuchen|plätzchen|zimtstern|spekulatius|stollen|gingerbread|advent)/],
    ["Ostern", /(ostern|easter|osterbrot|osterhase)/],
    ["Frühling", /(spargel|bärlauch|rhabarber|frühling|spring\b)/],
    ["Sommer", /(sommer|summer|grill|bbq|wassermelone|melone|eis\b|nicecream|nice cream|gazpacho|erdbeer)/],
    ["Party & Gäste", /(party|fingerfood|buffet|gäste|snackplatte|platter|brunch)/]
  ];

  function buildLabels(r) {
    var L = [], has = {};
    function add(g, label, basis) { var k = g + "|" + label; if (has[k]) return; has[k] = 1; L.push({ gruppe: g, label: label, basis: basis || "" }); }
    var keys = r.ingredients.map(function (i) { return i.key || ""; });
    var all = lower([r.title, r.titleOriginal || "", keys.join(" "), r.steps.join(" "), (r.creatorClaims || []).join(" ")].join(" | "));
    // Gang: Hauptkategorie + weitere mit starken Treffern
    if (r.category) add("Gang", r.category, r.categoryBasis);
    (r.categoryAlso || []).forEach(function (c) { add("Gang", c, "Stichworte"); });
    // Ernährung
    (r.diet || []).forEach(function (d) { add("Ernährung", d, "Zutaten"); });
    var claims = r.creatorClaims || [];
    if (r.ingredients.length >= 3 && r.allergens.indexOf("Gluten") === -1) add("Ernährung", "glutenfrei", claims.indexOf("glutenfrei") !== -1 ? "laut Creator" : "laut Zutaten");
    else if (claims.indexOf("glutenfrei") !== -1) add("Ernährung", "glutenfrei", "laut Creator");
    if (r.ingredients.length >= 3 && r.allergens.indexOf("Milch") === -1 && (r.diet || []).indexOf("vegan") === -1) add("Ernährung", "laktosefrei", "laut Zutaten");
    // Zeit
    if (r.timeTotal) {
      var z = r.timeTotal <= 15 ? "bis 15 Min." : r.timeTotal <= 30 ? "bis 30 Min." : r.timeTotal <= 60 ? "bis 60 Min." : "länger als 1 Std.";
      add("Zeit", z, r.timeEstimated ? "geschätzt" : "angegeben");
    }
    // Hauptzutat (max. 2, in Reihenfolge der Zutatenliste)
    var found = [];
    keys.forEach(function (k) {
      HAUPTZUTAT.forEach(function (h) { if (found.length < 2 && found.indexOf(h[0]) === -1 && h[1].test(k)) found.push(h[0]); });
    });
    if (!found.length && keys.filter(function (k) { return VEG_RE.test(k); }).length >= 3) found.push("Gemüse");
    found.forEach(function (f) { add("Hauptzutat", f, "Zutaten"); });
    // Praktisch
    if (claims.indexOf("meal-prep") !== -1 || /(meal.?prep|vorkochen|hält sich .{0,20}(tage|days)|keeps .{0,20}days)/.test(all)) add("Praktisch", "Meal-Prep");
    if (/(one.?pot|one.?pan|ein.?topf|eine pfanne|aus einem topf|aus einer pfanne|sheet.?pan|vom blech|alles in einen topf)/.test(all)) add("Praktisch", "One-Pot");
    (r.equipment || []).forEach(function (e) {
      if (e === "Ofen" && (r.category === "Hauptgericht" || r.category === "Beilage")) add("Praktisch", "Ofengericht");
      if (e === "Airfryer") add("Praktisch", "Airfryer");
      if (e === "Thermomix") add("Praktisch", "Thermomix");
      if (e === "ohne Kochen") add("Praktisch", "ohne Kochen");
    });
    if (/(no.?bake|ohne backen)/.test(all)) add("Praktisch", "ohne Backen");
    if (/(fingerfood|finger food|bites|häppchen|zum mitnehmen|to go)/.test(all) || r.category === "Snack") add("Praktisch", "Snack & to go");
    // Nährwert-Fokus
    (r.focus || []).forEach(function (f) { add("Nährwert-Fokus", f.label, f.basis); });
    // Aufwand
    if (r.difficulty) add("Aufwand", r.difficulty, "geschätzt");
    // Küche
    var kHits = KUECHE.map(function (k) { return [k[0], (all.match(new RegExp(k[1].source, "g")) || []).length]; }).filter(function (k) { return k[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 2);
    kHits.forEach(function (k) { add("Küche", k[0], "Stichworte"); });
    // Saison & Anlass
    SAISON.forEach(function (k) { if (k[1].test(all)) add("Saison & Anlass", k[0], "Stichworte"); });
    L.sort(function (a, b) { return LABEL_GRUPPEN.indexOf(a.gruppe) - LABEL_GRUPPEN.indexOf(b.gruppe); });
    return L;
  }

  // Portionen nach den Regeln B2 ableiten, wenn keine angegeben sind
  var KCAL_PRO_PORTION = { "Hauptgericht": 600, "Frühstück": 400, "Dessert": 300, "Backen": 300, "Snack": 200, "Salat & Bowl": 550,
    "Suppe & Eintopf": 450, "Beilage": 250, "Getränk": 250, "Sauce & Dip": 100 };
  function inferServings(r) {
    if (r.servings) { r.servingsBasis = r.servingsBasis || "angegeben"; return; }
    var title = lower(r.title + " " + (r.titleOriginal || ""));
    if (r.yieldInfo && r.yieldInfo.stueck) { r.servings = r.yieldInfo.n; r.servingsUnit = "Stück"; r.servingsBasis = "Stückzahl"; return; }
    if (r.bakingForm && (r.category === "Backen" || r.category === "Dessert" || r.bakingForm.form === "Auflaufform")) {
      r.servings = r.bakingForm.n; r.servingsUnit = r.bakingForm.unit; r.servingsBasis = "Backform: " + r.bakingForm.form; r.servingsEstimated = true; return;
    }
    if (/(smoothie|shake|overnight.?oats|porridge|chia.?pudding|chiapudding|oatmeal|smoothie.?bowl|açai|acai|latte|bircher)/.test(title) || r.category === "Getränk") {
      r.servings = 1; r.servingsUnit = "Portion"; r.servingsBasis = "Einzelportion"; r.servingsEstimated = true; return;
    }
    if (r.category === "Sauce & Dip") { r.servingsUnit = ""; r.servingsBasis = "Menge"; r.yieldPending = true; return; }
    r.servingsPending = "energie"; r.askServings = true;
  }

  // Fehlende Mengen nach Faustregeln schätzen (als "geschätzt" markiert); Gewürze bleiben "nach Geschmack"
  var QTY_RULES = [
    [/^(olivenöl|öl|neutrales öl|rapsöl|sesamöl|kokosöl)$/, 1, "EL"], [/^knoblauch/, 1, "Zehe"], [/^(zwiebel|rote zwiebel|weiße zwiebel|schalotte)$/, 1, ""],
    [/^frühlingszwiebel/, 2, ""], [/^(petersilie|frische petersilie|koriander|basilikum|schnittlauch|dill|minze)$/, 0.5, "Bund"],
    [/^(zitronensaft|limettensaft)$/, 1, "EL"], [/^(zitrone|limette)$/, 1, ""], [/^(sojasauce|tomatenmark|honig|ahornsirup|agavendicksaft)$/, 1, "EL"],
    [/^senf/, 1, "TL"], [/^(hefeflocke|hefeflocken|parmesan|veganer parmesan)$/, 2, "EL"], [/^(butter|vegane butter|margarine)$/, 1, "EL"],
    [/^(kokosmilch)$/, 1, "Dose"], [/^(passierte tomaten|gehackte tomaten|stückige tomaten)$/, 400, "g"], [/^feta$/, 100, "g"], [/^mozzarella$/, 125, "g"],
    [/^(nudel|nudeln|pasta|spaghetti|penne|rigatoni|fusilli|farfalle|tagliatelle)$/, 100, "g", true], [/^(reis|basmatireis|vollkornreis)$/, 75, "g", true],
    [/^tofu/, 100, "g", true], [/^(gemüsebrühe|brühe)$/, 250, "ml"], [/^(spinat|babyspinat)$/, 50, "g", true]
  ];
  function estimateMissingQty(r) {
    var serv = r.servings || 2;
    r.ingredients.forEach(function (i) {
      if (i.qty != null || i.optional || isSpice(i) || /^(salz|pfeffer|wasser)/.test(i.key || "")) return;
      if (/nach (belieben|geschmack)|to taste|optional/i.test(i.raw || "")) return;
      for (var n = 0; n < QTY_RULES.length; n++) {
        var q = QTY_RULES[n];
        if (q[0].test(i.key || "")) { i.qty = q[3] ? q[1] * serv : q[1]; if (!i.unit) i.unit = q[2]; i.qtyEstimated = true; break; }
      }
    });
  }

  function finalize(r) {
    if (!r.timeTotal && r.steps.length) {
      var est = estimateTimeFromSteps(r.steps);
      if (est) { r.timeTotal = est; r.timeEstimated = true; r.provenance.timeTotal = "geschätzt"; }
    }
    // Titel ist nur eine Zutat ("Stückige Tomaten"): Gerichtsname aus dem Text bevorzugen
    if (r.title && r.dishTitle && lower(r.dishTitle) !== lower(r.title) && r.ingredients.some(function (i) { return lower(i.name) === lower(r.title) || lower(i.raw) === lower(r.title); })) { r.title = r.dishTitle; r.titleGuessed = true; }
    // Allgemeiner Ein-Wort-Titel ("Curry", "Kuchen"): genaueren Namen aus Text oder Hashtag nehmen
    var isGeneric = function (t) { return !t || GENERIC_TITLE.test(clean(t)); };
    var better = function (base) {
      var c = [r.dishTitle, r.hashtagTitle].filter(function (x) { return x && !isGeneric(x) && x.split(/\s+/).length <= 6 && hasFoodWord(x) && !/^(kichererbsen|chickpeas|bohnen|beans|linsen|tofu|reis)$/i.test(x); });
      var bl = lower(base || "");
      var withBase = c.filter(function (x) { return bl && lower(x).indexOf(bl.replace(/e$/, "")) !== -1; })[0];
      return withBase || c[0] || "";
    };
    if (r.title && isGeneric(r.title)) { var bt = better(r.title); if (bt) { r.title = bt; r.titleGuessed = true; } }
    if (!r.title && r.dishTitle && !(isGeneric(r.dishTitle) && better(r.dishTitle))) { r.title = r.dishTitle; r.titleGuessed = true; }
    if (!r.title && r.dishTitle) { r.title = better(r.dishTitle); r.titleGuessed = true; }
    // Immer noch allgemein: mit der Hauptzutat ergänzen ("Curry mit Kichererbsen")
    if (r.title && isGeneric(r.title) && r.ingredients.length) {
      var mainI = r.ingredients.filter(function (i) { return !i.staple && !isSpice(i) && !/öl$|^wasser|brühe|milch|sahne|creme|joghurt|mehl|zucker|sauce|soße/.test(i.key) && !/(glas|dose|packung|pck)$/i.test(i.name) && lower(i.name).indexOf(lower(r.title).replace(/e?n$/, "")) === -1; })[0];
      if (mainI) { var mw = mainI.name.split(/\s+/); r.title = clean(r.title) + " mit " + (mw.length > 1 && !/-/.test(mainI.name) ? mw[mw.length - 1] : mainI.name); r.titleGuessed = true; }
    }
    if (r.title && isGeneric(translateTitle(r.title) || r.title) && !r.ingredients.length && r.textFood && lower(r.textFood) !== lower(r.title) && !/^(tofu|reis|brot|gnocchi|nudeln|spaghetti|pasta)$/i.test(clean(r.title))) {
      r.title = r.textFood + "-" + (translateTitle(r.title) || clean(r.title)); r.titleGuessed = true;
    }
    if (!r.title && r.hashtagTitle) { r.title = translateTitle(r.hashtagTitle) || r.hashtagTitle; r.titleGuessed = true; }
    if (!r.title && r.ingredients.length) {
      // Titel aus den Hauptzutaten vorschlagen (ohne Grundvorrat, Öl, Gewürze)
      var main = r.ingredients.filter(function (i) { return !i.staple && !isSpice(i) && !/(^|\s)öl$|öl$|^wasser/.test(i.key) && i.name.length < 30; });
      var base = function (nm) { var w = nm.split(/\s+/); return w.length > 1 && !/-/.test(nm) ? w[w.length - 1] : nm; };
      var pick = (main.length ? main : r.ingredients).slice(0, 2).map(function (i) { return base(i.name); });
      r.title = pick.join(" & ");
      r.titleGuessed = true; r.titleFromIngredients = pick;
    }
    // doppelte Zutaten zusammenfassen
    var seen = {};
    r.ingredients = r.ingredients.filter(function (i) {
      var k = i.key + "|" + i.unit + "|" + i.qty + "|" + (i.group || "");
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    // Titel: Caption-Titel leicht anpassen, Englisch direkt übersetzen; Original bleibt erhalten
    if (r.title && !r.titleGuessed) {
      var orig = r.titleOriginal || r.title;
      var pol = polishTitle(orig);
      var de = translateTitle(pol);
      if (!de && r.titleFromTranslation && /[a-z]/i.test(pol) && !/[äöüß]/i.test(pol)) de = polishTitle(r.titleFromTranslation);
      r.titleOriginal = orig;
      r.title = de || pol;
      r.titleTranslated = !!de;
    }
    if (r.title && r.titleGuessed && /[a-z]/i.test(r.title) && !/[äöüß]/.test(r.title)) {
      var trG = translateTitle(polishTitle(r.title)); if (trG) { r.titleOriginal = r.titleOriginal || r.title; r.title = trG; }
    }
    if (r.title) r.title = r.title.replace(/^[a-zäöü]/, function (c) { return c.toUpperCase(); });
    r.lang = detectLang(r);
    classify(r);
    estimateMissingQty(r);
    if (r.titleFromIngredients) {
      var suf = { "Salat & Bowl": /dressing|salat|salad/i.test(r.steps.join(" ") + r.ingredients.map(function (i) { return i.raw; }).join(" ")) ? "Salat" : "Bowl", "Suppe & Eintopf": "Suppe", "Backen": "Kuchen", "Frühstück": "", "Sauce & Dip": "Dip" }[r.category];
      if (suf) r.title = r.titleFromIngredients.join("-") + "-" + suf;
    }
    inferServings(r);
    r.labels = buildLabels(r);
    r.analysedAt = new Date().toISOString();
    r.kernVersion = VERSION;
    return r;
  }

  // Sparsamster nächster Schritt (Kette 1 → 2 → 3, vom Nutzer festgelegt):
  //   1 Blog (Link, Bio-Link, Blog-Suche)  2 Bilder des Posts (Live Text)  3 offizieller Download + Transkription
  // Danach nur noch manuelle Wege (Screenshot). Kein Sprachmodell (vorerst ausgeschaltet).
  function suggestNext(r, c, input) {
    if (c.enough) return null;
    var hasBlog = !!(input.blogHtml || input.blogJson);
    var wo = r.elsewhere ? r.elsewhere.wo : null;
    if (!hasBlog && r.links && r.links.length) return { action: "blog", schritt: 1, url: r.links[0], hint: "In der Caption steht ein Link. Die Rezeptdaten von dort sind meist vollständig." };
    if (!hasBlog && !input.blogSearched && (r.linkInBio || wo === "bio" || wo === "blog" || wo === "newsletter" || wo === "nachricht" || input.ownerUrl))
      return { action: "blogsuche", schritt: 1, hint: "Die App sucht das Rezept auf dem Blog des Creators (Titel, Zutaten, Hashtags)." };
    if (wo === "kommentar" && !input.commentText) return { action: "kommentar", schritt: 1, hint: WO_HINWEIS.kommentar };
    if (wo === "kochbuch" && !input.ocrText) return { action: "foto", schritt: 1, hint: WO_HINWEIS.kochbuch };
    if (!input.ocrText && !input.imagesTried) return { action: "bilder", schritt: 2, hint: "Die App liest den Text auf den Bildern des Posts (Live Text) und löscht die Bilder danach." };
    if (!input.transcript && /\/(reel|reels|tv)\//.test(input.url || "")) return { action: "download", schritt: 3, hint: "In Instagram „Herunterladen“ tippen. Die App wandelt den Ton in Text um und löscht das Video danach." };
    if (!input.ocrText) return { action: "screenshot", schritt: 4, hint: "Mach einen Screenshot von der Zutatenliste. Die App liest den Text und löscht den Screenshot danach." };
    return null;
  }

  function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

  // ---------------------------------------------------------------------------
  // Ausgabe: Mengen, Skalierung, Einkaufsliste, Cookidoo
  // ---------------------------------------------------------------------------

  function fmtQty(q) {
    if (q == null || q === "") return "";
    var n = Number(q);
    if (!isFinite(n)) return String(q);
    if (n >= 10) return String(Math.round(n));
    var r4 = Math.round(n * 4) / 4;
    var whole = Math.floor(r4), frac = r4 - whole;
    var map = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
    if (Math.abs(n - r4) < 0.05 && r4 > 0) return (whole ? String(whole) : "") + (frac ? map[frac] : "");
    return String(round(n, 1)).replace(".", ",");
  }

  function fmtIngredient(i, factor) {
    var f = factor || 1;
    var q = i.qty != null ? fmtQty(i.qty * f) + (i.qtyMax != null ? "–" + fmtQty(i.qtyMax * f) : "") : "";
    return clean([q, i.unit, i.name].join(" ")) + (i.note ? " (" + i.note + ")" : "");
  }

  function scaleRecipe(r, servings) {
    var base = r.servings || servings;
    var f = base ? servings / base : 1;
    return r.ingredients.map(function (i) { return { ingredient: i, text: fmtIngredient(i, f), factor: f }; });
  }

  /**
   * Einkaufsliste aus mehreren Rezepten (D1): gleiche Zutat = eine Zeile, Einheiten werden
   * zusammengerechnet, die Einzelteile stehen darunter ("ca. 76 ml Olivenöl" / "2 EL · 50 ml · 1 TL").
   * entries = [{recipe, servings}], pantry = { vorratsSchlüssel|zutatenSchlüssel: {have:bool} },
   * tabelle = daten/naehrwerte.json (optional, für Gramm je EL/Stück und Dichte).
   */
  var LIQUID = /(öl|milch|drink|saft|sauce|soße|essig|sirup|brühe|wasser|sahne|kochcreme|creme|wein|fond|dicksaft|balsamico)/;
  function shoppingList(entries, pantry, tabelle) {
    var table = tabelle && tabelle.zutaten ? tabelle.zutaten : tabelle;
    var map = {}, order = [];
    pantry = pantry || {};
    entries.forEach(function (e) {
      var r = e.recipe, f = (r.servings && e.servings) ? e.servings / r.servings : 1;
      r.ingredients.forEach(function (i) {
        var k = i.key || normName(i.name);
        if (!map[k]) { map[k] = { key: k, name: i.name, aisle: i.aisle, recipes: [], parts: [], staple: i.staple, optional: true }; order.push(k); }
        var it = map[k];
        if (!i.optional) it.optional = false;
        if (it.recipes.indexOf(r.title) === -1) it.recipes.push(r.title);
        it.parts.push({ qty: i.qty != null ? i.qty * f : null, qtyMax: i.qtyMax != null ? i.qtyMax * f : null, unit: i.unit, note: i.note, state: i.state, recipe: r.title });
      });
    });
    var items = order.map(function (k) {
      var it = map[k];
      var hit = table ? findNutrientEntry(k, table) : null;
      var entry = hit ? hit.entry : null;
      var sumG = 0, conv = [], rest = [], units = {};
      it.parts.forEach(function (p) {
        var q = p.qtyMax != null ? (p.qty + p.qtyMax) / 2 : p.qty;
        var g = null;
        if (q != null) {
          if (entry) g = gramsOf({ qty: q, unit: p.unit, note: p.note }, entry);
          else if (p.unit === "g" || p.unit === "kg") g = p.unit === "kg" ? q * 1000 : q;
        }
        if (g != null) { sumG += g; conv.push(p); units[p.unit || "Stk"] = 1; }
        else rest.push(p);
      });
      var main = "", approx = false;
      if (conv.length) {
        var uList = Object.keys(units);
        var mixed = uList.length > 1 || conv.length > 1;
        var liquid = (entry && entry.dichte) || LIQUID.test(k);
        var pieces = entry && entry.stk && uList.every(function (u) { return u === "Stk" || u === "" || u === "g"; }) && uList.some(function (u) { return u === "Stk" || u === ""; });
        if (!mixed && conv.length === 1) {
          var p0 = conv[0];
          main = clean(fmtQty(p0.qty) + (p0.qtyMax != null ? "–" + fmtQty(p0.qtyMax) : "") + " " + (p0.unit || "") + " " + it.name);
        } else if (pieces) {
          var cnt = Math.max(1, Math.ceil(sumG / entry.stk - 0.15));
          main = "ca. " + cnt + " " + (cnt > 1 ? pluralDe(it.name) : it.name); approx = true;
        } else if (liquid && uList.some(function (u) { return /^(ml|l|cl|EL|TL|cup)$/.test(u); })) {
          var ml = sumG / ((entry && entry.dichte) || 1);
          main = (uList.length > 1 ? "ca. " : "") + fmtShop(ml, "ml") + " " + it.name; approx = uList.length > 1;
        } else if (uList.every(function (u) { return u === uList[0]; }) && !/^(g|kg|ml|l)$/.test(uList[0])) {
          var tq = conv.reduce(function (m, p) { return m + (p.qtyMax != null ? (p.qty + p.qtyMax) / 2 : p.qty); }, 0);
          main = clean(fmtQty(tq) + " " + uList[0] + " " + it.name);
        } else {
          main = (uList.some(function (u) { return u !== "g" && u !== "kg"; }) ? "ca. " : "") + fmtShop(sumG, "g") + " " + it.name;
          approx = uList.some(function (u) { return u !== "g" && u !== "kg"; });
        }
      }
      // Teile ohne umrechenbare Menge zusammenfassen
      var restTexts = [];
      var byUnit = {};
      rest.forEach(function (p) {
        if (p.qty == null) { restTexts.push(/etwas|some|little/.test(p.note || "") ? "etwas" : "nach Bedarf"); return; }
        var u = p.unit || "";
        byUnit[u] = (byUnit[u] || 0) + p.qty;
      });
      Object.keys(byUnit).forEach(function (u) { restTexts.push(clean(fmtQty(byUnit[u]) + " " + u)); });
      restTexts = uniq(restTexts);
      var quant = restTexts.filter(function (x) { return !/etwas|nach Bedarf/.test(x); }), vague = restTexts.filter(function (x) { return /etwas|nach Bedarf/.test(x); });
      if (!main && quant.length) main = quant[0] + " " + it.name + (quant.length > 1 || vague.length ? " + " + quant.slice(1).concat(vague.length ? ["etwas"] : []).join(" + ") : "");
      else if (!main) main = it.name + (vague.length ? " (" + vague[0] + ")" : "");
      else if (restTexts.length) main += " + " + restTexts.join(" + ");
      var partsTxt = it.parts.length > 1 ? it.parts.map(function (p) {
        return p.qty == null ? "etwas" : clean(fmtQty(p.qty) + (p.qtyMax != null ? "–" + fmtQty(p.qtyMax) : "") + " " + (p.unit || "Stk"));
      }) : [];
      var vk = vorratsSchluessel(k) || k;
      var pv = pantry[vk] || pantry[k];
      var std = standardVorrat()[vk];
      return {
        key: k, vorratKey: vk, name: it.name, aisle: it.aisle, recipes: it.recipes, staple: it.staple,
        optional: it.optional, have: pv ? !!pv.have : (std ? !!std.have : ALWAYS.indexOf(k) !== -1),
        text: clean(main), parts: partsTxt, partsText: partsTxt.join(" · "), approx: approx, grams: sumG ? Math.round(sumG) : null
      };
    });
    items.sort(function (a, b) { return AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name, "de"); });
    return items;
  }
  // Einfache deutsche Mehrzahl für Stück-Zutaten
  var PLURAL_DE = { "ei": "Eier", "apfel": "Äpfel", "paprika": "Paprika", "zucchini": "Zucchini", "brokkoli": "Brokkoli", "mais": "Mais", "knoblauch": "Knoblauch", "ingwer": "Ingwer", "kürbis": "Kürbisse", "lauch": "Lauch", "blumenkohl": "Blumenköpfe" };
  function pluralDe(name) {
    var l = lower(name);
    if (PLURAL_DE[l]) return PLURAL_DE[l];
    if (/(en|ern|eln|s|i)$/.test(l)) return name;
    if (/(e|el|er)$/.test(l)) return name + "n";
    if (/o$/.test(l)) return name + "s";
    return name;
  }
  // Einkaufsfreundlich runden: kleine Mengen auf 5, größere auf 10 nach oben, ab 1000 in kg/l
  function fmtShop(v, unit) {
    if (v >= 1000) return String(round(v / 1000, 1)).replace(".", ",") + (unit === "g" ? " kg" : " l");
    if (v >= 100) return Math.ceil(v / 10) * 10 + " " + unit;
    if (v >= 10) return Math.ceil(v / 5) * 5 + " " + unit;
    return String(round(v, 1)).replace(".", ",") + " " + unit;
  }

  function shoppingText(items) {
    var out = [], last = null;
    items.filter(function (i) { return !i.have; }).forEach(function (i) {
      if (i.aisle !== last) { if (out.length) out.push(""); out.push(i.aisle + ":"); last = i.aisle; }
      out.push("- " + i.text);
    });
    return out.join("\n");
  }

  /**
   * Cookidoo-Ansicht: Felder einzeln zum Kopieren, passend zu "Meine Kreationen".
   */
  function toCookidoo(r) {
    var fields = [];
    fields.push({ label: "Titel", text: r.title });
    if (r.servings) fields.push({ label: "Portionen", text: String(r.servings) });
    if (r.timeTotal) fields.push({ label: "Gesamtzeit", text: r.timeTotal + " Min." });
    r.ingredients.forEach(function (i, n) { fields.push({ label: "Zutat " + (n + 1), text: fmtIngredient(i) }); });
    r.steps.forEach(function (s, n) { fields.push({ label: "Schritt " + (n + 1), text: s }); });
    var full = [r.title, "", r.servings ? "Portionen: " + r.servings : "", "", "Zutaten"]
      .concat(r.ingredients.map(function (i) { return fmtIngredient(i); }))
      .concat(["", "Zubereitung"]).concat(r.steps.map(function (s, n) { return (n + 1) + ". " + s; }))
      .concat(["", "Quelle: " + (r.source.account ? "@" + r.source.account + " " : "") + (r.source.url || r.source.blogUrl || "")])
      .filter(function (l, idx, arr) { return !(l === "" && arr[idx - 1] === ""); }).join("\n");
    return { fields: fields, fullText: full.trim(), hasThermomixSettings: !!r.thermomixSettings };
  }

  /**
   * Export im offenen schema.org-Format (kein Lock-in: lässt sich in andere
   * Rezept-Apps importieren).
   */
  function toSchemaOrg(r) {
    return {
      "@context": "https://schema.org", "@type": "Recipe", name: r.title,
      recipeYield: r.servings ? String(r.servings) : undefined,
      totalTime: r.timeTotal ? "PT" + r.timeTotal + "M" : undefined,
      recipeCategory: r.category, recipeIngredient: r.ingredients.map(function (i) { return fmtIngredient(i); }),
      recipeInstructions: r.steps.map(function (s) { return { "@type": "HowToStep", text: s }; }),
      isBasedOn: r.source.url || r.source.blogUrl || undefined,
      author: r.source.account ? { "@type": "Person", name: "@" + r.source.account } : undefined,
      keywords: [].concat(r.diet || [], (r.focus || []).map(function (f) { return f.label; })).join(", ")
    };
  }

  // ---------------------------------------------------------------------------
  // Nährwerte aus dem Bundeslebensmittelschlüssel (BLS 4.0, CC BY 4.0)
  // Die Tabelle (daten/naehrwerte.json) wird von außen übergeben, damit der
  // Kern klein bleibt und die Daten nur geladen werden, wenn man sie braucht.
  // ---------------------------------------------------------------------------

  // Präfix-Treffer, die falsch wären ("Butternut" ist keine Butter)
  var PREFIX_BLOCK = ["butternut", "butterbohne", "butterkeks", "butterpilz", "eisberg", "ingwershot", "milchreis", "reiswaffel", "salatgurke"];

  var _idxTable = null, _idx = null;
  function normIndex(table) {
    if (_idxTable === table) return _idx;
    _idx = {}; Object.keys(table).forEach(function (k) { if (k.indexOf("@") !== -1) return; var n = normName(k); if (!_idx[n]) _idx[n] = k; });
    _idxTable = table; return _idx;
  }
  function findNutrientEntry(key, table, state) {
    if (!key || !table) return null;
    if (state) {
      var base = findNutrientEntry(key, table);
      if (base && table[base.key + "@" + state]) return { key: base.key + "@" + state, entry: table[base.key + "@" + state], state: state };
      return base;
    }
    if (table[key]) return { key: key, entry: table[key] };
    var nk = normIndex(table)[key];
    if (nk) return { key: nk, entry: table[nk] };
    var words = key.split(" ");
    // "rote linsen getrocknet" -> letztes Nomen zuerst, dann Wortgruppen
    for (var n = words.length - 1; n >= 1; n--) {
      var tail = words.slice(words.length - n).join(" ");
      if (table[tail] && tail.indexOf("@") === -1) return { key: tail, entry: table[tail] };
      var head = words.slice(0, n).join(" ");
      if (table[head] && head.indexOf("@") === -1) return { key: head, entry: table[head] };
    }
    // Komposita: "babyspinat" endet auf "spinat", "hähnchenbrustfilet" beginnt mit "hähnchenbrust"
    var best = null;
    Object.keys(table).forEach(function (k) {
      if (k.length < 3 || k.indexOf(" ") !== -1 || k.indexOf("@") !== -1) return;
      var hit = false;
      if (key.length > k.length && key.slice(-k.length) === k) hit = true;
      else if (key.length > k.length && key.indexOf(k) === 0 && !PREFIX_BLOCK.some(function (b) { return key.indexOf(b) === 0; })) hit = true;
      if (hit && (!best || k.length > best.length)) best = k;
    });
    return best ? { key: best, entry: table[best] } : null;
  }

  // Menge einer Zutat in Gramm (null = unbekannt)
  function gramsOf(ing, entry) {
    // "1 Stück vegane Butter (ca. 25 g)": Grammangabe in der Notiz hat Vorrang
    var ng = String(ing.note || "").match(/(?:^|[\s(,])(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*g\b/);
    if (ng && /^(Stk|Pck|Dose|Glas|Becher|Scheibe|Stange|)$/.test(ing.unit) && !/\d+\s*g\s*(protein|eiweiß)/i.test(ing.note)) return parseFloat(ng[1].replace(",", ".")) * (ing.qty || 1);
    if (ing.qty == null) return null;
    var q = ing.qtyMax != null ? (ing.qty + ing.qtyMax) / 2 : ing.qty;
    var d = entry.dichte || 1;
    var drained = /gekocht|abgetropft/.test(entry.name || "");
    switch (ing.unit) {
      case "g": return q;
      case "kg": return q * 1000;
      case "ml": return q * d;
      case "cl": return q * 10 * d;
      case "l": return q * 1000 * d;
      case "EL": return q * (entry.el || 10);
      case "TL": return q * (entry.tl || 4);
      case "Prise": return q * 0.5;
      case "Msp": return q * 0.3;
      case "Dose": return q * (drained ? 240 : 400);
      case "Glas": return q * (drained ? 220 : 350);
      case "Becher": return q * 200;
      case "Pck": return q * (entry.stk || 15);
      case "Würfel": return q * (entry.stk || 10);
      case "Block": return q * (entry.stk && entry.stk > 100 ? entry.stk : 200);
      case "Zehe": return q * 4;
      case "Bund": return q * 25;
      case "Handvoll": return q * 30;
      case "Scheibe": return q * (entry.stk ? Math.min(entry.stk, 50) : 30);
      case "Blatt": case "Zweig": case "Spritzer": case "Schuss": return q * 1;
      case "Stange": case "Stk": case "": return entry.stk ? q * entry.stk : null;
      default: return null;
    }
  }

  var SPICES = /^(minzbl|petersilie|basilikum|oregano|kurkuma|thymian|rosmarin|majoran|dill|schnittlauch|minze|koriander|kreuzkümmel|kümmel|zimt|muskat|muskatnuss|nelke|kardamom|lorbeer|vanille|cayenne|chili|chiliflocke|chilipulver|chiliflocken|paprikapulver|rauchpaprika|currypulver|curry|garam masala|ras el hanout|za.?atar|italienische kräuter|kräuter|gewürz|knoblauchpulver|zwiebelpulver|ingwerpulver|senfsaat|fenchelsamen|sesam|schwarzkümmel|safran|piment|sternanis|estragon|salbei|liebstöckel|kresse|frühlingskräuter|tk-kräuter|kräutersalz|pfefferkörner)/;
  function isSpice(i) {
    var k = i.key || "";
    var small = i.qty == null || (/^(TL|Prise|Msp|Bund|Zweig|Blatt|Handvoll)$/.test(i.unit)) || (i.unit === "g" && i.qty <= 10) || (i.unit === "EL" && i.qty <= 2);
    return SPICES.test(k) || (small && /pulver$|gewürz/.test(k));
  }

  var NUTRIENT_KEYS = ["kcal", "protein", "fat", "carbs", "fiber", "sugar", "salt", "iron", "calcium", "magnesium",
    "zinc", "potassium", "vitC", "vitB12", "vitD", "folate", "satFat", "omega3", "iodine"];

  /**
   * Berechnet Nährwerte pro Portion. tabelle = Inhalt von daten/naehrwerte.json.
   * Ergänzt recipe.nutrition und die berechneten Fokus-Labels; gibt nutrition zurück.
   */
  // Kleine Mengen scharfer Saucen/Pasten zählen wie Gewürze (vernachlässigbar, oft nicht im BLS)
  var MINOR_SAUCES = /^(natron|matcha|wacholder|sternanis|sumach|hing|asafoetida|kelle|kellen|pastawasser|nudelwasser|salty pasta water|ölspray|eiswürfel|meersalz|zout|flohsamenschalen|tamarind|kaffir|rote thai curry|thai curry|chipotle|teriyaki|sriracha|gochujang|sambal|scharfe sauce|hot sauce|chili crisp|chiliöl|flüssigrauch|worcestershire|fischsauce|harissa|currypaste|rote currypaste|grüne currypaste|tabasco|liquid smoke)/;
  var NEGLIGIBLE = /^(natron|matcha|wacholder|sternanis|sumach|hing|asafoetida|kelle|kellen|pastawasser|nudelwasser|salty pasta water|ölspray|eiswürfel|meersalz|zout|salz|pfeffer|flohsamenschalen|lorbeer|nelke|kardamom|piment|vanilleschote|süßstoff|sweetener)/;
  function isMinor(i) {
    if (NEGLIGIBLE.test(i.key || "")) return true;
    var small = i.qty == null || /^(TL|Prise|Msp|Spritzer|Schuss)$/.test(i.unit) || (i.unit === "EL" && i.qty <= 2) || (i.unit === "g" && i.qty <= 15);
    return small && MINOR_SAUCES.test(i.key || "");
  }

  /**
   * Berechnet Nährwerte pro Portion. tabelle = Inhalt von daten/naehrwerte.json.
   * opts.zuordnungen = { zutatenschlüssel: Tabelleneintrag } – vom Nutzer "einmal zugeordnet", hat Vorrang.
   * Ergänzt recipe.nutrition, die berechneten Fokus-Labels und ggf. geschätzte Portionen (Regeln B2).
   */
  function berechneNaehrwerte(r, tabelle, portionen, opts) {
    var table = tabelle && tabelle.zutaten ? tabelle.zutaten : tabelle;
    var eigene = (opts && opts.zuordnungen) || {};
    var total = {}, matched = [], unmatched = [], noQty = [], grams = 0;
    NUTRIENT_KEYS.forEach(function (k) { total[k] = 0; });
    (r.ingredients || []).forEach(function (i) {
      var hit = eigene[i.key] ? { key: i.key, entry: eigene[i.key], eigene: true } : findNutrientEntry(i.key, table, i.state);
      if (!hit) { if (!i.staple && !isSpice(i) && !isMinor(i)) unmatched.push(i.name); return; }
      var g = gramsOf(i, hit.entry);
      if (g == null) { if (!i.staple && i.qty == null) noQty.push(i.name); else if (!i.staple) unmatched.push(i.name); return; }
      matched.push({ name: i.name, key: i.key, gramm: Math.round(g), bls: hit.entry.name, zustand: hit.state || "", eigene: !!hit.eigene });
      grams += g;
      NUTRIENT_KEYS.forEach(function (k) {
        var v = hit.entry.n[k];
        if (v != null) total[k] += v * g / 100;
      });
    });
    var relevant = matched.length + unmatched.length;
    var share = relevant ? matched.length / relevant : 0;
    var reliable = share >= 0.8 && matched.length >= 2;
    // Portionen schätzen (B2): aus der Gesamtenergie, nur wenn die Rechnung verlässlich ist
    if (!portionen && reliable && total.kcal > 0) {
      var target = KCAL_PRO_PORTION[r.category] || 600;
      if (r.servingsPending === "energie") {
        r.servings = Math.max(1, Math.round(total.kcal / target));
        r.servingsUnit = "Portionen"; r.servingsBasis = "geschätzt aus Energie (" + target + " kcal je Portion)"; r.servingsEstimated = true;
        delete r.servingsPending;
      } else if (r.servingsBasis === "Einzelportion" && total.kcal > 1000) {
        r.servings = Math.max(1, Math.round(total.kcal / target));
        r.servingsUnit = "Portionen"; r.servingsBasis = "geschätzt aus Energie (" + target + " kcal je Portion)";
      }
    }
    if (r.yieldPending && grams > 0) r.yieldText = "ergibt ca. " + (grams >= 100 ? Math.round(grams / 50) * 50 : Math.round(grams / 10) * 10) + " g";
    var serv = portionen || r.servings || null;
    var per = {};
    NUTRIENT_KEYS.forEach(function (k) {
      var v = serv ? total[k] / serv : total[k];
      per[k] = k === "kcal" ? Math.round(v) : round(v, v < 10 ? 1 : 0);
    });
    var nutrition = {
      perServing: !!serv, servings: serv, values: per, perUnit: r.servingsUnit === "Stück" || r.servingsUnit === "Scheiben" ? "Stück" : "Portion",
      coverage: { matched: matched.length, unmatched: unmatched, withoutQuantity: noQty, share: round(share, 2) },
      reliable: reliable, totalGrams: Math.round(grams),
      details: matched,
      basis: "berechnet",
      source: tabelle && tabelle.meta ? tabelle.meta.quelle : "Bundeslebensmittelschlüssel (BLS) 4.0"
    };
    r.nutrition = nutrition;
    // Berechnete Labels ersetzen frühere Creator-/Blog-Angaben gleichen Namens nur, wenn verlässlich
    if (nutrition.reliable && serv) {
      var calc = focusFromNutrition(per, "berechnet");
      if (per.kcal && per.kcal <= 400 && r.category === "Hauptgericht") calc.push({ label: "unter 400 kcal", basis: "berechnet" });
      var keep = (r.focus || []).filter(function (f) { return !calc.some(function (c) { return c.label === f.label; }) && f.basis !== "berechnet"; });
      r.focus = calc.concat(keep);
    }
    if (r.labels) r.labels = buildLabels(r);
    return nutrition;
  }

  // ---------------------------------------------------------------------------
  // "Einmal zuordnen": Vorschläge aus dem ganzen BLS (daten/bls-suche.json, lädt die App bei Bedarf)
  // ---------------------------------------------------------------------------

  var SUGGEST_SYNONYMS = {
    "veganer": "vegan", "vegane": "vegan", "veganes": "vegan", "reibekäse": "käsealternative", "streukäse": "käsealternative", "käse": "käse",
    "pflanzliche": "vegan", "pflanzlicher": "vegan", "kochcreme": "kochcreme", "agavendicksaft": "sirup", "nudeln": "teigwaren", "nudel": "teigwaren",
    "pasta": "teigwaren", "spaghetti": "teigwaren", "sahne": "sahne", "joghurt": "joghurt", "mehl": "mehl", "mehlmischung": "mehl", "kekse": "keks"
  };
  function suggestTokens(s) {
    return lower(s).replace(/[^a-zäöüß\s-]/g, " ").split(/[\s-]+/).filter(function (w) { return w.length > 2; }).map(function (w) {
      w = SUGGEST_SYNONYMS[w] || w;
      return w.replace(/(en|er|e|n|s)$/, "");
    });
  }
  /**
   * Vorschläge für eine unbekannte Zutat. suche = Inhalt von daten/bls-suche.json.
   * Gibt bis zu n Treffer { bls, name, kcal, score, entry } zurück; entry passt direkt in opts.zuordnungen.
   */
  function zuordnungsVorschlaege(name, suche, n) {
    if (!suche || !suche.eintraege) return [];
    var q = suggestTokens(normName(name) + " " + name);
    var tr = translateIngredient(name); if (tr) q = q.concat(suggestTokens(tr.display.split("~")[0]));
    q = uniq(q);
    var F = suche.felder, out = [];
    suche.eintraege.forEach(function (e) {
      var nm = lower(e[1]), en = lower(e[2] || ""), score = 0;
      q.forEach(function (t) {
        if (nm.indexOf(t) === 0) score += 3; else if (nm.indexOf(t) !== -1) score += 2; else if (en.indexOf(t) !== -1) score += 1;
      });
      if (!score) return;
      if (/\broh\b/.test(nm)) score += 0.5;
      var dishWord = nm.match(/(kuchen|torte|gebäck|plätzchen|brot|eintopf|suppe|salat|auflauf|pfanne|bratling)/);
      if (dishWord && !q.some(function (t) { return dishWord[1].indexOf(t) !== -1 || t.indexOf(dishWord[1].slice(0, 4)) !== -1; })) score -= 2;
      if (/(gebraten|frittiert|paniert|mit |konserve|zubereitet|gegart|gekocht)/.test(nm) && !/(gekocht|gebraten)/.test(lower(name))) score -= 1;
      score -= nm.length / 200;
      out.push({ e: e, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, n || 5).map(function (o) {
      var e = o.e, nObj = {};
      for (var k = 3; k < F.length; k++) if (e[k] != null) nObj[F[k]] = e[k];
      return { bls: e[0], name: e[1], kcal: nObj.kcal, score: round(o.score, 1), entry: { bls: e[0], name: e[1], n: nObj } };
    });
  }

  // ---------------------------------------------------------------------------
  // Instagram-Datenexport (offizieller Download) -> Linkliste
  // ---------------------------------------------------------------------------

  var IG_LINK = /https?:\/\/(?:www\.)?instagram\.com\/(?:[^\/\s"?]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

  function shortcodeOf(url) { var m = String(url || "").match(IG_LINK); return m ? m[2] : null; }

  // Metas Exporte speichern UTF-8 oft doppelt kodiert ("fÃ¼r" statt "für").
  // Eigene kleine Dekodierung, damit es auch ohne TextDecoder (JavaScriptCore) läuft.
  function fixMojibake(s) {
    if (typeof s !== "string" || !/[Â-ô][\u0080-¿]/.test(s)) return s;
    for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 255) return s;
    var out = "", b = 0, need = 0, cp = 0;
    for (var j = 0; j < s.length; j++) {
      b = s.charCodeAt(j);
      if (need === 0) {
        if (b < 0x80) { out += s[j]; continue; }
        if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; }
        else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; }
        else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; }
        else return s;
      } else {
        if ((b & 0xc0) !== 0x80) return s;
        cp = (cp << 6) | (b & 0x3f);
        if (--need === 0) out += String.fromCodePoint(cp);
      }
    }
    return need ? s : out;
  }

  // Liest eine Label-Liste der neuen Exporte: [{label, value, href}, {title:"Eigentümer", dict:[…]}, …]
  function readLabels(list) {
    var res = { labels: {}, owner: null, media: null };
    (list || []).forEach(function (e) {
      if (!e || typeof e !== "object") return;
      if (e.label) {
        var v = e.href || e.value;
        if (v == null && e.timestamp_value) v = e.timestamp_value;
        res.labels[fixMojibake(e.label)] = typeof v === "string" ? fixMojibake(v) : v;
        if (e.href && e.value && e.href !== e.value) res.labels[fixMojibake(e.label) + "_text"] = fixMojibake(e.value);
        return;
      }
      var title = fixMojibake(e.title || "");
      if (Array.isArray(e.dict)) {
        if (/eigentümer|owner|besitzer|inhaber/i.test(title)) {
          var o = e.dict[0] && Array.isArray(e.dict[0].dict) ? readLabels(e.dict[0].dict).labels : readLabels(e.dict).labels;
          res.owner = o;
        } else if (/medien|media|beiträge|posts|elemente|items/i.test(title) || e.dict.some(function (x) { return x && Array.isArray(x.dict); })) {
          if (!/hashtags|markenpartner|brand/i.test(title)) res.media = (res.media || []).concat(e.dict);
        }
      }
    });
    return res;
  }

  /**
   * Liest den offiziellen Instagram-Export (saved_posts.json, saved_collections.json,
   * alte und neue Formate). Mehrere Dateien als Array übergeben.
   * Ergebnis je Post: { id, url, account, caption, ownerName, ownerUrl (Bio-Link),
   *                      collections[], collection, savedAt }
   */
  function parseInstagramExport(data) {
    var byId = {}, order = [];
    function canon(href) {
      var m = String(href || "").match(IG_LINK);
      return m ? { id: m[2], url: "https://www.instagram.com/" + (m[1] === "reels" ? "reel" : m[1]) + "/" + m[2] + "/" } : null;
    }
    function upsert(href, info, collection, ts) {
      var c = canon(href);
      if (!c) return;
      var p = byId[c.id];
      if (!p) { p = byId[c.id] = { id: c.id, url: c.url, account: "", caption: "", ownerName: "", ownerUrl: "", collections: [], savedAt: null }; order.push(c.id); }
      if (info) {
        p.caption = p.caption || info.caption || "";
        p.account = p.account || info.account || "";
        p.ownerName = p.ownerName || info.ownerName || "";
        p.ownerUrl = p.ownerUrl || info.ownerUrl || "";
      }
      if (collection && p.collections.indexOf(collection) === -1) p.collections.push(collection);
      if (ts && (!p.savedAt || ts > p.savedAt)) p.savedAt = ts;
    }
    function fromLabels(r) {
      var L = r.labels, o = r.owner || {};
      var ownerUrl = o.URL || o.Url || o.url || "";
      return {
        caption: L.Untertitel || L.Caption || L.Bildunterschrift || L.Titel || L.Title || "",
        account: (o.Benutzername || o.Username || o["User name"] || L.Benutzername || L.Username || "").replace(/^@/, ""),
        ownerName: o.Name || "",
        ownerUrl: IG_LINK.test(ownerUrl) || /instagram\.com/i.test(ownerUrl) ? "" : ownerUrl
      };
    }
    var current = null;
    (function visit(node, collection) {
      if (Array.isArray(node)) { node.forEach(function (n) { visit(n, collection); }); return; }
      if (!node || typeof node !== "object") return;
      // Neues Format: label_values bzw. dict-Listen
      var list = Array.isArray(node.label_values) ? node.label_values : (Array.isArray(node.dict) && node.dict.some(function (x) { return x && x.label; }) ? node.dict : null);
      if (list) {
        var r = readLabels(list);
        var href = r.labels.URL || r.labels.Url || r.labels.Link;
        if (href && IG_LINK.test(href)) { upsert(href, fromLabels(r), collection, node.timestamp); return; }
        var name = r.labels.Name || r.labels.Sammlung || r.labels.Collection;
        if (name && r.media) {
          var coll = clean(name);
          r.media.forEach(function (m) {
            var inner = m && Array.isArray(m.dict) ? readLabels(m.dict) : (m && m.label_values ? readLabels(m.label_values) : null);
            if (!inner) return;
            var h = inner.labels.URL || inner.labels.Url;
            if (h) upsert(h, fromLabels(inner), coll, node.timestamp);
          });
          return;
        }
      }
      // Altes Format: string_map_data
      var smd = node.string_map_data;
      if (smd && typeof smd === "object") {
        var link = null, nm = null, ts = null;
        Object.keys(smd).forEach(function (k) {
          var v = smd[k];
          if (!v || typeof v !== "object") return;
          if (v.href && IG_LINK.test(v.href)) link = { href: v.href, account: v.value };
          else if (/name/i.test(k) && v.value && !v.href) nm = v.value;
          if (v.timestamp) ts = v.timestamp;
        });
        if (link) { upsert(link.href, { account: fixMojibake(link.account || node.title || "") }, current, ts); return; }
        if (nm) { current = clean(fixMojibake(nm)); return; }
      }
      Object.keys(node).forEach(function (k) { if (node[k] && typeof node[k] === "object") visit(node[k], collection); });
    })(data, null);
    // Notfall: irgendein Format – alle Links per Muster suchen
    if (!order.length) {
      var s = typeof data === "string" ? data : JSON.stringify(data);
      var re = new RegExp(IG_LINK.source, "g"), m;
      while ((m = re.exec(s)) !== null) upsert(m[0], null, "Import");
    }
    return order.map(function (id) {
      var p = byId[id];
      p.collection = p.collections[0] || "Ohne Sammlung";
      return p;
    });
  }

  /**
   * Liest die Caption aus der öffentlichen Einbettungsseite eines Posts
   * (instagram.com/p/…/embed/captioned/), wie sie der Kurzbefehl ohne Login holt.
   * Nimmt HTML oder bereits umgewandelten Text (deutsche oder englische Oberfläche).
   * Gibt { account, caption } zurück oder null.
   */
  function parseInstagramEmbed(input) {
    var s = String(input || "");
    if (!s) return null;
    // 1) HTML: <div class="Caption"><a class="CaptionUsername">user</a>…Text…<div class="CaptionComments">
    var m = s.match(/class="Caption"[^>]*>([\s\S]*?)(?:<div class="CaptionComments"|<\/div>\s*<div class="CaptionComments")/i);
    if (m) {
      var acc = (m[1].match(/class="CaptionUsername"[^>]*>([^<]+)</i) || [])[1] || "";
      var body = m[1].replace(/<a[^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/i, "");
      return { account: clean(decodeEntities(acc)), caption: stripTags(body.replace(/<br\s*\/?>/gi, "\n")).replace(/[ \t]+\n/g, "\n").trim() };
    }
    // 2) Text: "… Gefällt 23.187 Mal <user> <Caption> Alle 238 Kommentare ansehen …"
    var t = s.replace(/\r/g, "");
    var start = t.match(/(?:Gefällt|Liked by|likes?)\s*[\d.,]+\s*(?:Mal|times)?\s+([A-Za-z0-9._]+)\s+/i) ||
                t.match(/(?:Speichern|Save)\s+([A-Za-z0-9._]+)\s+/i);
    if (!start) return null;
    var rest = t.slice(start.index + start[0].length);
    var end = rest.search(/\s*(?:Alle\s+[\d.,]+\s+Kommentare ansehen|View all\s+[\d.,]+\s+comments|Kommentieren\s*…|Add a comment)/i);
    var cap = (end >= 0 ? rest.slice(0, end) : rest).replace(/\s*…?\s*Instagram\s*$/, "").trim();
    return cap ? { account: start[1], caption: cap } : null;
  }

  /**
   * Ist das überhaupt ein Rezept? (Viele gespeicherte Posts sind Reisetipps, Sport, …)
   * Gibt { recipe: bool, score, reasons[] } zurück. Arbeitet auf einem analyse()-Ergebnis.
   */
  var RECIPE_TAGS = /#(rezept\w*|recipe\w*|easyrecipe\w*|veganrecipe\w*|healthyrecipe\w*|veganerezepte|gesunderezepte|foodinspo|cooking|kochen|backen|baking|mealprep\w*|dinnerideas?|lunchideas?|breakfastideas?|frühstücksideen|abendessen|mittagessen|veganfood|plantbased\w*|pasta\w*|noodles|soup\w*|salad\w*|dessert\w*|cake\w*|cheesecake|onepot\w*|airfryer\w*|highprotein\w*|proteinreich)\b/i;
  var NOT_RECIPE = /(restaurant|restaurants|café|cafés|\bcafe\b|\bspots?\b|on the menu|auf der karte|foodguide|food guide|\bvisit\b|eröffnet|neueröffnung|opening|guide to|tipps für .{0,30}(essen|dinner)|best .{0,20} in (munich|münchen|hamburg|berlin|copenhagen|kopenhagen))/i;

  /**
   * Was für ein Post ist das? Gibt { typ, wo, rezept, gericht, hinweis, score } zurück.
   *  typ: "vollständig" | "unvollständig" | "anderswo" | "kein Rezept"
   *  wo:  "caption" | "blog" | "bio" | "kommentar" | "nachricht" | "kochbuch" | "newsletter" | "video" | null
   */
  function postType(res, caption, url) {
    var r = res.recipe, raw = normalizeFancy(caption || ""), t = lower(raw), score = 0, reasons = [];
    var withQty = r.ingredients.filter(function (i) { return i.qty != null && (i.unit || i.aisle !== "Sonstiges"); }).length;
    if (withQty >= 3) { score += 3; reasons.push(withQty + " Zutaten mit Menge"); }
    else if (withQty >= 1) score += 1;
    if (raw.split(/\n/).some(function (l) { var p = clean(stripEmoji(l)); return HEAD_ING.test(p) || HEAD_STEP.test(p); }) || /\b(zutaten|ingredients|zubereitung|instructions|method)\b/.test(t)) { score += 2; reasons.push("Rezept-Überschrift"); }
    if (/\b(rezept|recipe|portionen|servings|serves|backen|kochen|ofen|pfanne|thermomix|meal ?prep|airfryer|kcal)\b/.test(t)) { score += 1; reasons.push("Koch-Wörter"); }
    if (/(\d+\s?(g|ml|el|tl)\b)/.test(t)) score += 1;
    // Ist überhaupt ein Gericht zu sehen?
    var dish = 0;
    if (FOOD_HINT.test(r.titleOriginal || r.title) || FOOD_HINT.test(r.title)) dish += 2;
    if (RECIPE_TAGS.test(raw)) dish += 2;
    if (r.ingredients.length >= 3) dish += 2;
    if (/\b(rezept|recipe|recette)\b/.test(t)) dish += 1;
    if (NOT_RECIPE.test(t)) { dish -= 4; score -= 2; reasons.push("eher Restaurant-/Reisetipp"); }
    var where = r.elsewhere || null;
    var isReel = /\/(reel|reels|tv)\//.test(url || r.source.url || "");
    var c = res.completeness;
    var out = { score: score, gericht: dish >= 3, reasons: reasons, wo: null, typ: "kein Rezept", rezept: false, hinweis: "" };
    if (c.enough && score >= 3) { out.typ = "vollständig"; out.wo = "caption"; out.rezept = true; return out; }
    if (score >= 3 || (dish >= 3 && (where || isReel || r.ingredients.length >= 3))) {
      out.rezept = true;
      if (where) { out.typ = "anderswo"; out.wo = where.wo; reasons.push("Rezept " + WO_TEXT[where.wo]); }
      else if (isReel) { out.typ = "unvollständig"; out.wo = "video"; reasons.push("Rest vermutlich im Video"); }
      else { out.typ = "unvollständig"; out.wo = "caption"; }
      out.hinweis = WO_HINWEIS[out.wo] || "";
    }
    return out;
  }
  var WO_TEXT = { blog: "auf dem Blog", bio: "im Bio-Link", kommentar: "im Kommentar", nachricht: "per Nachricht", kochbuch: "im Kochbuch",
    newsletter: "im Newsletter", video: "im Video", caption: "in der Caption" };
  var WO_HINWEIS = {
    blog: "Das Rezept steht auf dem Blog des Creators. Link öffnen, Zutaten und Zubereitung kopieren und hier mit „Fehlenden Text einfügen“ ergänzen.",
    bio: "Das Rezept liegt hinter dem Link im Instagram-Profil. Dort kopieren und hier mit „Fehlenden Text einfügen“ ergänzen.",
    kommentar: "Das Rezept steht im angepinnten Kommentar. In Instagram kopieren und hier mit „Fehlenden Text einfügen“ ergänzen.",
    nachricht: "Der Creator verschickt das Rezept per Nachricht. Die Nachricht kopieren und hier mit „Fehlenden Text einfügen“ ergänzen.",
    kochbuch: "Das Rezept steht im Kochbuch des Creators. Text per Live-Text vom Foto der Seite kopieren und hier einfügen.",
    newsletter: "Das Rezept steht im Newsletter des Creators. Von dort kopieren und hier mit „Fehlenden Text einfügen“ ergänzen.",
    video: "Das Rezept steckt nur im Video. Zutaten und Schritte per Live-Text aus einem Bildschirmfoto kopieren und hier einfügen.",
    caption: "Es fehlen noch Angaben. Wenn du den Rest hast: „Fehlenden Text einfügen“."
  };

  // Kompatibel zu v0.1: { recipe, score, reasons }
  function recipeLikelihood(res, caption, url) {
    var p = postType(res, caption, url);
    return { recipe: p.rezept, score: p.score, reasons: p.reasons, typ: p.typ, wo: p.wo, hinweis: p.hinweis };
  }

  // ---------------------------------------------------------------------------
  // Bibliothek: erneuter Import, Folgen-Vorschlag
  // ---------------------------------------------------------------------------

  // Eindeutige ID eines Rezepts: Instagram-Kurzcode, sonst Blog-Adresse, sonst Titel
  function recipeId(r) {
    var sc = shortcodeOf(r.source && r.source.url);
    if (sc) return "ig:" + sc;
    if (r.source && r.source.blogUrl) return "web:" + String(r.source.blogUrl).replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
    return "t:" + normName(r.title || "").replace(/\s+/g, "-");
  }

  /**
   * Erneuter Import (Export oder Teilen): nur Neues übernehmen, Vorhandenes nie überschreiben.
   * vorhanden = Array oder Set von IDs (oder Objekt {id: …}); posts = Ergebnis von parseInstagramExport.
   * Gibt { neu: [...], vorhanden: [...] } zurück.
   */
  function importNeue(vorhanden, posts) {
    var has = {};
    if (Array.isArray(vorhanden) || (vorhanden && typeof vorhanden.has === "function")) vorhanden.forEach(function (id) { has[id] = 1; });
    else if (vorhanden) Object.keys(vorhanden).forEach(function (id) { has[id] = 1; });
    var neu = [], alt = [];
    (posts || []).forEach(function (p) {
      var id = p.id ? "ig:" + p.id : recipeId(p.recipe || p);
      (has[id] ? alt : neu).push(p);
      has[id] = 1; // Doppelte im selben Import nur einmal
    });
    return { neu: neu, vorhanden: alt };
  }

  /**
   * Folgen-Vorschlag (A6): nach dem 1. gespeicherten Rezept eines Kanals fragen;
   * wurde schon gefragt (egal ob gefolgt oder nicht), erst wieder ab dem 7. Rezept dieses Kanals.
   * stand = { [account]: { rezepte, gefragtBei, antwort } } – wird verändert und zurückgegeben.
   * Gibt { fragen: bool, account, profilUrl, stand } zurück. Folgen tippt der Nutzer selbst in Instagram.
   */
  var FOLGEN_ERNEUT_AB = 7;
  function folgenVorschlag(stand, account) {
    stand = stand || {};
    var a = String(account || "").replace(/^@/, "");
    if (!a) return { fragen: false, stand: stand };
    var s = stand[a] || (stand[a] = { rezepte: 0, gefragtBei: [], antwort: null });
    s.rezepte++;
    var fragen = false;
    if (s.antwort === "nie") fragen = false;
    else if (!s.gefragtBei.length) fragen = true;
    else if (s.gefragtBei.length === 1 && s.rezepte >= FOLGEN_ERNEUT_AB) fragen = true;
    if (fragen) s.gefragtBei.push(s.rezepte);
    return { fragen: fragen, account: a, profilUrl: "https://www.instagram.com/" + encodeURIComponent(a) + "/", stand: stand };
  }
  // Antwort merken: "gefolgt" | "später" | "nie"
  function folgenAntwort(stand, account, antwort) {
    var a = String(account || "").replace(/^@/, "");
    if (stand && stand[a]) stand[a].antwort = antwort;
    return stand;
  }

  // ---------------------------------------------------------------------------
  // Blog-Suche (A2): Suchplan, Kandidaten bewerten, Treffer per Zutaten-Abgleich prüfen.
  // Der Kern holt nichts selbst (kein Netzwerk). Er sagt der App/dem Kurzbefehl, was in welcher
  // Reihenfolge abgerufen werden soll, und wertet die Antworten aus.
  // "via": "app" = WordPress-Schnittstelle (erlaubt Abrufe aus der Web-App), "kurzbefehl" = normale Seite.
  // ---------------------------------------------------------------------------

  var TITLE_FILLER = /\b(best|easy|quick|simple|healthy|high protein|vegan|the|ultimate|perfect|viral|einfache[rsn]?|schnelle[rsn]?|beste[rsn]?|gesunde[rsn]?|vegane[rsn]?|proteinreiche[rsn]?|rezept|recipe)\b/gi;
  function blogDomain(r, ownerUrl) {
    var cand = [].concat(r.links || [], ownerUrl ? [ownerUrl] : []);
    for (var i = 0; i < cand.length; i++) {
      var m = String(cand[i]).match(/^https?:\/\/([^\/?#]+)/i);
      if (m && !/(instagram|linktr\.ee|beacons|tiktok|youtube|youtu\.be|facebook|amazon|amzn|bit\.ly|later\.com|linkin\.bio|stan\.store|taplink|campsite|komi)/i.test(m[1])) return m[1].replace(/^www\./, "");
    }
    return null;
  }
  function linkHub(ownerUrl) { return /(linktr\.ee|beacons\.ai|linkin\.bio|taplink|campsite\.bio|stan\.store|komi\.io|later\.com)/i.test(ownerUrl || "") ? ownerUrl : null; }

  /**
   * Suchplan für das Blog-Rezept. Gibt eine geordnete Liste von Abrufen zurück (höchstens 6).
   * r = Rezept aus der Caption, ctx = { caption, ownerUrl }.
   */
  function blogSuchplan(r, ctx) {
    ctx = ctx || {};
    var dom = blogDomain(r, ctx.ownerUrl), plan = [];
    var title = r.titleOriginal || r.title || "";
    var short = clean(title.replace(TITLE_FILLER, " ").replace(/[()&+]/g, " "));
    var mains = (r.ingredients || []).filter(function (i) { return !i.staple && !isSpice(i); }).slice(0, 2).map(function (i) { return i.nameOriginal || i.name; }).join(" ");
    var tags = (String(ctx.caption || "").match(/#[A-Za-z]{5,30}/g) || []).map(function (h) { return h.slice(1); })
      .filter(function (h) { return !/(vegan|recipe|rezept|food|healthy|easy|instagood|foodie|reels?|viral|fyp|explore|lover|ideas|inspo)/i.test(h); }).slice(0, 1);
    var direct = (r.links || []).filter(function (u) { return /^https?:\/\/[^\/]+\/.+/.test(u) && !/(instagram|linktr)/i.test(u); });
    if (direct.length) plan.push({ schritt: "link", via: "kurzbefehl", url: direct[0], zweck: "Direkter Link aus der Caption" });
    if (dom) {
      var api = "https://" + dom + "/wp-json/wp/v2/posts?_fields=link,title,date&per_page=10";
      plan.push({ schritt: "neueste", via: "app", url: api, zweck: "Neueste Beiträge (Reels bewerben meist neue Rezepte)" });
      [title, short, mains, tags[0]].filter(function (q, i, a) { return q && q.length > 2 && a.indexOf(q) === i; }).forEach(function (q) {
        plan.push({ schritt: "suche", via: "app", url: api + "&search=" + encodeURIComponent(q), suchbegriff: q, zweck: "Suche nach „" + q + "“" });
      });
    }
    var hub = linkHub(ctx.ownerUrl);
    if (hub) plan.push({ schritt: "linkseite", via: "kurzbefehl", url: hub, zweck: "Bio-Link-Seite nach passenden Titeln durchsuchen" });
    if (dom && !plan.some(function (p) { return p.via === "kurzbefehl" && p.schritt !== "linkseite"; })) {
      plan.push({ schritt: "seitensuche", via: "kurzbefehl", url: "https://" + dom + "/?s=" + encodeURIComponent(short || title), zweck: "Suchseite des Blogs" });
    }
    return plan.slice(0, 6);
  }

  // Kandidaten aus einer Antwort lesen: WordPress-JSON, RSS/Atom oder HTML (Links mit Text)
  function blogKandidaten(antwort, basisUrl) {
    var out = [];
    if (antwort && typeof antwort === "object") {
      (Array.isArray(antwort) ? antwort : [antwort]).forEach(function (p) {
        if (p && p.link) out.push({ url: p.link, titel: clean(stripTags(p.title && p.title.rendered != null ? p.title.rendered : p.title || "")) });
      });
      return out;
    }
    var s = String(antwort || "");
    var m, re;
    if (/<rss|<feed/i.test(s)) {
      re = /<(?:item|entry)\b[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>[\s\S]*?(?:<link[^>]*href="([^"]+)"|<link>([\s\S]*?)<\/link>)/gi;
      while ((m = re.exec(s)) !== null) out.push({ url: clean(m[2] || m[3]), titel: clean(stripTags(m[1].replace(/<!\[CDATA\[|\]\]>/g, ""))) });
      return out;
    }
    re = /<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re.exec(s)) !== null) {
      var t = clean(stripTags(m[2]));
      if (t.length < 4 || t.length > 120) continue;
      var u = m[1];
      if (basisUrl && /^\//.test(u)) u = String(basisUrl).replace(/^(https?:\/\/[^\/]+).*$/, "$1") + u;
      if (/^https?:/.test(u)) out.push({ url: u, titel: t });
    }
    return out;
  }

  // Wie gut passt ein Kandidat zum Post? Wort-Überlappung des Titels (Original und Deutsch)
  function bewerteKandidat(k, r) {
    var a = uniq(suggestTokens((r.titleOriginal || "") + " " + (r.title || "")).filter(function (t) { return !/^(best|easy|quick|vegan|the|with|and|und|mit)$/.test(t); }));
    var b = suggestTokens(k.titel + " " + decodeURIComponent(String(k.url).replace(/^https?:\/\/[^\/]+/, "").replace(/[-_\/]/g, " ")));
    if (!a.length) return 0;
    var hit = a.filter(function (t) { return b.some(function (x) { return x === t || (t.length > 4 && x.indexOf(t) === 0); }); }).length;
    return round(hit / a.length, 2);
  }
  function besteKandidaten(kandidaten, r, n) {
    return (kandidaten || []).map(function (k) { return { url: k.url, titel: k.titel, passung: bewerteKandidat(k, r) }; })
      .filter(function (k) { return k.passung >= 0.5; }).sort(function (x, y) { return y.passung - x.passung; }).slice(0, n || 3);
  }

  /**
   * Treffer prüfen: Stimmen die Zutaten des Blog-Rezepts mit den in der Caption genannten überein?
   * Gibt { passt, anteil, gemeinsam[] } zurück. Ohne Caption-Zutaten entscheidet der Titel.
   */
  function pruefeBlogTreffer(captionRezept, blogRezept) {
    var a = (captionRezept.ingredients || []).filter(function (i) { return !i.staple; }).map(function (i) { return i.key; });
    var b = (blogRezept.ingredients || []).map(function (i) { return i.key; });
    if (!b.length) return { passt: false, anteil: 0, gemeinsam: [] };
    if (a.length < 2) {
      var t = bewerteKandidat({ titel: blogRezept.title, url: "" }, captionRezept);
      return { passt: t >= 0.5, anteil: t, gemeinsam: [], basis: "Titel" };
    }
    var same = a.filter(function (k) { return b.some(function (x) { return x === k || x.indexOf(k) !== -1 || k.indexOf(x) !== -1; }); });
    var share = same.length / a.length;
    return { passt: share >= 0.6, anteil: round(share, 2), gemeinsam: same, basis: "Zutaten" };
  }

  /**
   * Rezept-HTML ohne schema.org-Daten lesen (Rezeptkarten von WP Recipe Maker und Tasty Recipes),
   * z. B. aus content.rendered der WordPress-Schnittstelle. Gibt Teil-Rezept oder null.
   */
  function parseRecipeHtml(html, pageUrl) {
    var s = String(html || "");
    var viaSchema = parseSchemaOrg(s, pageUrl);
    if (viaSchema && viaSchema.ingredients.length) return viaSchema;
    function all(re) { var out = [], m; while ((m = re.exec(s)) !== null) out.push(clean(stripTags(m[1]))); return out.filter(Boolean); }
    var ings = all(/<li[^>]*class="[^"]*(?:wprm-recipe-ingredient|tasty-recipes-ingredients?-item)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi);
    if (!ings.length) {
      var block = s.match(/class="[^"]*(?:tasty-recipes-ingredients|wprm-recipe-ingredients-container)[^"]*"[\s\S]*?<\/(?:ul|div)>/i);
      if (block) { s = block[0] + s; ings = all(/<li[^>]*>([\s\S]*?)<\/li>/gi).slice(0, 40); }
    }
    if (!ings.length) return null;
    var steps = all(/<(?:div|li)[^>]*class="[^"]*(?:wprm-recipe-instruction-text|tasty-recipes-instructions?-item)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi);
    if (!steps.length) {
      var ib = String(html).match(/class="[^"]*tasty-recipes-instructions[^"]*"[\s\S]*?<\/ol>/i);
      if (ib) steps = (ib[0].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []).map(function (x) { return clean(stripTags(x)); });
    }
    var r = emptyRecipe();
    r.title = (all(/class="[^"]*(?:wprm-recipe-name|tasty-recipes-title)[^"]*"[^>]*>([\s\S]*?)<\//gi)[0]) || "";
    r.servings = num((all(/class="[^"]*(?:wprm-recipe-servings(?!-)|tasty-recipes-yield)[^"]*"[^>]*>([\s\S]*?)<\//gi)[0]) || "");
    r.ingredients = ings.map(parseIngredientLine).filter(Boolean);
    r.steps = steps.map(cleanStep).filter(function (x) { return x.length > 2; });
    var tt = all(/class="[^"]*(?:wprm-recipe-total_time|tasty-recipes-total-time)[^"]*"[^>]*>([\s\S]*?)<\//gi).join(" ");
    r.timeTotal = parseDuration(tt) || null;
    r.source.blogUrl = pageUrl || "";
    markProvenance(r, "blog");
    return r;
  }

  // ---------------------------------------------------------------------------

  var api = {
    VERSION: VERSION, SCHEMA_VERSION: SCHEMA_VERSION,
    KATEGORIEN: KATEGORIEN, AISLES: AISLES,
    analyse: analyse, analyseWithModel: analyseWithModel,
    parseText: parseText, parseTranscript: parseTranscript, parseSchemaOrg: parseSchemaOrg,
    parseIngredientLine: parseIngredientLine, parseDuration: parseDuration,
    classify: classify, completeness: completeness, focusFromNutrition: focusFromNutrition,
    berechneNaehrwerte: berechneNaehrwerte, findNutrientEntry: findNutrientEntry, NUTRIENT_KEYS: NUTRIENT_KEYS,
    normName: normName, fmtQty: fmtQty, fmtIngredient: fmtIngredient, scaleRecipe: scaleRecipe,
    shoppingList: shoppingList, shoppingText: shoppingText,
    toCookidoo: toCookidoo, toSchemaOrg: toSchemaOrg,
    parseInstagramExport: parseInstagramExport, shortcodeOf: shortcodeOf, extractUrls: extractUrls,
    recipeLikelihood: recipeLikelihood, fixMojibake: fixMojibake, parseInstagramEmbed: parseInstagramEmbed,
    translateTitle: translateTitle, polishTitle: polishTitle, translateIngredient: translateIngredient, translateNote: translateNote,
    buildLabels: buildLabels, LABEL_GRUPPEN: LABEL_GRUPPEN, GRUNDVORRAT: GRUNDVORRAT, standardVorrat: standardVorrat, vorratsSchluessel: vorratsSchluessel,
    extractInlineIngredients: extractInlineIngredients, isStepLike: isStepLike, postType: postType, normalizeFancy: normalizeFancy, zuordnungsVorschlaege: zuordnungsVorschlaege,
    recipeId: recipeId, importNeue: importNeue, folgenVorschlag: folgenVorschlag, folgenAntwort: folgenAntwort, FOLGEN_ERNEUT_AB: FOLGEN_ERNEUT_AB,
    blogSuchplan: blogSuchplan, blogKandidaten: blogKandidaten, besteKandidaten: besteKandidaten, pruefeBlogTreffer: pruefeBlogTreffer,
    parseRecipeHtml: parseRecipeHtml, inferServings: inferServings, uebersetzeSchritte: uebersetzeSchritte, uebersetzeZutaten: uebersetzeZutaten, mergeFrameText: mergeFrameText, isEnglishTitle: isEnglishTitle, stepIngredients: stepIngredients, parseTranscript: parseTranscript, detectLang: detectLang, rezeptStil: rezeptStil, cleanSteps: cleanSteps, langOfText: langOfText, dropEnglishHalf: dropEnglishHalf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RezeptKern = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
