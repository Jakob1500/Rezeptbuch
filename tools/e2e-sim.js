#!/usr/bin/env node
/**
 * Testschleife „Teilen aus Instagram“ ohne iPhone.
 * Baut für jedes Rezept aus den Exporten die Ausgabe nach, die der Kurzbefehl liefert
 * (Text der Instagram-Einbettung, verschiedene Varianten), und prüft, ob die App daraus
 * dasselbe Rezept erkennt wie aus der Original-Beschreibung.
 *
 * Aufruf: node tools/e2e-sim.js daten/ig-analyse.json [daten/ig-analyse2.json …]
 */
const K = require("../kern/rezept-kern.js");
const files = process.argv.slice(2);
if (!files.length) { console.error("Aufruf: node tools/e2e-sim.js <analyse.json> …"); process.exit(1); }

// So sieht der Text aus, den „Inhalt von URL abrufen“ für /embed/captioned/ liefert (iPhone, Deutsch, 19.10.2026)
const VARIANTS = {
  "DE mit Likes": (acc, cap) => `\n\n${acc}\nVerifiziert\nOriginal-Audio\nProfil ansehen\n\n${acc}\nVerifiziert\n512 Beiträge · 120K Follower\n\n\nMehr auf Instagram ansehen\n\nGefällt mir\nKommentieren\nTeilen\nSpeichern\nGefällt 1.234 Mal\n${acc}\n\n${cap}\nAlle 12 Kommentare ansehen\nKommentieren …\nInstagram\n`,
  "DE ohne Likes": (acc, cap) => `\n\n${acc}\nProfil ansehen\n\n${acc}\n88 Beiträge · 3.120 Follower\n\n\nMehr auf Instagram ansehen\n\nGefällt mir\nKommentieren\nTeilen\nSpeichern\n${acc}\n\n${cap}\nKommentieren …\nInstagram\n`,
  "DE ohne Kommentare": (acc, cap) => `\n\n${acc}\nProfil ansehen\n\nMehr auf Instagram ansehen\n\nGefällt mir\nKommentieren\nTeilen\nSpeichern\nGefällt 17 Mal\n${acc}\n\n${cap}\nKommentar hinzufügen …\nInstagram\n`,
  "EN": (acc, cap) => `\n\n${acc}\nVerified\nOriginal audio\nView profile\n\n${acc}\n512 posts · 120K followers\n\n\nView more on Instagram\n\nLike\nComment\nShare\nSave\n1,234 likes\n${acc}\n\n${cap}\nView all 12 comments\nAdd a comment…\nInstagram\n`,
  "EN Liked by": (acc, cap) => `\n\n${acc}\nView profile\n\nView more on Instagram\n\nLike\nComment\nShare\nSave\nLiked by someone and others\n${acc}\n\n${cap}\nAdd a comment…\nInstagram\n`,
};

const norm = s => String(s || "").replace(/\s+/g, " ").trim();
const sig = r => [r.title, r.ingredients.length, r.steps.length].join(" | ");
let total = 0, fails = {}, examples = {};
files.forEach(f => {
  require(require("path").resolve(f)).filter(p => p.recipe).forEach(p => {
    const acc = p.account || "creator.name";
    const ref = K.analyse({ caption: p.caption, url: p.url, account: acc }).recipe;
    Object.keys(VARIANTS).forEach(v => {
      total++;
      const t = VARIANTS[v](acc, p.caption);
      // gleiche Schritte wie die App (handleImport)
      const emb = /Gefällt|Liked by|class="Caption"|Profil ansehen|View profile/.test(t) ? K.parseInstagramEmbed(t) : null;
      const caption = emb ? emb.caption : t;
      const got = K.analyse({ caption, url: p.url, account: emb ? emb.account : "" }).recipe;
      let why = "";
      if (!emb) why = "Einbettung nicht erkannt";
      else if (norm(emb.caption) !== norm(p.caption)) why = "Beschreibung abweichend";
      else if (sig(got) !== sig(ref)) why = "Rezept abweichend";
      if (why) {
        const k = v + ": " + why; fails[k] = (fails[k] || 0) + 1;
        if (!examples[k]) examples[k] = { url: p.url, soll: norm(p.caption).slice(0, 80), ist: norm(emb ? emb.caption : t).slice(0, 80) };
      }
    });
  });
});
console.log(`${total} Durchläufe, ${Object.values(fails).reduce((a, b) => a + b, 0)} Abweichungen`);
Object.keys(fails).forEach(k => console.log(` - ${k}: ${fails[k]}×  z. B. ${examples[k].url}\n     soll: ${examples[k].soll}\n     ist:  ${examples[k].ist}`));
