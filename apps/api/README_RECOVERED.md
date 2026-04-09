Wiederhergestellte Backend-Quellen (Teilw. aus dist kompiliert)

In diesem Ordner wurden Kern-TS-Quellen aus den kompilierten Dateien im `dist`-Ordner rekonstruiert.

- `src/` enthält wiederhergestellte TypeScript-Dateien für die wichtigsten Module (main, app.module, analysis, ai, scraper, common).
- Viele Hilfsdateien (Prompts, Schemas, DTOs) wurden als TypeScript-Kopien aus `dist` übernommen.

Hinweis zur Weiterarbeit:

1. Installiere Abhängigkeiten im `apps/api`-Ordner:

```bash
cd apps/api
npm install
```

2. Entwickeln / starten (dev):

```bash
npm run dev
```

3. Diese Wiederherstellung ist ein Best-Effort-Entwurf. Falls du möchtest, kann ich:

- weitere Dateien aus `dist` in lesbare TS-Dateien konvertieren
- automatisiert Importe bereinigen und Typsignaturen ergänzen
