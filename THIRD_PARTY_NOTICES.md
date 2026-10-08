# Third-Party Notices

Better Bewerbungsportal steht unter der AGPL-3.0-or-later (siehe `LICENSE`).
Einige Bestandteile stammen aus fremden Projekten und stehen unter deren
eigenen Lizenzen; die Hinweise dazu folgen hier.

## next-shadcn-dashboard-starter (Kiranism) – MIT

Die Weboberfläche (`web/`) ist aus dem Starter
<https://github.com/Kiranism/next-shadcn-dashboard-starter> hervorgegangen
(Projektgerüst, Layout, Teile der Komponenten, Themes und Konfiguration).

```
MIT License

Copyright (c) 2023 Kiranism

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## shadcn/ui – MIT

Die UI-Grundkomponenten unter `web/src/components/ui/` sind mit
<https://ui.shadcn.com> erzeugt bzw. daraus übernommen und angepasst.

```
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Schriften – SIL Open Font License 1.1

Die Schriften werden **nicht** mit diesem Repository verteilt. `next/font/google`
lädt sie beim Build von Google Fonts und liefert sie mit der gebauten Seite aus
(`web/src/components/themes/font.config.ts`).

| Schrift | Urheber | Lizenz |
|---|---|---|
| Geist | Copyright (c) 2023 Vercel, in collaboration with basement.studio | OFL-1.1 |
| Geist Mono | Copyright (c) 2023 Vercel, in collaboration with basement.studio | OFL-1.1 |
| Source Serif 4 | Copyright 2014–2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' | OFL-1.1 |

Lizenztext: <https://openfontlicense.org/open-font-license-official-text/>

## npm-Abhängigkeiten

Die Pakete aus `functions/package.json` und `web/package.json` werden nicht mit
diesem Repository verteilt, sondern bei `npm ci` aus der npm-Registry geladen;
sie stehen unter ihren eigenen Lizenzen (überwiegend MIT, Apache-2.0, ISC und
BSD). Eine vollständige Liste mit Lizenzangaben erzeugst du im jeweiligen
Ordner nach `npm ci` mit:

```sh
npx license-checker --production --summary   # Überblick
npx license-checker --production             # je Paket
```
