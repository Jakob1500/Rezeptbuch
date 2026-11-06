#!/usr/bin/env python3
"""
Ergänzt daten/bls-auszug.json um weitere Nährstoff-Spalten aus der vollständigen BLS-Datei.

Quelle: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0,
DOI 10.25826/Data20251217-134202-0, Lizenz CC BY 4.0. Die Excel-Datei liegt nicht im Repository.

Aufruf: python3 tools/bls-spalten-ergaenzen.py <BLS_4_0_Daten_2025_DE.xlsx> RIBF [WEITERE_CODES ...]
Danach: python3 tools/build-naehrwerte.py

Textwerte der BLS („<LOD“, „<LOQ“, „TR“ = Spuren) werden wie im bisherigen Auszug leer gelassen.
"""
import json, os, sys
import openpyxl

ROOT = os.path.join(os.path.dirname(__file__), "..")
datei, codes = sys.argv[1], sys.argv[2:]
ws = openpyxl.load_workbook(datei, read_only=True).worksheets[0]
rows = ws.iter_rows(values_only=True)
head = next(rows)
spalte = {}
for k, h in enumerate(head):
    if h and "Datenherkunft" not in h and "Referenz" not in h:
        spalte[h.split(" ")[0]] = k
fehlt = [c for c in codes if c not in spalte]
if fehlt:
    sys.exit(f"Nicht in der BLS-Datei: {fehlt}")

werte = {}
for r in rows:
    werte[r[0]] = {}
    for c in codes:
        v = r[spalte[c]]
        try:
            werte[r[0]][c] = None if v in (None, "", "-") else float(v)
        except (TypeError, ValueError):
            werte[r[0]][c] = None

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
