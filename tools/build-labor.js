// Baut die Testseite: fügt den Analyse-Kern in die Vorlage ein (eine Datei, keine Abhängigkeiten).
// Aufruf: node tools/build-labor.js <ausgabedatei>
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const tpl = fs.readFileSync(path.join(root, "labor/labor.template.html"), "utf8");
const kern = fs.readFileSync(path.join(root, "kern/rezept-kern.js"), "utf8");
if (/<\/script/i.test(kern)) throw new Error("Kern enthält </script> – würde die Seite brechen");
const nw = fs.readFileSync(path.join(root, "daten/naehrwerte.json"), "utf8");
const out = tpl.replace("/*KERN*/", () => kern).replace("/*NAEHRWERTE*/", () => nw);
const target = process.argv[2] || path.join(root, "labor/rezept-labor.html");
fs.writeFileSync(target, out);
console.log("geschrieben:", target, (out.length / 1024).toFixed(1) + " KB");
