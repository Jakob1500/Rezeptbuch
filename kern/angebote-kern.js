/*
 * Kombüse – Angebote-Kern
 * Reine Funktionen, kein Netzwerk, kein LLM.
 * Aufgabe: Angebote vereinheitlichen, mit der Einkaufsliste abgleichen,
 *          Kosten und Ersparnis rechnen und den passenden Laden vorschlagen.
 * Die Angebote holt später ein Kurzbefehl auf dem Gerät des Nutzers; sie bleiben auf dem Gerät.
 */
(function (root) {
  "use strict";
  var VERSION = "0.2.0";

  // ------------------------------------------------------------------ Hilfen
  function lower(s) { return String(s || "").toLowerCase(); }
  function zahl(s) {
    if (s == null) return null;
    var m = String(s).replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(",", ".")) : null;
  }
  function rund(x, n) { var f = Math.pow(10, n || 2); return Math.round(x * f) / f; }
  function datum(d) { return d instanceof Date ? d : new Date(String(d).length === 10 ? d + "T00:00:00" : d); }
  function tag(d) { var x = datum(d); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); }

  // Wörter für den Vergleich: klein, Umlaute vereinheitlicht, Mehrzahl gekürzt
  var UNREGELMAESSIG = { "äpfel": "apfel", "apfel": "apfel", "nüsse": "nuss", "nuss": "nuss", "eier": "ei", "ei": "ei" };
  function stamm(w) {
    w = lower(w);
    if (UNREGELMAESSIG[w]) return UNREGELMAESSIG[w];
    w = w.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
    if (w.length > 4) w = w.replace(/(en|er|n|e|s)$/, "");
    return w;
  }
  function woerter(s) { return lower(s).split(/[^a-zäöüß]+/).filter(function (w) { return w.length > 1; }); }

  // ------------------------------------------------------------------ Mengen und Preise
  /**
   * Menge aus Text: "500 g", "1kg", "1,5 l", "6 x 1,5 l", "4 Stück", "lose", "300g" ...
   * -> { g: Gramm, ml: Milliliter, stk: Stück, lose: true }  (nur das Passende ist gesetzt)
   */
  function parseMenge(text) {
    var t = lower(text).replace(/\u00a0/g, " ").replace(/(\d)\s*-\s*(kg|g|ml|cl|l)-/g, "$1 $2 ").replace(/(\d)\s*-\s*(kg|g|ml|cl|l)\b/g, "$1 $2");
    if (!t) return null;
    if (/\bkg-preis\b/.test(t)) return { lose: true };
    var er = t.match(/(\d+)er-?(?:packung|pack|schale|karton)/);
    if (er) return { stk: parseInt(er[1], 10) };
    if (/\blose\b|\bje kg\b|\bper kg\b|\b1 kg = \b/.test(t) && !/\d+\s*(g|kg|ml|l)\b/.test(t.replace(/1\s*kg\s*=.*/, ""))) return { lose: true };
    var faktor = 1;
    var mx = t.match(/(\d+)\s*[x×]\s*(?=\d)/);
    if (mx) { faktor = parseInt(mx[1], 10); t = t.replace(mx[0], ""); }
    var m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|l|liter|ml|cl|stück|stk|st\.)(?![a-zäöü])/);
    if (!m) return null;
    var v = parseFloat(m[1].replace(",", ".")) * faktor, e = m[2];
    if (e === "kg") return { g: v * 1000 };
    if (e === "g" || e === "gramm") return { g: v };
    if (e === "l" || e === "liter") return { ml: v * 1000 };
    if (e === "cl") return { ml: v * 10 };
    if (e === "ml") return { ml: v };
    return { stk: v };
  }

  /**
   * Grundpreis aus Text: "(3,38 €/1 kg)", "1kg = € 13,30", "0,17 €/100 Blatt", "1 l = 2,02 €"
   * -> { preis: Euro, je: 1000, einheit: "g" | "ml" | "stk" } oder null
   */
  function parseGrundpreis(text) {
    var t = lower(text).replace(/\u00a0/g, " ").replace(/€/g, " € ");
    var m = t.match(/(\d+(?:[.,]\d+)?)\s*€?\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(kg|g|liter|l|ml|stück|stk)\b/) ||
            t.match(/(\d+(?:[.,]\d+)?)?\s*(kg|g|l|ml|stück|stk)\s*=\s*€?\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    var preis, menge, einheit;
    if (/\//.test(m[0])) { preis = zahl(m[1]); menge = m[2] ? zahl(m[2]) : 1; einheit = m[3]; }
    else { menge = m[1] ? zahl(m[1]) : 1; einheit = m[2]; preis = zahl(m[3]); }
    if (preis == null) return null;
    if (einheit === "liter") einheit = "l";
    if (einheit === "kg") return { preis: preis, je: menge * 1000, einheit: "g" };
    if (einheit === "g") return { preis: preis, je: menge, einheit: "g" };
    if (einheit === "l") return { preis: preis, je: menge * 1000, einheit: "ml" };
    if (einheit === "ml") return { preis: preis, je: menge, einheit: "ml" };
    return { preis: preis, je: menge, einheit: "stk" };
  }

  /**
   * Ein Angebot in die einheitliche Form bringen.
   * roh: { haendler, name, marke, menge (Text), preis, streichpreis, grundpreis (Text), gueltigVon, gueltigBis, link }
   */
  function angebot(roh) {
    var a = {
      haendler: roh.haendler, name: String(roh.name || "").trim(), marke: roh.marke || "",
      mengeText: roh.menge || "", menge: parseMenge(roh.menge || roh.name),
      preis: typeof roh.preis === "number" ? roh.preis : zahl(roh.preis),
      streichpreis: roh.streichpreis == null ? null : (typeof roh.streichpreis === "number" ? roh.streichpreis : zahl(roh.streichpreis)),
      grundpreis: roh.grundpreis ? (typeof roh.grundpreis === "object" ? roh.grundpreis : parseGrundpreis(roh.grundpreis)) : null,
      gueltigVon: roh.gueltigVon || null, gueltigBis: roh.gueltigBis || null, link: roh.link || ""
    };
    // Packungsgröße notfalls aus Preis und Grundpreis
    if (!a.menge && a.preis && a.grundpreis && a.grundpreis.preis) {
      var q = a.preis / a.grundpreis.preis * a.grundpreis.je, o = {};
      o[a.grundpreis.einheit] = Math.round(q);
      a.menge = o;
    }
    if (a.streichpreis != null && a.preis != null && a.streichpreis <= a.preis) a.streichpreis = null;
    return a;
  }

  /** Abgelaufene Angebote entfernen (gueltigBis vor heute). Ohne Enddatum: gilt bis Ende der Woche (Samstag). */
  function nochGueltig(angebote, heute) {
    var h = tag(heute || new Date());
    return angebote.filter(function (a) {
      if (a.gueltigBis) return tag(a.gueltigBis) >= h;
      if (a.gueltigVon) {
        var v = datum(a.gueltigVon), sa = new Date(v); sa.setDate(v.getDate() + ((6 - v.getDay() + 7) % 7));
        return tag(sa) >= h;
      }
      return true;
    });
  }

  // ------------------------------------------------------------------ Zuordnen
  // Wörter, die aus einem Lebensmittel ein anderes Produkt machen ("Paprika Chips", "Tomaten Ketchup")
  var ANDERES_PRODUKT = ["chips", "ketchup", "mark", "sauce", "soße", "sosse", "saft", "nektar", "smoothie", "riegel", "aufstrich",
    "creme", "suppe", "pulver", "gewürz", "gewuerz", "pesto", "püree", "puree", "chutney", "konfitüre", "konfituere", "marmelade",
    "gelee", "joghurt", "eis", "kuchen", "torte", "keks", "kekse", "bonbon", "gummi", "schokolade", "likör", "likoer", "tee",
    "shampoo", "duschgel", "seife", "duft", "kerze", "pflanze", "samen", "saatgut", "topf", "dünger", "duenger", "erde",
    "snack", "cracker", "rahm", "würz", "wurz", "dekor", "glasur", "aroma", "drink", "limonade", "sirup", "bowl", "salat"];
  // Sortenwörter: unterschiedliche Sorten sind unterschiedliche Zutaten (rote ≠ weiße Zwiebel)
  var SORTEN = ["rot", "rote", "roter", "rotes", "weiß", "weiße", "weißer", "weiss", "weisse", "gelb", "gelbe", "gelber", "grün", "grüne",
    "grüner", "süß", "süße", "mehlig", "mehlige", "festkochend", "festkochende", "vorwiegend", "braun", "braune", "schwarz", "schwarze",
    "geräuchert", "gekocht", "getrocknet", "getrocknete", "tiefgekühlt", "tk"];
  // Erlaubte Zusammensetzungen: Wortanfang + Zutat (Rispen|tomate, Speise|möhre)
  var ERLAUBTE_VORSAETZE = ["rispen", "strauch", "dattel", "kirsch", "cherry", "fleisch", "speise", "bund", "baby", "mini", "bio",
    "land", "berg", "gemüse", "gemuese", "kräuter", "kraeuter", "kultur", "tafel", "koch", "salat", "frisch", "mutzarella", "büffel",
    "hähnchen", "haehnchen", "puten", "schweine", "rinder", "hack", "basmati", "jasmin", "langkorn", "vollkorn", "schlag", "creme",
    "kokos", "hafer", "soja", "mandel", "weizen", "dinkel", "roggen", "tafel", "zucchini", "zucker", "frühlings", "fruehlings", "gemüsezwiebel", "schalotten", "blut", "baum", "tafel"];

  // Erlaubte Endungen: Zutat + Endung (Lachsfilet|portionen, Hähnchenbrust|filet)
  var ERLAUBTE_NACHSAETZE = ["filet", "portion", "steak", "stück", "stuck", "würfel", "wurfel", "scheibe", "hälfte", "halft", "brust", "keule", "schenkel", "rispe", "netz", "schale"];

  function sortenIn(liste) {
    return liste.filter(function (w) { return SORTEN.indexOf(w) !== -1; }).map(function (w) { return stamm(w).replace(/[aeiou]?$/, ""); });
  }

  /**
   * Passt ein Angebot zu einer Zutat?
   * key: Zutatenschlüssel aus K.shoppingList (z. B. "rote zwiebel", "tomate", "basmati reis")
   * -> { passt: "ja" | "vielleicht" | "nein", grund }
   */
  function passt(key, a) {
    var kw = woerter(key);
    if (!kw.length) return { passt: "nein", grund: "leer" };
    var kopf = stamm(kw[kw.length - 1]);
    var ow = woerter(a.name + " " + (a.marke || ""));
    var treffer = -1, art = "";
    ow.forEach(function (w, i) {
      if (treffer !== -1) return;
      var s = stamm(w);
      if (s === kopf) { treffer = i; art = "gleich"; return; }
      // Zusammengesetztes Wort, das auf die Zutat endet: "Datteltomaten", "Speisemöhren"
      if (s.length > kopf.length && s.slice(-kopf.length) === kopf) {
        var vor = lower(w).slice(0, lower(w).length - lower(kw[kw.length - 1]).length - 1);
        var vorsatz = s.slice(0, s.length - kopf.length);
        if (ERLAUBTE_VORSAETZE.some(function (v) { return vorsatz.indexOf(stamm(v).slice(0, 4)) === 0 || vor.indexOf(v) === 0; })) { treffer = i; art = "zusammengesetzt"; }
      }
      // Zusammengesetztes Wort, das mit der Zutat beginnt: "Lachsfiletportionen" (nicht "Tomatenmark")
      if (treffer === -1 && s.length > kopf.length && s.indexOf(kopf) === 0) {
        var nach = s.slice(kopf.length).replace(/^(en|es|n|s|e)/, "");
        if (ERLAUBTE_NACHSAETZE.some(function (v) { return nach.indexOf(stamm(v)) === 0; })) { treffer = i; art = "zusammengesetzt"; }
      }
    });
    if (treffer === -1) return { passt: "nein", grund: "Zutat nicht im Namen" };
    // Anderes Produkt? ("Paprika Chips", "Tomatenketchup" wird schon oben nicht getroffen)
    var anderes = ow.filter(function (w) { return ANDERES_PRODUKT.indexOf(w) !== -1; });
    var keyAnderes = kw.filter(function (w) { return ANDERES_PRODUKT.indexOf(w) !== -1; });
    if (anderes.length && !keyAnderes.length) return { passt: "nein", grund: "anderes Produkt (" + anderes[0] + ")" };
    // Weitere Wörter der Zutat ("basmati" in "basmati reis") müssen vorkommen
    var fehlt = kw.slice(0, -1).filter(function (w) {
      if (SORTEN.indexOf(w) !== -1) return false;
      var s = stamm(w);
      return !ow.some(function (o) { return stamm(o).indexOf(s) !== -1; });
    });
    if (fehlt.length) return { passt: "nein", grund: "fehlt: " + fehlt.join(", ") };
    // Sorten vergleichen
    var ks = sortenIn(kw), os = sortenIn(ow);
    if (ks.length && os.length && !ks.some(function (s) { return os.indexOf(s) !== -1; })) return { passt: "nein", grund: "andere Sorte" };
    if (ks.length && !os.length) return { passt: "vielleicht", grund: "Sorte nicht genannt" };
    if (!ks.length && os.length) return { passt: "vielleicht", grund: "Angebot ist eine bestimmte Sorte" };
    return { passt: "ja", grund: art };
  }

  // ------------------------------------------------------------------ Menge, Kosten, Ersparnis
  /** Bedarf aus einer Zeile von K.shoppingList: Gramm und, falls ohne Einheit angegeben, Stück. */
  function bedarf(item) {
    var b = { g: item.grams || null, stk: null };
    var m = String(item.text || "").match(/^(?:ca\.\s*)?(\d+(?:[.,]\d+)?)\s+(?!g\b|kg\b|ml\b|l\b|EL\b|TL\b)[A-ZÄÖÜa-zäöü]/);
    if (m) b.stk = parseFloat(m[1].replace(",", "."));
    return b;
  }

  /**
   * Was kostet die benötigte Menge mit diesem Angebot?
   * -> { packungen, kosten, ersparnis (Euro oder null), rest (Text oder ""), genau (bool) }
   */
  function kosten(item, a) {
    var b = bedarf(item), p = a.menge || {}, packungen = 1, genau = false, rest = "";
    if (p.lose && b.g && a.preis != null) {
      var gp = a.grundpreis || { preis: a.preis, je: 1000 };
      var k = b.g / gp.je * gp.preis;
      var sp = a.streichpreis != null ? b.g / gp.je * gp.preis * (a.streichpreis / a.preis) - k : null;
      return { packungen: null, kosten: rund(k), ersparnis: sp != null ? rund(sp) : null, rest: "", genau: true, lose: true };
    }
    if (p.lose && a.grundpreis && b.g) {
      var k = b.g / a.grundpreis.je * a.grundpreis.preis;
      return { packungen: null, kosten: rund(k), ersparnis: null, rest: "", genau: true, lose: true };
    }
    var packMenge = p.g || p.ml || null;
    if (packMenge && b.g) { packungen = Math.max(1, Math.ceil(b.g / packMenge - 0.1)); genau = true;
      var ueber = packungen * packMenge - b.g; if (ueber >= 50) rest = "ca. " + (Math.round(ueber / 10) * 10) + (p.ml ? " ml" : " g") + " übrig"; }
    else if (p.stk && b.stk) { packungen = Math.max(1, Math.ceil(b.stk / p.stk)); genau = true; }
    else if (b.stk && !packMenge && !p.stk) { packungen = b.stk; genau = false; }
    var kostenEuro = a.preis != null ? rund(packungen * a.preis) : null;
    var ersparnis = a.streichpreis != null && a.preis != null ? rund(packungen * (a.streichpreis - a.preis)) : null;
    return { packungen: packungen, kosten: kostenEuro, ersparnis: ersparnis, rest: rest, genau: genau };
  }

  // ------------------------------------------------------------------ Abgleich und Empfehlung
  /**
   * items: Ergebnis von K.shoppingList (nur Zeilen mit have=false werden betrachtet)
   * angebote: vereinheitlichte Angebote (angebot()) aller gewählten Händler
   * optionen: { heute, maxLaeden: 1|2, schwelle: Euro für den zweiten Laden (Standard 3) }
   */
  function abgleich(items, angebote, optionen) {
    optionen = optionen || {};
    var schwelle = optionen.schwelle != null ? optionen.schwelle : 3;
    var maxLaeden = optionen.maxLaeden || 2;
    var aktuell = nochGueltig(angebote, optionen.heute);
    var offen = items.filter(function (i) { return !i.have; });
    var zeilen = {}, haendler = [];
    aktuell.forEach(function (a) { if (haendler.indexOf(a.haendler) === -1) haendler.push(a.haendler); });

    offen.forEach(function (it) {
      var treffer = [], vielleicht = [];
      aktuell.forEach(function (a) {
        var p = passt(it.key, a);
        if (p.passt === "nein") return;
        var k = kosten(it, a);
        var t = { haendler: a.haendler, angebot: a, kosten: k.kosten, ersparnis: k.ersparnis, packungen: k.packungen, rest: k.rest, genau: k.genau, grund: p.grund };
        (p.passt === "ja" ? treffer : vielleicht).push(t);
      });
      var nachPreis = function (x, y) { return (x.kosten == null ? 1e9 : x.kosten) - (y.kosten == null ? 1e9 : y.kosten); };
      treffer.sort(nachPreis); vielleicht.sort(nachPreis);
      // je Händler nur das günstigste sichere Angebot
      var best = {};
      treffer.forEach(function (t) { if (!best[t.haendler]) best[t.haendler] = t; });
      zeilen[it.key] = { item: it, besteJeHaendler: best, sicher: treffer, vielleicht: vielleicht };
    });

    function bewerte(laeden) {
      var summe = 0, anzahl = 0, ausgaben = 0, wo = {};
      Object.keys(zeilen).forEach(function (k) {
        var z = zeilen[k], wahl = null;
        laeden.forEach(function (h) {
          var t = z.besteJeHaendler[h];
          if (!t) return;
          if (!wahl || (t.ersparnis || 0) > (wahl.ersparnis || 0) || ((t.ersparnis || 0) === (wahl.ersparnis || 0) && (t.kosten || 1e9) < (wahl.kosten || 1e9))) wahl = t;
        });
        if (wahl) { anzahl++; summe += wahl.ersparnis || 0; ausgaben += wahl.kosten || 0; wo[k] = wahl.haendler; }
      });
      return { laeden: laeden, ersparnis: rund(summe), anzahl: anzahl, ausgaben: rund(ausgaben), wo: wo };
    }
    function besser(a, b) { return a.ersparnis !== b.ersparnis ? a.ersparnis > b.ersparnis : a.anzahl !== b.anzahl ? a.anzahl > b.anzahl : a.ausgaben < b.ausgaben; }

    var einzeln = haendler.map(function (h) { return bewerte([h]); });
    var bester = null;
    einzeln.forEach(function (e) { if (!bester || besser(e, bester)) bester = e; });
    var zweiter = null;
    if (bester && maxLaeden >= 2) {
      haendler.forEach(function (h) {
        if (h === bester.laeden[0]) return;
        var p = bewerte([bester.laeden[0], h]);
        if (p.ersparnis - bester.ersparnis >= schwelle && (!zweiter || besser(p, zweiter))) zweiter = p;
      });
    }
    var empfehlung = null;
    if (bester && bester.anzahl) {
      empfehlung = { laden: bester.laeden[0], anzahl: bester.anzahl, ersparnis: bester.ersparnis,
        zusatz: zweiter ? { laden: zweiter.laeden[1], anzahl: zweiter.anzahl - bester.anzahl, ersparnis: rund(zweiter.ersparnis - bester.ersparnis), wo: zweiter.wo } : null,
        wo: bester.wo };
      empfehlung.text = text(empfehlung, offen.length);
    }
    return { zeilen: zeilen, einzeln: einzeln, empfehlung: empfehlung, offen: offen.length, angebote: aktuell.length };
  }

  function euro(x) { return x.toFixed(2).replace(".", ",") + " €"; }
  function text(e, offen) {
    var s = "Diese Woche: " + e.laden + " – " + e.anzahl + " von " + offen + (offen === 1 ? " Zutat" : " Zutaten") + " im Angebot";
    if (e.ersparnis > 0) s += ", ca. " + euro(e.ersparnis) + " gespart";
    s += ".";
    if (e.zusatz) s += " Mit " + e.zusatz.laden + " zusätzlich: " + (e.zusatz.anzahl > 0 ? e.zusatz.anzahl + " Zutaten, " : "") + "ca. " + euro(e.zusatz.ersparnis) + ".";
    return s;
  }

  // ------------------------------------------------------------------ Leser: ALDI Nord
  // Quelle (öffentlich, darf von anderen Websites gelesen werden):
  //   /api/offer/category/mgnl/de/current   -> Abschnitte der Woche mit Produktnummern
  //   /api/product/pds/<nummern>?scope=de   -> Produkte mit Preisen
  var ALDI_NORD = {
    name: "ALDI Nord",
    wocheUrl: "https://www.aldi-nord.de/api/offer/category/mgnl/de/current",
    produktUrl: function (ids) { return "https://www.aldi-nord.de/api/product/pds/" + encodeURIComponent(ids.join(",")) + "?scope=de"; },
    essen: /obst|gem(ü|ue)se|fleisch|fisch|geb(ä|ae)ck|wochen-angebote|wochenend|gek(ü|ue)hlt|haltbar|snacks|s(ü|ue)(ß|ss)es|getr(ä|ae)nke|backzutaten|frische/i
  };
  /** Produktnummern der Lebensmittel-Abschnitte (nur diese werden geladen). */
  function aldiNordNummern(woche) {
    var ids = [];
    (woche.offers || []).forEach(function (o) {
      (o.content || []).forEach(function (x) {
        if (!ALDI_NORD.essen.test(x.title || "")) return;
        (x.productIds || []).forEach(function (id) { if (id && ids.indexOf(id) === -1) ids.push(id); });
      });
    });
    return ids;
  }
  /** Produkte (Antwort von /api/product/pds) -> einheitliche Angebote */
  function ausAldiNord(produkte) {
    return (produkte || []).map(function (p) {
      var c = p.currentPrice || {}, pp = (p.promotionPrices || [])[0] || {};
      var preis = pp.priceValue != null ? pp.priceValue : c.priceValue;
      var sp = (pp.strikePrice || c.strikePrice || {}).strikePriceValue;
      var bp = ((pp.basePrice || c.basePrice || [])[0]) || null, gp = null;
      if (bp && bp.basePriceValue != null) {
        var sc = lower(bp.basePriceScale).replace(/\s*\(.*\)/, "");
        gp = sc === "kg" ? { preis: bp.basePriceValue, je: 1000, einheit: "g" } : sc === "liter" || sc === "l" ? { preis: bp.basePriceValue, je: 1000, einheit: "ml" } : { preis: bp.basePriceValue, je: 1, einheit: "stk" };
      }
      var attr = (p.additionalAttributes || []).filter(function (a) { return /\d\s*(g|kg|ml|l)\b/i.test(a); })[0];
      return angebot({
        haendler: ALDI_NORD.name, name: p.name, marke: p.brandName || "", menge: attr || p.salesUnit || "",
        preis: preis, streichpreis: sp != null ? sp : null, grundpreis: gp,
        gueltigVon: pp.validFromLocalDate || null, gueltigBis: pp.validUntilLocalDate || null,
        link: p.productSlug ? "https://www.aldi-nord.de/produkt/" + p.productSlug + ".html" : ""
      });
    }).filter(function (a) { return a.preis != null; });
  }

  var api = {
    VERSION: VERSION, parseMenge: parseMenge, parseGrundpreis: parseGrundpreis, angebot: angebot,
    nochGueltig: nochGueltig, passt: passt, ALDI_NORD: ALDI_NORD, aldiNordNummern: aldiNordNummern, ausAldiNord: ausAldiNord, bedarf: bedarf, kosten: kosten, abgleich: abgleich, stamm: stamm
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AngeboteKern = api;
})(typeof self !== "undefined" ? self : this);
