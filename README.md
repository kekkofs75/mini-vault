# MiniVault

Catalogo personale, in sola lettura, di miniature e ricette di pittura. È una PWA statica: nessun server, nessuna build. Funziona su GitHub Pages (`https://kekkofs75.github.io/mini-vault`) e si può installare su telefono.

## Provare in locale

Il browser blocca la lettura dei file JSON se apri `index.html` con doppio clic. Serve un piccolo server:

- in VS Code, estensione **Live Server** → «Go Live»;
- oppure, nella cartella del progetto: `python -m http.server 8000` e apri `http://localhost:8000`.

## Struttura

```
index.html
css/style.css
js/app.js
sw.js                 service worker (offline)
manifest.json         installazione come app
data/miniature.json   le miniature e le ricette
data/colori.json      il catalogo dei colori
img/miniature/        foto delle miniature
img/colori/           immagini dei colori (colore, boccetta, esempio)
pdf/                  tutorial in PDF
icons/                icone dell'app
```

## Aggiungere una miniatura

1. Copia la foto in `img/miniature/` e il PDF in `pdf/` (i nomi nel JSON devono coincidere, estensione compresa).
2. In `data/miniature.json` aggiungi un oggetto all'elenco `miniature`:

```json
{
  "id": "nome-univoco-senza-spazi",
  "nome": "Nome della miniatura",
  "gruppo": "Nome del gruppo",
  "immagine": "Nome file.jpg",
  "pdf": "Nome file.pdf",
  "video": "https://www.youtube.com/watch?v=...",
  "correlati": ["id-di-un-altra-miniatura"],
  "colori": ["sp2-malignant-green", "sp2-medium"],
  "parti": [
    {
      "id": "pelle",
      "nome": "Pelle",
      "passaggi": [
        {
          "livello": 1,
          "colore": "sp2-malignant-green",
          "passate": 1,
          "tecnica": "base",
          "tag": ["verde", "chiaro", "base"],
          "nota": "Testo breve con il consiglio."
        },
        {
          "livello": 2,
          "colore": "sp2-ochre-clay",
          "passate": 1,
          "tecnica": "lavaggio",
          "mix": { "con": "sp2-medium", "rapporto": "1:1" },
          "tag": ["giallo", "ombra", "lavaggio"],
          "nota": "..."
        }
      ]
    }
  ]
}
```

Note sui campi:

- `id` deve essere unico. `video` e `correlati` sono facoltativi (se `video` è vuoto, il pulsante risulta disattivato).
- `colori` è la lista completa dei colori della miniatura (quella all'inizio del PDF); `parti[].passaggi[].colore` rimanda a un `id` di `colori.json`.
- `mix` è facoltativo. `"con"` è un id di colore oppure la parola `acqua`; `"rapporto"` può essere `1:1`, `diluito con`, `un po' di`...
- Un passaggio senza colore (assemblaggio, decal) si scrive con `"colore": null`.
- Un solo `video` per miniatura.
- I **tag** alimentano ricerca e suggerimenti: usa sempre le stesse parole (es. «verde», non a volte «verdi»).

## Aggiungere un colore

1. Copia le tre immagini in `img/colori/`: `Nome.webp` (colore), `Nome_Bottle.webp` (boccetta), `Nome_Sample.webp` (esempio).
2. In `data/colori.json` aggiungi:

```json
{
  "id": "sp2-nome-colore",
  "nome": "Nome Colore",
  "marca": "Army Painter",
  "linea": "Speedpaint 2.0",
  "hex": "#aabbcc",
  "posseduto": true,
  "immagini": { "colore": "Nome.webp", "boccetta": "Nome_Bottle.webp", "sample": "Nome_Sample.webp" }
}
```

Se non hai ancora le immagini lascia `null` nei tre campi: l'app mostra un campione con il valore `hex`. Quando le aggiungi, basta compilare i nomi dei file.

## Pubblicare su GitHub Pages

Carica tutto nel repository `kekkofs75/mini-vault` (ramo `main`), poi **Settings → Pages → Deploy from a branch → main / root**. Dopo ogni modifica attendi un minuto o due. Se l'app mostra ancora i vecchi dati, ricarica la pagina: i JSON vengono sempre riletti dalla rete e, solo offline, dalla copia salvata.

## Peso dei PDF

GitHub avvisa sopra 50 MB per file e blocca sopra 100 MB; il repository dovrebbe restare sotto 1 GB. Consiglio PDF da 3–5 MB (foto a circa 150 dpi) e gli originali tenuti fuori dal repository. I PDF non vengono salvati dal service worker: il download richiede sempre la connessione.

## Funzioni

- Barra fissa con titolo, lente per la ricerca e interruttore del tema (scuro di default).
- Lista a schede orizzontali o griglia, filtro per gruppo, ordinamento.
- Ricerca per tag separati da virgola, in OR: le miniature con più corrispondenze vengono prima. Cerca in tag, nomi di miniatura, gruppo, parti, tecniche e nomi dei colori; suggerimenti mentre scrivi.
- Scheda di dettaglio: foto ingrandibile, video, download PDF, colori necessari, parti con i passaggi in ordine, tutorial collegati.
- Nei passaggi il colore è mostrato con l'immagine «esempio»; un clic apre colore, boccetta ed esempio.
- Zoom: pizzico e doppio tocco su telefono; rotella, trascinamento e pulsanti su desktop; tasti `+`, `-`, `0`, frecce, Esc.
- Pagina **Colori**: tutte e tre le immagini per ogni colore, filtro per linea e le miniature in cui è usato.
- Funziona offline (dopo la prima visita) e si può installare come app.

## Per cambiare i dati dopo una modifica al codice

Se modifichi `css/style.css`, `js/app.js` o `index.html`, cambia `VERSION` in `sw.js` (es. `v2`): così i telefoni scartano la vecchia copia salvata.
