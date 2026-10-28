// Rauchtest der gebauten App im Browser (Chromium, iPhone-Größe): Zeit, Geräte, Portionen, Einstellungen,
// Ausschluss, Kochmodus mit Timer, eigene Einkaufseinträge, Wochenplan, Listen, „Nochmal kochen?“.
// Aufruf: node tools/app-rauchtest.js docs   (Playwright nötig; Chromium-Pfad über CHROME=…)
let pw; try { pw = require("playwright"); } catch (e) { pw = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright"); }
const { chromium } = pw;
const http = require("http"), fs = require("fs"), path = require("path");
const root = require("path").resolve(process.argv[2] || "docs");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(s);
});
const caption = "Schnelle Blechpizza\n\nZutaten\n450 g Mehl\n240 g Wasser\n50 g Olivenöl\n1 TL Backpulver\n100 g passierte Tomaten\n1 Mozzarella\n\nZubereitung\nMehl, Wasser, Öl und Backpulver zu einem Teig verkneten und abgedeckt 20 Minuten ruhen lassen.\nTeig ausrollen und aufs Blech legen.\nMit Tomaten und Mozzarella belegen und 20–25 Minuten bei 220 °C backen.";
let ok = 0, bad = 0;
const check = (name, cond, info) => { if (cond) ok++; else { bad++; console.log("✗ " + name + (info !== undefined ? "  → " + JSON.stringify(info) : "")); } };
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto("http://127.0.0.1:8765/index.html");
  await page.waitForTimeout(800);
  const gesehen = []; // Einführungsfenster, die der Test weggeklickt hat
  const coachWeg = async () => { await page.waitForTimeout(400); for (let k = 0; k < 12; k++) { const c = await page.$('#coach [data-a="coach-skip"], #coach [data-a="coach-next"]'); if (!c) break; gesehen.push(await page.innerText("#coach")); await c.click(); await page.waitForTimeout(150); } };
  const klick = async (sel) => { await coachWeg(); const el = await page.$(sel); if (el) { await el.click(); await page.waitForTimeout(300); await coachWeg(); return true; } return false; };
  await klick('[data-a="einwilligung-ok"]');
  check("Einführung beim ersten Start", /Willkommen in der Kombüse/.test(gesehen.join("\n")), gesehen[0]);
  await klick('[data-a="onboard"]'); await klick('[data-a="onboard-save"]');
  await klick('[data-a="close-sheet"]');
  await page.evaluate((c) => { location.hash = "u=" + encodeURIComponent("https://www.instagram.com/p/TEST1/") + "&t=" + encodeURIComponent(c); }, caption);
  await page.waitForTimeout(1500);
  for (let k = 0; k < 3; k++) if (!(await klick('.sheet [data-a="close-sheet"]'))) break;
  // Rezept öffnen, falls die App nicht schon dort ist
  if (!(await page.$('[data-a="serv"]'))) {
    const t = await page.$('text=Schnelle Blechpizza'); if (t) { await t.click(); await page.waitForTimeout(500); }
  }
  for (let k = 0; k < 3; k++) if (!(await klick('.sheet [data-a="close-sheet"]'))) break;
  let txt = await page.innerText("body");
  check("Rezept geöffnet", /Blechpizza/.test(txt) && !!(await page.$('[data-a="serv"]')), txt.slice(0, 300));
  check("Zeit als eine Angabe mit „ca.“", /ca\.\s*\n?\s*1:00|ca\.\s*\d+/.test(txt), (txt.match(/.{0,20}(Minuten|Stunden).{0,20}/) || [""])[0]);
  check("Geräte-Zeile", /Du brauchst: Backofen · Backblech · Nudelholz/.test(txt), (txt.match(/Du brauchst.*/) || [""])[0]);
  // Portionen halbieren
  const serv = await page.$eval('.stepper output', el => el.textContent);
  const minus = await page.$('[data-a="serv"][data-d="-1"]');
  const zahl = parseInt(serv, 10) || 4;
  for (let k = 0; k < Math.round(zahl / 2); k++) { await minus.click(); await page.waitForTimeout(150); }
  txt = await page.innerText("body");
  check("Umrechnen rundet Gramm auf 10 g (450 g → 230 g bzw. 110 g)", /\b(230|110) g\s*\n?\s*Mehl/.test(txt), [serv, (txt.match(/\d+ g\s*\n?\s*Mehl/) || [""])[0]]);
  check("Hinweis zu Form und Backzeit", /Form und Backzeit/.test(txt));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(require("os").tmpdir(), "rezept.png") });
  // Einstellungen: keine Tastatur, d. h. kein Eingabefeld im Fokus
  await klick('[data-a="back"]');
  await klick('[data-a="settings"]');
  await page.waitForTimeout(400);
  const fokus = await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + (a.className ? "." + a.className : "") : ""; });
  check("Einstellungen: kein Eingabefeld im Fokus", !/^(INPUT|TEXTAREA|SELECT)/.test(fokus), fokus);
  const ver = await page.innerText("body");
  const appV = (fs.readFileSync(path.join(__dirname, "../app/index.template.html"), "utf8").match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1], kernV = require("../kern/rezept-kern.js").VERSION;
  check("Version " + appV + " · Kern " + kernV, ver.includes(appV) && ver.includes(kernV), (ver.match(/.{0,20}Kern.{0,10}/) || [""])[0]);

  // ---- Paket 2: Ausschluss dauerhaft in den Einstellungen
  await page.fill("#ohne-immer-q", "Mozzarella"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  check("Einstellungen: Zutat dauerhaft ausgeschlossen", /Mozzarella/.test(await page.innerText(".sheet")));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  let liste = await page.innerText("body");
  check("Rezept mit Mozzarella ist ausgeblendet", !/Blechpizza/.test(liste), (liste.match(/.{0,40}Blechpizza.{0,40}/) || [""])[0]);
  await klick('[data-a="settings"]'); await klick('[data-a="ohne-immer-weg"]'); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  liste = await page.innerText("body");
  check("Wieder erlaubt: Rezept sichtbar", /Blechpizza/.test(liste));
  // ---- Ausschluss im Filter (Suche liegt auf der Startseite hinter der Lupe)
  await klick('[data-a="home-suche"]');
  await klick('[data-a="filters"]');
  await page.fill("#ohne-q", "Mozzarella");  await klick('[data-a="ohne-add"]');
  check("Filter zeigt „ohne Mozzarella“", /ohne Mozzarella/.test(await page.innerText(".sheet")));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  liste = await page.innerText("body");
  check("Filter blendet aus und zeigt Chip", !/Blechpizza/.test(liste) && /ohne Mozzarella/.test(liste));
  await klick('[data-a="ohne-weg"]');
  // ---- Kochmodus: Vorheizen und Timer
  const t2 = await page.$('text=Blechpizza'); if (t2) { await t2.click(); await page.waitForTimeout(400); }
  await klick('[data-a="cook"]');
  if (/Vorbereitung/.test(await page.innerText(".cook"))) await klick('[data-a="cook-next"]'); // 28.10.: Kochmodus beginnt mit „Alles bereitlegen“
  let koch = await page.innerText(".cook");
  check("Kochmodus: Anleitung und Vorheiz-Hinweis im ersten Schritt", /Kochmodus/.test(gesehen.join("\n")) && /Ofen jetzt vorheizen auf 220 °C/.test(koch), koch.slice(0, 300));
  check("Kochmodus: Timer-Knopf „20 Min. starten“", /20 Min\. starten/.test(koch));
  await klick('[data-a="timer-start"]');
  await page.waitForTimeout(1200);
  koch = await page.innerText(".cook");
  check("Timer läuft und zählt", /19:5\d|20:00/.test(koch), (koch.match(/\d+:\d\d.*/) || [""])[0]);
  await klick('[data-a="cook-next"]');
  check("Timer bleibt beim nächsten Schritt sichtbar", /19:5\d/.test(await page.innerText(".cook")));
  await klick('[data-a="timer-stop"]');
  check("Timer gestoppt", !/19:5\d/.test(await page.innerText(".cook")));
  await page.screenshot({ path: path.join(require("os").tmpdir(), "kochen.png") });
  await klick('[data-a="cook-close"]');
  // ---- Einkaufsliste: eigener Eintrag
  await klick('[data-a="tab"][data-t="einkauf"]') || await coachWeg(); await page.click('text=Einkauf');
  await page.waitForTimeout(300);
  await page.fill("#extra-q", "Spülmittel"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  const ek = await page.innerText("body");
  check("Eigener Eintrag steht auf der Liste", /Spülmittel/.test(ek) && /eigener Eintrag/.test(ek), ek.slice(0, 300));
  await page.screenshot({ path: path.join(require("os").tmpdir(), "einkauf.png") });

  // ---- Paket 3: Wochenplan
  await coachWeg(); await page.click('.tabbar [data-t="rezepte"]'); await page.waitForTimeout(300);
  const t3 = await page.$('text=Blechpizza'); if (t3) { await t3.click(); await page.waitForTimeout(400); }
  await klick('[data-a="plan"]');
  let sh = await page.innerText(".sheet");
  check("Einplanen: Anleitung und Tage", /Wochenplan/.test(gesehen.join("\n")) && /Heute/.test(sh) && /Morgen/.test(sh), sh.slice(0, 200));
  await coachWeg(); await page.click('.sheet [data-a="plan-tag"]'); await page.waitForTimeout(300);
  check("Einplanen: Heute gewählt", (await page.getAttribute('.sheet [data-a="plan-tag"]', "aria-pressed")) === "true");
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  check("Rezept zeigt „Geplant: Heute“", /Geplant: Heute/.test(await page.innerText("body")));
  await klick('[data-a="back"]');
  let start = await page.innerText("body");
  check("Startseite: „Diese Woche“ mit dem Rezept", /Diese Woche/.test(start) && /Heute/i.test(start) && /Blechpizza/.test(start), (start.match(/Diese Woche[\s\S]{0,80}/) || [""])[0]);
  await page.screenshot({ path: path.join(require("os").tmpdir(), 'start.png'), fullPage: true });
  await coachWeg(); await page.click('[data-a="woche-einkauf"]'); await page.waitForTimeout(500); await coachWeg();
  check("Woche „Einkaufen“: Einkaufsliste offen, Zutaten drauf", /Einkauf/.test(await page.innerText("h1")) && /Mehl/.test(await page.innerText("body")));
  // ---- Eigene Listen
  await coachWeg(); await page.click('.tabbar [data-t="rezepte"]'); await page.waitForTimeout(300);
  const t4 = await page.$('text=Blechpizza'); if (t4) { await t4.click(); await page.waitForTimeout(400); }
  await klick('[data-a="more"]'); await klick('[data-a="listen"]');
  await page.fill("#liste-neu", "Meal-Prep"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  check("Liste angelegt und Rezept drin", (await page.getAttribute('.sheet [data-a="liste-tag"]', "aria-checked")) === "true");
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  await coachWeg(); await page.click('.tabbar [data-t="kategorien"]'); await page.waitForTimeout(300);
  check("Kategorien: „Deine Listen“", /Deine Listen[\s\S]*Meal-Prep/.test(await page.innerText("body")));
  await klick('[data-a="liste-zeigen"]');
  check("Liste zeigt das Rezept", /Meal-Prep[\s\S]*Blechpizza/.test(await page.innerText("body")));
  // ---- Nochmal kochen?
  await coachWeg(); await page.click('text=Blechpizza'); await page.waitForTimeout(400);
  await klick('[data-a="cook"]');
  for (let k = 0; k < 5; k++) { if (!(await klick('[data-a="cook-next"]'))) break; }
  await klick('[data-a="cook-done"]');
  sh = await page.innerText(".sheet");
  check("Nach dem Kochen: „nochmal kochen?“", /nochmal kochen/.test(sh), sh.slice(0, 120));
  await klick('.sheet [data-v="ja"]');
  await klick('[data-a="more"]');
  check("Antwort im Rezept-Menü", /Nochmal kochen\?\s*Ja/.test(await page.innerText(".sheet")));
  await page.keyboard.press("Escape");
  // ---- App-Vergleich (Pakete 2–4): Kochbegriffe, Ersatz, Herkunft, Teilen-Link, Gänge, Reste, Woche, Hinweis aufs Original
  await coachWeg(); await page.click('.tabbar [data-t="rezepte"]'); await page.waitForTimeout(300); await coachWeg();
  await page.click('text=Blechpizza'); await page.waitForTimeout(400); await coachWeg();
  check("Kochbegriff antippbar", !!(await page.$('.steps [data-a="begriff"]')));
  if (await klick('.steps [data-a="begriff"]')) { check("Kochbegriff erklärt", /Ofen|Hitze|kühlen|Teig|garen/i.test(await page.innerText(".sheet"))); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  check("Ersetzen-Knopf bei Zutat", !!(await page.$('[data-a="ersatz"]')));
  if (await klick('[data-a="ersatz"]')) { check("Ersatz-Vorschlag mit Nährwerten", /ersetzen[\s\S]*je 100 g/i.test(await page.innerText(".sheet")), await page.innerText(".sheet")); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  check("Herkunft sichtbar", /Zutaten aus der Beschreibung/.test(await page.innerText("body")));
  const geteilt = await page.evaluate(() => { let t = ""; navigator.share = (d) => { t = d.text; return Promise.resolve(); }; document.querySelector('[data-a="more"]').click(); document.querySelector('[data-a="share-recipe"]').click(); return t; });
  check("Teilen mit Kombüse-Link", /#k=[A-Za-z0-9_-]{100,}/.test(geteilt) && /Original/.test(geteilt), geteilt.slice(0, 160));
  const kLink = (geteilt.match(/#k=[A-Za-z0-9_-]+/) || [""])[0];
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await coachWeg(); await page.click('.tabbar [data-t="einkauf"]'); await page.waitForTimeout(300); await coachWeg();
  for (const w of ["Klopapier", "Chips"]) { await page.fill("#extra-q", w); await page.keyboard.press("Enter"); await page.waitForTimeout(200); }
  let ek2 = await page.innerText("body");
  check("Gang Drogerie & Haushalt", /Drogerie & Haushalt[\s\S]*Klopapier/.test(ek2), ek2.slice(0, 300));
  check("Gang Süßes & Snacks", /Süßes & Snacks[\s\S]*Chips/.test(ek2));
  await klick('[data-a="gang"][data-n="Chips"]'); await klick('.sheet [data-g="Getränke"]');
  check("Gang gelernt", /Getränke[\s\S]*Chips/.test(await page.innerText("body")) && (await page.evaluate(() => JSON.stringify(window.localStorage) + "")).length >= 0);
  await coachWeg(); await page.click('.tabbar [data-t="rezepte"]'); await page.waitForTimeout(300);
  // Kacheln: langes Drücken -> anpassen, „Ich habe …“ hinzufügen
  check("Startseite: 4 Kacheln", (await page.$$(".kacheln .kachel")).length === 4, (await page.$$(".kacheln .kachel")).length);
  const k0 = await page.$(".kacheln .kachel"); const bb = await k0.boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + 20); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(300);
  check("Langes Drücken: Kacheln anpassen", /Kacheln anpassen/.test(await page.innerText("body")));
  await klick('[data-a="kachel-dazu"][data-k="reste"]'); await klick('[data-a="kachel-fertig"]');
  check("Kachel hinzugefügt", !!(await page.$('.kacheln [data-k="reste"]')));
  await coachWeg(); await page.evaluate(() => document.querySelector(".kacheln [data-k=reste]").click()); await page.waitForTimeout(300); await page.fill("#reste-q", "Mozzarella, Mehl"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  check("Reste-Suche findet Rezept", /Blechpizza/.test(await page.innerText(".sheet")), await page.innerText(".sheet"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await klick('[data-a="woche-vorschlag"]');
  check("Woche vorschlagen öffnet", /Woche vorschlagen/.test(await page.innerText(".sheet")));
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await page.evaluate(() => { location.hash = "u=" + encodeURIComponent("https://www.instagram.com/p/GETEILT1/") + "&t=" + encodeURIComponent("Bananenbrot\n\nZutaten\n3 Bananen\n250 g Mehl\n1 TL Backpulver\n\nZubereitung\nBananen zerdrücken und mit Mehl und Backpulver verrühren.\n50 Minuten bei 180 °C backen.") + "&g=1"; });
  await page.waitForTimeout(1500);
  let hin = ""; for (let k = 0; k < 4; k++) { const t = await page.$(".sheet"); if (!t) break; hin += await t.innerText(); if (/Original auf Instagram öffnen/.test(hin)) break; await page.keyboard.press("Escape"); await page.waitForTimeout(600); }
  if (!/Original auf Instagram öffnen/.test(hin)) { const t = await page.$('text=Bananenbrot'); if (t) { await t.click(); await page.waitForTimeout(900); const s2 = await page.$(".sheet"); if (s2) hin += await s2.innerText(); } }
  check("Geteiltes Rezept: Hinweis aufs Original", /Original auf Instagram öffnen/.test(hin), hin.slice(0, 200));
  // Kombüse-Form: eigener Titel kommt beim Empfänger an (wie geschickt)
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await page.evaluate((h) => { localStorage.clear(); }, kLink);
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  p2.on("pageerror", e => errors.push(String(e)));
  await p2.goto("http://127.0.0.1:8765/index.html" + kLink); await p2.waitForTimeout(1800);
  check("Empfänger: Rezept in Kombüse-Form angekommen", /Blechpizza/.test(await p2.innerText("body")) && /Mehl/.test(await p2.innerText("body")), (await p2.innerText("body")).slice(0, 300));
  await p2.close();
  // Kochmodus: Vorbereitung mit allen Zutaten
  await coachWeg(); await page.click('.tabbar [data-t="rezepte"]'); await page.waitForTimeout(300); await coachWeg();
  const bp = await page.$('text=Blechpizza'); if (bp) { await bp.click(); await page.waitForTimeout(400); }
  await coachWeg(); await klick('[data-a="cook"]');
  const koch0 = await page.innerText(".cook");
  check("Kochmodus beginnt mit „Alles bereitlegen“ und allen Zutaten", /Vorbereitung[\s\S]*Alles bereitlegen[\s\S]*Mehl[\s\S]*Mozzarella/.test(koch0), koch0.slice(0, 200));
  await klick('[data-a="cook-close"]');
  // Zeit eintragen
  await klick('[data-a="zeit"]'); await page.fill("#zeit-q", "35"); await klick('[data-a="zeit-ok"]');
  check("Eigene Zeit wird angezeigt", /35[\s\S]{0,40}bei dir/.test(await page.innerText("body")));
  // Label antippen
  if (await klick('[data-a="label-info"]')) { check("Label erklärt mit Melden-Knopf", /Stimmt nicht – melden/.test(await page.innerText(".sheet"))); await page.keyboard.press("Escape"); }
  check("keine JavaScript-Fehler", errors.length === 0, errors);
  await page.screenshot({ path: path.join(require("os").tmpdir(), "einstellungen.png") });
  await browser.close(); srv.close();
  console.log(`${ok} bestanden, ${bad} fehlgeschlagen`);
  process.exit(bad ? 1 : 0);
})();
