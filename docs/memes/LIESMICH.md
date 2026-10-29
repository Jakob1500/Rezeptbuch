# Meme-Ordner für das Pop-up „Gelerntes an Jakob schicken“

Liegen hier Bilder und stehen sie in `memes.json`, zeigt das Pop-up nur noch diese Memes.
Ist die Liste leer, zeigt die App die selbst gezeichnete Sanddorn-Beere.

**Achtung:** Alles in diesem Ordner ist über GitHub Pages öffentlich abrufbar – auch für Menschen,
die den Link nicht von dir haben. Rechte an den Bildern prüfst du selbst. Wenn die App größer wird:
Ordnerinhalt löschen und `memes.json` wieder auf `{"memes": []}` setzen.

## So fügst du ein Meme hinzu (im Browser auf github.com)

1. Repository öffnen → Ordner `docs/memes` → **Add file → Upload files** → Bild hochladen
   (jpg, png, gif oder webp; Dateiname ohne Umlaute und Sonderzeichen, z. B. `seitenblick.jpg`).
   Bitte vorher zuschneiden, damit keine fremden Kontonamen oder Instagram-Rahmen zu sehen sind.
2. `memes.json` öffnen → Stift (Bearbeiten) → Eintrag ergänzen → **Commit changes**.

```json
{
  "memes": [
    { "bild": "seitenblick.jpg", "oben": "Du: speicherst Rezept Nr. {gesamt}", "unten": "Ich: weiß Dinge, die Jakob nicht weiß", "wann": ["rezepte"] },
    { "bild": "panik.jpg", "oben": "Lernspeicher {prozent} % voll", "unten": "", "wann": ["voll"] },
    { "bild": "warten.gif", "oben": "", "unten": "", "wann": [] }
  ]
}
```

- `oben` / `unten`: Text im Meme-Stil über dem Bild. Leer lassen, wenn das Bild schon Text hat.
- Platzhalter: `{gesamt}` (Rezepte insgesamt), `{prozent}` (Füllstand), `{tage}` (Tage seit dem ältesten Eintrag), `{meldungen}`.
- `wann`: bei welchem Anlass das Meme bevorzugt kommt – `"rezepte"` (15 neue Rezepte), `"meldungen"` (5 Meldungen),
  `"zeit"` (14 Tage), `"voll"` (Speicher zu 80 % voll). Leere Liste `[]` = passt immer.
- Kommas zwischen den Einträgen nicht vergessen, nach dem letzten keins.
