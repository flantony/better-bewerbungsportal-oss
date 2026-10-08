import { describe, expect, it } from 'vitest';
import type { Suchoptionen } from '../api/types';
import { dekodiereSuchprofile, LINK_MAX_ZEICHEN } from './suchprofil-link';

/**
 * Vom FUNCTIONS-Kodierer (functions/src/lib/suchprofilLink.ts,
 * `kodiereSuchprofile`) erzeugt und hier woertlich eingefroren. Dieselbe
 * Zeichenkette steht in suchprofilLink.test.ts; ein Test dort prueft, dass beide
 * gleich sind. Damit ist belegt, dass ein Link vom MCP-Werkzeug im Browser
 * genauso gelesen wird wie auf dem Server.
 */
const FIXTURE =
  'v1.PZBBagMxDEWvMmg9OUC966YQCqWEQBdhFvbMt0dU4wmSnUCGXKsX6MWKG8hSQk96XxtFlgIld9rI6jgHJOUYydH-SD2JrzH4OSet5zPInegNMl0RIDT0VDwKp29wsQAFjzM5Wli4eCjbOFNPoeYJJj5PDf9YddIZnHdfsBK9IFNPh9ZpI7vP6OVGw73f6AIt6pN5LciNPcCgF0yMbKWdv9Zs47xqIUfvvz_SVoGzFUayK9K_sD6oNUa-MbRxCzelEmCrTDUnci89PSsrPkAE5OiV7kNP2S8Pgf2x82Ld8wUdL12L0TLkKjLc_wA';

const FIXTURE_ERWARTET = {
  ok: true,
  filter: [
    {
      suchbegriff: 'IT',
      laufbahngruppe: ['Feldwebel'],
      taetigkeitsbereich: 'militaerisch',
      bundesland: ['Nordrhein-Westfalen', 'Rheinland-Pfalz']
    },
    {
      vertragsarten: ['Reservedienst'],
      wunschort: 'Köln',
      einstiegswege: ['reserveoffizier'],
      mindestbesoldung: 9,
      besoldungstabelle: 'A'
    }
  ],
  namen: ['IT als Feldwebel im Westen', null]
};

/** Baut ein Fragment wie der Server - nur fuer Faelle, die er selbst nie baut. */
async function kodiere(nutzlast: unknown, version = 'v1'): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(nutzlast));
  const gepackt = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  ).arrayBuffer();
  let binaer = '';
  for (const byte of new Uint8Array(gepackt)) binaer += String.fromCharCode(byte);
  const base64url = btoa(binaer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${version}.${base64url}`;
}

const OPTIONEN: Suchoptionen = {
  organisationsbereich: ['Marine'],
  laufbahngruppe: ['Feldwebel'],
  bundesland: ['Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Bayern'],
  vertragsarten: ['Reservedienst'],
  einstiegswege: ['reserveoffizier'],
  laufbahngruppeBedeutung: {},
  einstiegswegBedeutung: {}
};

describe('dekodiereSuchprofile — Fixture vom Server', () => {
  it('liest den Link des Functions-Kodierers identisch', async () => {
    expect(await dekodiereSuchprofile(FIXTURE)).toEqual(FIXTURE_ERWARTET);
  });

  it('nimmt das Fragment auch mit fuehrendem # (location.hash)', async () => {
    expect(await dekodiereSuchprofile(`#${FIXTURE}`)).toEqual(FIXTURE_ERWARTET);
  });

  it('prueft mit Optionen auch die Werte der Auswahllisten', async () => {
    expect(await dekodiereSuchprofile(FIXTURE, OPTIONEN)).toEqual(FIXTURE_ERWARTET);
    const ohneKoeln = { ...OPTIONEN, bundesland: ['Bayern'] };
    expect(await dekodiereSuchprofile(FIXTURE, ohneKoeln)).toMatchObject({
      ok: false,
      code: 'ungueltig',
      filterNummer: 1
    });
  });
});

describe('dekodiereSuchprofile — Ablehnungen', () => {
  it('Rundreise mit eigenem Kodierer', async () => {
    const link = await kodiere({ filter: [{ bundesland: ['Bayern'] }] });
    expect(await dekodiereSuchprofile(link)).toEqual({
      ok: true,
      filter: [{ bundesland: ['Bayern'] }],
      namen: [null]
    });
  });

  it('leer', async () => {
    expect(await dekodiereSuchprofile('')).toMatchObject({ ok: false, code: 'leer' });
    expect(await dekodiereSuchprofile(await kodiere({ filter: [] }))).toMatchObject({
      ok: false,
      code: 'leer'
    });
  });

  it('abgeschnitten oder beschaedigt', async () => {
    expect(await dekodiereSuchprofile(FIXTURE.slice(0, -5))).toMatchObject({
      ok: false,
      code: 'kaputt'
    });
    expect(await dekodiereSuchprofile('v1.!!!')).toMatchObject({ ok: false, code: 'kaputt' });
    expect(await dekodiereSuchprofile('irgendwas')).toMatchObject({ ok: false, code: 'kaputt' });
    expect(await dekodiereSuchprofile(await kodiere(['kein', 'objekt']))).toMatchObject({
      ok: false,
      code: 'kaputt'
    });
    expect(
      await dekodiereSuchprofile(await kodiere({ filter: [{ bundesland: ['Bayern'] }], extra: 1 }))
    ).toMatchObject({ ok: false, code: 'kaputt' });
  });

  it('unbekannte Version', async () => {
    const link = await kodiere({ filter: [{ bundesland: ['Bayern'] }] }, 'v2');
    expect(await dekodiereSuchprofile(link)).toMatchObject({ ok: false, code: 'version' });
  });

  it('zu lang', async () => {
    const ergebnis = await dekodiereSuchprofile(`v1.${'A'.repeat(LINK_MAX_ZEICHEN)}`);
    expect(ergebnis).toMatchObject({ ok: false, code: 'zu-lang' });
  });

  it('Kompressionsbombe', async () => {
    const link = await kodiere({ filter: [{ suchbegriff: 'x'.repeat(200_000) }] });
    expect(link.length).toBeLessThan(LINK_MAX_ZEICHEN);
    expect(await dekodiereSuchprofile(link)).toMatchObject({ ok: false, code: 'kaputt' });
  });

  it('zu viele Filter', async () => {
    const filter = Array.from({ length: 11 }, () => ({ bundesland: ['Bayern'] }));
    expect(await dekodiereSuchprofile(await kodiere({ filter }))).toMatchObject({
      ok: false,
      code: 'zu-viele'
    });
  });

  it('ungueltiger Filter nennt Nummer und Feld, nie den Wert', async () => {
    const link = await kodiere({
      filter: [{ bundesland: ['Bayern'] }, { alter: 35 }]
    });
    const ergebnis = await dekodiereSuchprofile(link);
    expect(ergebnis).toMatchObject({ ok: false, code: 'ungueltig', filterNummer: 2 });
    expect(ergebnis.ok ? '' : ergebnis.grund).not.toContain('35');
  });

  it('lehnt einen Filter ab, der nichts einschraenkt', async () => {
    const link = await kodiere({ filter: [{ taetigkeitsbereich: 'beide', bundesland: [] }] });
    expect(await dekodiereSuchprofile(link)).toMatchObject({
      ok: false,
      code: 'ungueltig',
      filterNummer: 1
    });
  });

  it('lehnt einen zu langen Namen ab', async () => {
    const link = await kodiere({ filter: [{ bundesland: ['Bayern'] }], namen: ['x'.repeat(61)] });
    expect(await dekodiereSuchprofile(link)).toMatchObject({ ok: false, code: 'ungueltig' });
  });
});
