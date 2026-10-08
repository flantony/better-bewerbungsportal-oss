/**
 * „Was du einreichen musst" auf der Stellenseite und die Checkliste dazu - für
 * alle, die ohne KI und ohne Konto-Paket bewerben.
 *
 * SPIEGEL, KEINE EIGENE LISTE: Was eine Ausschreibung verlangt, entscheidet
 * dieselbe Logik wie `get_document_requirements` und der Merkzettel im Paket.
 * Das Web ist ein eigenes Paket und kann functions/ nicht importieren (wie
 * `abrufbare-url.ts`); die Quellen stehen je Abschnitt dabei.
 * `functions/src/lib/einreichlisteSpiegel.test.ts` legt beide Seiten
 * nebeneinander und schlägt fehl, sobald sie auseinanderlaufen - wer hier oder
 * dort etwas ändert, ändert beides.
 *
 * Deshalb hier keine `@/`-Importe und keine Abhängigkeiten: der Test im
 * functions-Paket lädt diese Datei direkt.
 *
 * DSGVO: nur öffentliche Ausschreibungsdaten. `contactDesc` (Namen der
 * Ansprechpersonen) nimmt keine Funktion hier entgegen.
 */

/** Anker des Abschnitts „Was du einreichen musst" auf der Stellenseite. */
export const EINREICHEN_ANKER = 'einreichen';

// ─── functions/src/lib/unterlagen.ts ─────────────────────────────────────────

const NICHT_FUER_DIESE_STELLE = new Set(['antwortbogen', 'datenschutzblatt']);
const ARTIKEL = /^(ein|eine|einen|einem)\s+/i;

export function normalisiereUnterlagen(unterlagen: string[]): string[] {
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];
  for (const eintrag of unterlagen) {
    const ohneArtikel = eintrag.trim().replace(ARTIKEL, '').trim();
    if (!ohneArtikel) continue;
    if (NICHT_FUER_DIESE_STELLE.has(ohneArtikel.toLowerCase())) continue;
    const schluessel = ohneArtikel.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(ohneArtikel);
  }
  return ergebnis;
}

// ─── functions/src/mcp/lib/identifyBewerbungsbogen.ts ────────────────────────

export type TemplateFamily =
  | 'seiteneinstieg-rob'
  | 'militaerisch'
  | 'karrierebogen-mannschaften'
  | 'wiedereinstellung'
  | 'a2'
  | 'zivil'
  | 'karrierebogen-zivil';

function istZivil(normalized: string): boolean {
  return /(^|[^a-zäöüß])ziv(il)?([^a-zäöüß]|$)/.test(normalized);
}

export function detectTemplateFamily(attHeader: string): TemplateFamily | null {
  const normalized = attHeader.toLowerCase();
  const istBogen = /(bewerbungsbogen|karrierebogen|bewerbungsformular|bewerbungsunterlagen)/.test(normalized);
  if (!istBogen) return null;
  if (normalized.startsWith('anlage')) return null;
  if (normalized.includes('karrierebogen') && normalized.includes('mannschaften')) {
    return 'karrierebogen-mannschaften';
  }
  if (normalized.includes('karrierebogen') && istZivil(normalized)) return 'karrierebogen-zivil';
  if (normalized.includes('wiedereinstellung')) return 'wiedereinstellung';
  if (normalized.includes('seiteneinstieg')) return 'seiteneinstieg-rob';
  if (normalized.includes('militärisch') || normalized.includes('militaerisch')) return 'militaerisch';
  if (istZivil(normalized)) return 'zivil';
  if (/\ba2\b/.test(normalized)) return 'a2';
  return null;
}

// ─── functions/src/mappe/anhangArt.ts ────────────────────────────────────────

export type AnhangArt = 'ausfuellen' | 'beiblatt' | 'information' | 'bewerbungsbogen' | 'unbekannt';

const AUSFUELLEN = [
  /Anlage\s*\d*\s*zum\s+(Bewerbungs|Karriere)bogen/i,
  /Erkl(ä|ae)rung/i,
  /Einverst(ä|ae)ndnis/i,
  /Fragebogen/i,
  /Antwortbogen/i,
  /Datenschutzblatt/i,
  /Leistungsdaten/i,
  /Noten(ü|ue)bersicht/i
];

const BEIBLATT = /Beiblatt/i;

const INFORMATION = [
  /Factsheet/i,
  /Brosch(ü|ue)re/i,
  /Flyer/i,
  /Bez(ü|ue)ge/i,
  /^Info\b/i,
  /Merkblatt/i,
  /Stellenbeschreibung/i,
  /F(ö|oe)rderliche/i,
  /Die Zukunft im Blick/i,
  /zweite Karriere/i,
  /^Anlage\s*\d*\s*OA-/i,
  /[\s_]Anlage$/i
];

const VERFASSUNGSTREUE = [
  /Anlage\s*\d*\s*zum\s+(Bewerbungs|Karriere)bogen/i,
  /politisch/i,
  /Mitgliedschaft/i,
  /Treuepflicht/i,
  /Verfassungstreue/i
];

export function istVerfassungstreueErklaerung(attHeader: string): boolean {
  return VERFASSUNGSTREUE.some((muster) => muster.test(attHeader));
}

export function anhangArt(attHeader: string): AnhangArt {
  const titel = attHeader.trim();
  if (detectTemplateFamily(titel)) return 'bewerbungsbogen';
  if (AUSFUELLEN.some((muster) => muster.test(titel))) return 'ausfuellen';
  if (BEIBLATT.test(titel)) return 'beiblatt';
  if (INFORMATION.some((muster) => muster.test(titel))) return 'information';
  return 'unbekannt';
}

// ─── functions/src/mappe/ausweiskopie.ts ─────────────────────────────────────

export const AUSWEISKOPIE_HINWEIS =
  'Ausweiskopie: Verlangt die Ausschreibung eine Kopie deines Personalausweises, lege sie selbst bei. Wir nehmen keine Ausweiskopien entgegen.';

const AUSWEIS_STAEMME = ['ausweis', 'personalausweis', 'reisepass', 'identitätsnachweis', 'identitaetsnachweis'];

export function verlangtAusweiskopie(geforderteUnterlagen: readonly string[]): boolean {
  return geforderteUnterlagen.some((eintrag) =>
    AUSWEIS_STAEMME.some((stamm) => new RegExp(`(^|[^a-zäöüß])${stamm}`, 'i').test(eintrag))
  );
}

// ─── functions/src/lib/einreichen.ts ─────────────────────────────────────────

export const BEWERBUNGSPORTAL_URL = 'https://bewerbung.bundeswehr-karriere.de';

export function einreichenSchritte(refCode?: string): string[] {
  const kennung = refCode ? `über ihre Kennung ${refCode}` : 'über ihre Kennung';
  return [
    `Im offiziellen Bewerbungsportal der Bundeswehr (${BEWERBUNGSPORTAL_URL}) auf „Karriere starten“ klicken und ein Profil anlegen.`,
    `Dort die Stelle ${kennung} suchen und die Unterlagen als PDF im Bewerbungsprofil hochladen. Unterschriebene Vordrucke vorher einscannen.`,
    'Das Portal fragt die persönlichen Angaben dort noch einmal selbst ab.',
    'In der Regel meldet sich danach die Karriereberatung zur Terminvereinbarung.',
    'Nennt die Ausschreibung einen anderen Weg, gilt dieser.'
  ];
}

// ─── functions/src/mcp/lib/unterlagenHinweis.ts (nur die Sätze an den Bewerber) ─

export const KEINE_UNTERLAGENLISTE_FUER_BEWERBER =
  'Eine Liste der Unterlagen konnten wir aus dieser Ausschreibung nicht herauslesen. Unterlagen brauchst du ' +
  'trotzdem: üblich sind ein Anschreiben, ein tabellarischer Lebenslauf und Zeugniskopien. Verbindlich ' +
  'sind der Ausschreibungstext und die dort genannte Ansprechperson bzw. die Karriereberatung.';

/** `hinweisZuUnterlagen(...).fuerDenBewerber` - `null`, wenn es eine Liste gibt. */
export function unterlagenHinweisFuerBewerber(unterlagen: string[], anzahlAnhaenge: number): string | null {
  if (unterlagen.length > 0) return null;
  const anhang =
    anzahlAnhaenge > 0 ? ' Der Ausschreibung liegen Anhänge bei, in denen weitere Angaben dazu stehen können.' : '';
  return KEINE_UNTERLAGENLISTE_FUER_BEWERBER + anhang;
}

/**
 * `hinweisZuBewerbungsboegen(...).fuerDenBewerber`, nur für den Fall „gar kein
 * Bewerbungsbogen" - liegt einer bei, füllt ihn der Bewerber ohne Paket ohnehin
 * selbst aus, und die Liste nennt ihn.
 */
export function keinBogenHinweisFuerBewerber(anzahlBoegen: number, anzahlVordrucke: number): string | null {
  if (anzahlBoegen > 0) return null;
  const vordrucke = anzahlVordrucke > 0 ? ' Die übrigen beiliegenden Vordrucke gelten davon unabhängig.' : '';
  return (
    'Dieser Ausschreibung liegt kein Bewerbungsbogen bei. Bei der Bundeswehr heißt das, dass du für sie auch ' +
    'keinen ausfüllen musst: verlangte Formulare hängen immer an der Ausschreibung selbst.' +
    vordrucke
  );
}

/** `hinweisZuVordrucken(...).fuerDenBewerber` - `null` ohne Vordrucke. */
export function vordruckHinweisFuerBewerber(vordrucke: string[]): string | null {
  if (vordrucke.length === 0) return null;
  const erklaerungen = vordrucke.filter(istVerfassungstreueErklaerung);
  const uebrige = vordrucke.filter((titel) => !istVerfassungstreueErklaerung(titel));
  const saetze = [
    erklaerungen.length > 0
      ? `Zu dieser Bewerbung gehört auch: ${erklaerungen.join(', ')}. Diesen Vordruck füllst du selbst ` +
        'von Hand aus, unterschreibst ihn und reichst ihn mit der Bewerbung ein. Ohne ihn ist die Bewerbung ' +
        'unvollständig.'
      : '',
    uebrige.length > 0
      ? 'Der Ausschreibung liegen Vordrucke bei, die du selbst ausfüllst und unterschreibst, soweit sie ' +
        `auf dich zutreffen: ${uebrige.join(', ')}.`
      : ''
  ]
    .filter(Boolean)
    .join(' ');
  return saetze || null;
}

// ─── Zusammenstellung für die Stellenseite ───────────────────────────────────

export interface EinreichAnhang {
  attHeader: string;
  downloadUrl: string;
}

export interface EinreichStelle {
  refCode: string;
  /** `jobAttributes.unterlagen`, roh - normalisiert wird hier. */
  unterlagen: string[];
  /** `jobAttributes.unterlagenHinweise`. */
  unterlagenHinweise: string;
  /** Alle gespeicherten Anhänge der Ausschreibung, in ihrer Reihenfolge. */
  anhaenge: EinreichAnhang[];
}

export interface Einreichliste {
  unterlagen: string[];
  /** Nur gesetzt, wenn `unterlagen` leer ist - leer heißt nie „nichts nötig". */
  unterlagenHinweis: string | null;
  formaleHinweise: string;
  ausweiskopieSelbstBeilegen: boolean;
  bewerbungsboegen: EinreichAnhang[];
  /** Nur gesetzt, wenn kein Bewerbungsbogen anhängt. */
  bogenHinweis: string | null;
  /** Vordrucke wie „Anlage 1 zum Bewerbungsbogen": selbst ausfüllen und unterschreiben. */
  selbstAuszufuellen: EinreichAnhang[];
  vordruckHinweis: string | null;
  /** Nicht sicher einzuordnen - der Bewerber prüft selbst. Informationsmaterial fehlt bewusst. */
  weitereDateien: EinreichAnhang[];
  einreichen: string[];
}

export function einreichlisteFuer(stelle: EinreichStelle): Einreichliste {
  const unterlagen = normalisiereUnterlagen(stelle.unterlagen);
  const bewerbungsboegen: EinreichAnhang[] = [];
  const selbstAuszufuellen: EinreichAnhang[] = [];
  const weitereDateien: EinreichAnhang[] = [];
  for (const anhang of stelle.anhaenge) {
    const art = anhangArt(anhang.attHeader);
    if (art === 'bewerbungsbogen') bewerbungsboegen.push(anhang);
    else if (art === 'ausfuellen') selbstAuszufuellen.push(anhang);
    else if (art === 'unbekannt') weitereDateien.push(anhang);
  }
  return {
    unterlagen,
    unterlagenHinweis: unterlagenHinweisFuerBewerber(unterlagen, stelle.anhaenge.length),
    formaleHinweise: stelle.unterlagenHinweise.trim(),
    ausweiskopieSelbstBeilegen: verlangtAusweiskopie(unterlagen),
    bewerbungsboegen,
    bogenHinweis: keinBogenHinweisFuerBewerber(bewerbungsboegen.length, selbstAuszufuellen.length),
    selbstAuszufuellen,
    vordruckHinweis: vordruckHinweisFuerBewerber(selbstAuszufuellen.map((a) => a.attHeader)),
    weitereDateien,
    einreichen: einreichenSchritte(stelle.refCode)
  };
}

// ─── Checkliste als Textdatei ────────────────────────────────────────────────

const ZEILENBREITE = 84;

/** Wie `eingerueckt` im Merkzettel (functions/src/mappe/merkzettel.ts): die Datei wird im Texteditor gelesen. */
function eingerueckt(text: string, einzug = '  '): string {
  const zeilen: string[] = [];
  let zeile = '';
  for (const wort of text.split(/\s+/)) {
    if (zeile && einzug.length + zeile.length + 1 + wort.length > ZEILENBREITE) {
      zeilen.push(einzug + zeile);
      zeile = wort;
    } else {
      zeile = zeile ? `${zeile} ${wort}` : wort;
    }
  }
  if (zeile) zeilen.push(einzug + zeile);
  return zeilen.join('\n');
}

function punkt(text: string): string {
  return eingerueckt(text, '    ').replace(/^ {4}/, '  - ');
}

function mitLink(anhang: EinreichAnhang): string {
  return anhang.downloadUrl ? `${punkt(anhang.attHeader)}\n    Download: ${anhang.downloadUrl}` : punkt(anhang.attHeader);
}

export interface ChecklistenKopf {
  titel: string;
  refCode: string;
  stellenUrl: string;
}

export function checklisteAlsText(kopf: ChecklistenKopf, liste: Einreichliste): string {
  const abschnitte: string[] = [
    [
      'CHECKLISTE FÜR DEINE BEWERBUNG',
      kopf.titel,
      ...(kopf.refCode ? [`Kennung: ${kopf.refCode}`] : []),
      `Ausschreibung: ${kopf.stellenUrl}`
    ].join('\n')
  ];

  const unterlagen = ['UNTERLAGEN'];
  if (liste.unterlagen.length > 0) unterlagen.push(...liste.unterlagen.map(punkt));
  if (liste.unterlagenHinweis) unterlagen.push(eingerueckt(liste.unterlagenHinweis));
  if (liste.ausweiskopieSelbstBeilegen) unterlagen.push(punkt(AUSWEISKOPIE_HINWEIS));
  if (liste.formaleHinweise) unterlagen.push(eingerueckt(`Formale Hinweise: ${liste.formaleHinweise}`));
  abschnitte.push(unterlagen.join('\n'));

  const formulare = [...liste.bewerbungsboegen, ...liste.selbstAuszufuellen];
  if (formulare.length > 0) {
    abschnitte.push(
      [
        'FORMULARE AUSFÜLLEN UND UNTERSCHREIBEN',
        eingerueckt('Lade sie herunter, fülle sie aus, unterschreibe sie und reiche sie mit der Bewerbung ein:'),
        ...formulare.map(mitLink),
        ...(liste.vordruckHinweis ? [eingerueckt(liste.vordruckHinweis)] : []),
        ...(liste.bogenHinweis ? [eingerueckt(liste.bogenHinweis)] : [])
      ].join('\n')
    );
  } else if (liste.bogenHinweis) {
    abschnitte.push(['FORMULARE', eingerueckt(liste.bogenHinweis)].join('\n'));
  }

  if (liste.weitereDateien.length > 0) {
    abschnitte.push(
      [
        'WEITERE DATEIEN DER AUSSCHREIBUNG',
        eingerueckt(
          'Ob eine davon ausgefüllt mitgeschickt werden muss, können wir nicht sicher sagen. Prüf das bitte selbst:'
        ),
        ...liste.weitereDateien.map(mitLink)
      ].join('\n')
    );
  }

  abschnitte.push(
    [
      'EINREICHEN',
      eingerueckt('Die Bewerbung reichst du selbst bei der Bundeswehr ein:'),
      ...liste.einreichen.map(punkt),
      eingerueckt('Bei Fragen: die in der Ausschreibung genannte Ansprechperson')
    ].join('\n')
  );

  abschnitte.push(
    eingerueckt(
      'Diese Checkliste stammt von Better Bewerbungsportal, einem unabhängigen privaten Projekt, und nicht von ' +
        'der Bundeswehr. Verbindlich ist der Ausschreibungstext.',
      ''
    )
  );

  return `${abschnitte.join('\n\n')}\n`;
}

/** Dateiname ohne Zeichen, die ein Dateisystem stören könnten. */
export function checklistenDateiname(refCode: string): string {
  const sicher = refCode.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sicher ? `Checkliste_${sicher}.txt` : 'Checkliste.txt';
}

/**
 * Was die Stellenseite dafür aus der Ausschreibung nimmt - und nur das. Die
 * Seite reicht ihren ganzen Datensatz herein (samt `contactDesc`); welche
 * Felder hier ankommen, legt diese Funktion fest, nicht der Aufrufer.
 */
export interface StellenAuszug {
  pinstGuid: string;
  title: string;
  refCode: string;
  unterlagen: string[];
  unterlagenHinweise: string;
  documents: EinreichAnhang[];
}

export function checklisteFuerStelle(
  stelle: StellenAuszug,
  siteUrl: string
): { liste: Einreichliste; text: string; dateiname: string } {
  const liste = einreichlisteFuer({
    refCode: stelle.refCode,
    unterlagen: stelle.unterlagen,
    unterlagenHinweise: stelle.unterlagenHinweise,
    anhaenge: stelle.documents.map((doc) => ({ attHeader: doc.attHeader, downloadUrl: doc.downloadUrl }))
  });
  const text = checklisteAlsText(
    {
      titel: stelle.title,
      refCode: stelle.refCode,
      stellenUrl: `${siteUrl}/dashboard/jobs/${encodeURIComponent(stelle.pinstGuid)}`
    },
    liste
  );
  return { liste, text, dateiname: checklistenDateiname(stelle.refCode) };
}
