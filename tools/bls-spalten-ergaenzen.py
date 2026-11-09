#!/usr/bin/env python3
"""
Ergänzt daten/bls-auszug.json um weitere Nährstoff-Spalten aus der vollständigen BLS-Datei.

Quelle: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0,
DOI 10.25826/Data20251217-134202-0, Lizenz CC BY 4.0. Die Excel-Datei liegt nicht im Repository.

Aufruf: python3 tools/bls-spalten-ergaenzen.py <BLS_4_0_Daten_2025_DE.xlsx> [--spuren-null] RIBF [WEITERE_CODES ...]
        python3 tools/bls-spalten-ergaenzen.py <datei> --spuren-null --alle   (alle Nährstoffe im Auszug neu einlesen)
Danach: python3 tools/build-naehrwerte.py

Textwerte der BLS: „-“ = nicht bestimmt → leer (unbekannt). „<LOD“ (unter der Nachweisgrenze), „<LOQ“ (unter der
Bestimmungsgrenze) und „TR“ (Spuren) → mit --spuren-null als 0 (Entscheidung Jakob, Runde 4 Nr. 7, 09.11.2026),
sonst leer wie früher.
"""
import json, os, sys
import openpyxl

ROOT = os.path.join(os.path.dirname(__file__), "..")
datei, codes = sys.argv[1], sys.argv[2:]
spuren_null = "--spuren-null" in codes
alle = "--alle" in codes
codes = [c for c in codes if not c.startswith("--")]
ws = openpyxl.load_workbook(datei, read_only=True).worksheets[0]
rows = ws.iter_rows(values_only=True)
head = next(rows)
spalte = {}
for k, h in enumerate(head):
    if h and "Datenherkunft" not in h and "Referenz" not in h:
        spalte[h.split(" ")[0]] = k
pfad0 = os.path.join(ROOT, "daten/bls-auszug.json")
if alle:
    codes = [k for k in json.load(open(pfad0, encoding="utf-8"))[0].keys() if k not in ("code", "de", "en")]
fehlt = [c for c in codes if c not in spalte]
if fehlt:
    sys.exit(f"Nicht in der BLS-Datei: {fehlt}")

werte = {}
for r in rows:
    werte[r[0]] = {}
    for c in codes:
        v = r[spalte[c]]
        try:
            werte[r[0]][c] = None if v in (None, "", "-") else round(float(v), 3)
        except (TypeError, ValueError):
            werte[r[0]][c] = 0.0 if spuren_null and str(v).strip() in ("<LOD", "<LOQ", "TR") else None

pfad = os.path.join(ROOT, "daten/bls-auszug.json")
auszug = json.load(open(pfad, encoding="utf-8"))
ohne = 0
for f in auszug:
    w = werte.get(f["code"])
    if w is None:
        ohne += 1
        continue
    for c in codes:
        f[c] = w[c]
json.dump(auszug, open(pfad, "w", encoding="utf-8"), ensure_ascii=False, separators=(", ", ": "))
print(f"{len(auszug)} Lebensmittel, ergänzt: {codes}, ohne Treffer in der Datei: {ohne}")
