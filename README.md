# Rezeptbuch

Persönliches Rezeptbuch für Rezepte aus Instagram. Web-App per Link, läuft auf dem iPhone ab iPhone 11,
alles bleibt auf dem Gerät (kein Server, kein Tracking, keine fremden Schriften oder Skripte).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `kern/rezept-kern.js` | Analyse-Kern: eine Datei ohne Abhängigkeiten (Browser, iOS JavaScriptCore, Android, Node) |
| `tests/` | `node tests/kern.test.js` |
| `app/` | Quelle der App (eine HTML-Vorlage) |
| `docs/` | gebaute App für GitHub Pages (`node tools/build-app.js`) |
| `daten/` | Nährwerttabelle und Suchliste aus dem BLS 4.0 |
| `tools/` | Bau- und Prüfskripte |

## Bauen

```
node tests/kern.test.js
python3 tools/build-naehrwerte.py
node tools/build-app.js
```

## Datenquelle

Nährwerte: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0, Karlsruhe,
DOI 10.25826/Data20251217-134202-0. Lizenz: CC BY 4.0. Werte im Rezeptbuch sind daraus berechnet; Stück- und Löffelgewichte sind Richtwerte.

## Datenschutz

Rezepte, Vorrat und Einkaufsliste werden nur im Speicher des Geräts abgelegt. Sicherungen sind eine Datei,
die der Nutzer selbst speichert (z. B. in iCloud Drive). Private Instagram-Exporte gehören nicht in dieses Projekt (siehe `.gitignore`).

## Lizenzen der Daten
- Nährwerte: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS) 4.0, CC BY 4.0.
- Einträge in `daten/gelernt-zentral.json` mit `"art": "off"`: Enthält Daten von Open Food Facts (https://openfoodfacts.org), verfügbar unter der Open Database License (ODbL 1.0, https://opendatacommons.org/licenses/odbl/1-0/). Diese Einträge (der aus Open Food Facts abgeleitete Teil) stehen ebenfalls unter der ODbL.
