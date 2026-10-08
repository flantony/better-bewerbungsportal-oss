import * as z from 'zod';

const gemerkteStelleSchema = z.object({
  pinstGuid: z.string(),
  gemerktAm: z.string(),
  // Nur bei Stellen, die eine Treffer-Mail auf die Liste gesetzt hat - alle
  // anderen haben es nicht.
  ausMail: z.string().optional()
});

// Vom Filter selbst wird nur die Huelle geprueft (ein Objekt), nicht jedes
// einzelne Feld: die Feldliste lebt in functions/src/konto/kontoTypen.ts
// (zod/v3) - eine zweite Feldliste hier waere Doppelpflege, die bei jeder
// Erweiterung des Suchprofils garantiert auseinanderlaeuft.
const suchfilterSchema = z.looseObject({});

export const suchprofilEintragSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  filter: suchfilterSchema,
  aktiv: z.boolean(),
  // Eine kuenftige weitere Quelle soll die Seite nicht abbrechen - sie zaehlt
  // dann wie ein von Hand angelegter Filter (kein "von deiner KI").
  quelle: z.enum(['ki', 'hand']).catch('hand'),
  erstelltAm: z.string()
});

const suchoptionenSchema = z.object({
  organisationsbereich: z.array(z.string()),
  laufbahngruppe: z.array(z.string()),
  bundesland: z.array(z.string()),
  vertragsarten: z.array(z.string()),
  einstiegswege: z.array(z.string()),
  laufbahngruppeBedeutung: z.record(z.string(), z.string()),
  einstiegswegBedeutung: z.record(z.string(), z.string())
});

const benachrichtigungSchema = z.object({
  aktiv: z.boolean(),
  emailBestaetigt: z.boolean()
});

export const kontoSichtSchema = z.object({
  // Optional: Web und Functions werden getrennt ausgerollt. Fehlt die Liste
  // in der Serverantwort, zeigt die Seite keine Filter, statt ganz abzubrechen.
  suchprofile: z
    .array(suchprofilEintragSchema)
    .optional()
    .transform((wert) => wert ?? []),
  merkliste: z.array(gemerkteStelleSchema),
  optionen: suchoptionenSchema,
  // Optional: fehlt das Feld in der Serverantwort, wird es zu
  // `null` - der Benachrichtigungen-Bereich bleibt dann einfach verborgen.
  benachrichtigung: benachrichtigungSchema.nullish().transform((wert) => wert ?? null),
  // Funktionsschalter BEWERBERDATEN_IM_KONTO (functions/src/lib/funktionsschalter.ts)
  // - massgeblich ist der Server, das Web hat keine eigene Kopie. Fehlt das
  // Feld in der Serverantwort, gilt "aus".
  bewerberdatenAktiv: z
    .boolean()
    .nullish()
    .transform((wert) => wert ?? false)
});

// ─── Gemerkte Angaben ───────────────────────────────────────────────────────

// Nur die Huelle wird geprueft (jedes bekannte Feld optional als String) -
// die massgebliche Feldliste lebt in functions/src/fillBewerbungsbogen.ts.
const angabenSchema = z.object({
  nachname: z.string().optional(),
  vorname: z.string().optional(),
  geburtsdatum: z.string().optional(),
  telefon: z.string().optional(),
  email: z.string().optional(),
  geburtsort: z.string().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  staatsangehoerigkeit: z.string().optional(),
  studienabschluss: z.string().optional(),
  fuehrerschein: z.string().optional()
});

export const angabenSichtSchema = z.object({
  angaben: angabenSchema,
  staatsangehoerigkeitEingewilligtAm: z.string().nullable()
});

// ─── Unterlagen ─────────────────────────────────────────────────────────────

export const unterlageSichtSchema = z.object({
  docId: z.string(),
  art: z.enum(['lebenslauf', 'zeugnis', 'sonstiges']),
  dateiname: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  hochgeladenAm: z.string()
});

export const unterlagenListeSchema = z.array(unterlageSichtSchema);

// Auch die Antworten der Upload-/Download-Aufrufe werden geprueft. Nur
// https - die URL wird direkt fuer ein PUT bzw. eine Navigation verwendet.
const httpsUrl = z.url({ protocol: /^https$/ });

export const unterlageUploadUrlAntwortSchema = z.object({
  docId: z.string().min(1),
  uploadUrl: httpsUrl,
  pflichtHeader: z.record(z.string(), z.string())
});

export const unterlageDownloadUrlSchema = z.object({ url: httpsUrl });

// ─── Suchfilter aus einem Link (lib/suchprofil-link.ts) ─────────────────────

// Anders als `suchprofilSchema` oben prueft dieses Schema JEDES Feld: die
// Filter kommen hier nicht von unserem Server, sondern aus einem Link, den
// eine fremde KI gebaut hat. Gespiegelt sind Feldnamen, Typen und Grenzen von
// suchprofilSchema (functions/src/konto/kontoTypen.ts) - ein Test dort
// vergleicht die Feldliste mit dieser hier. Die erlaubten WERTE der Listen
// stehen bewusst nicht hier, sondern kommen als `Suchoptionen` vom Server
// (s. dekodiereSuchprofile); massgeblich prueft ohnehin der Server beim Speichern.
const SUCHPROFIL_TEXT_MAX = 100;
const SUCHPROFIL_LISTE_MAX = 30;
const suchprofilListe = z.array(z.string().max(SUCHPROFIL_TEXT_MAX)).max(SUCHPROFIL_LISTE_MAX).optional();

export const suchprofilFilterSchema = z.strictObject({
  suchbegriff: z.string().max(SUCHPROFIL_TEXT_MAX).optional(),
  organisationsbereich: suchprofilListe,
  laufbahngruppe: suchprofilListe,
  taetigkeitsbereich: z.enum(['militaerisch', 'zivil', 'beide']).optional(),
  vertragsarten: suchprofilListe,
  beschaeftigungsumfang: z.enum(['vollzeit', 'teilzeit', 'beide']).optional(),
  bundesland: suchprofilListe,
  wunschort: z.string().max(SUCHPROFIL_TEXT_MAX).optional(),
  einstiegswege: suchprofilListe,
  seiteneinstieg: z.boolean().optional(),
  mindestbesoldung: z.number().int().min(1).max(20).optional(),
  besoldungstabelle: z.enum(['A', 'E']).optional()
});

// ─── Mehrere Filter je Konto ────────────────────────────────────────────────

export const suchprofileAntwortSchema = z.object({
  ergebnis: z.enum(['hinzugefuegt', 'geaendert', 'geloescht']),
  hinzugefuegt: z.array(z.string()).optional(),
  uebersprungen: z.number().int().nonnegative().optional(),
  suchprofile: z.array(suchprofilEintragSchema)
});

export const suchfilterTrefferSchema = z.object({
  anzahl: z.number().int().nonnegative(),
  mindestens: z.boolean()
});
