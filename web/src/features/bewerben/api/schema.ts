import * as z from 'zod';

// Nur die Huelle wird geprueft (Feldnamen/Typen) - die massgebliche Logik, was
// als "ausfuellbar" oder "fehlend" gilt, lebt in functions/src/konto/bewerbung.ts.
const formularPlanSchema = z.object({
  docId: z.string(),
  titel: z.string(),
  ausfuellbar: z.boolean(),
  fehlendeAngaben: z.array(z.string()),
  optionaleAngaben: z.array(z.string())
});

// Nur https - die URL wird direkt fuer eine Navigation verwendet (Download).
const httpsUrl = z.url({ protocol: /^https$/ });

const ablageEintragSchema = z.object({
  docId: z.string(),
  art: z.string(),
  dateiname: z.string()
});

export const bewerbungsplanSchema = z.object({
  stelle: z.object({
    pinstGuid: z.string(),
    refCode: z.string(),
    titel: z.string(),
    bewerbungsschluss: z.string(),
    // Optional: Web und Functions werden getrennt ausgerollt - eine
    // Serverantwort ohne das Feld bleibt gueltig.
    bewerbungsschlussText: z.string().optional(),
    aktiv: z.boolean()
  }),
  formulare: z.array(formularPlanSchema),
  geforderteUnterlagen: z.array(z.string()),
  hinweise: z.array(z.string()),
  ablage: z.array(ablageEintragSchema),
  angabenVorhanden: z.boolean(),
  // Beide optional: eine Serverantwort ohne sie bleibt gueltig.
  selbstAuszufuellen: z.array(z.object({ titel: z.string(), downloadUrl: httpsUrl })).optional(),
  einreichen: z.array(z.string()).optional(),
  // Nur wenn die Ausschreibung eine Ausweiskopie verlangt.
  ausweiskopieHinweis: z.string().optional()
});

export const bewerbungspaketAntwortSchema = z.object({
  url: httpsUrl,
  dateiname: z.string().min(1)
});
