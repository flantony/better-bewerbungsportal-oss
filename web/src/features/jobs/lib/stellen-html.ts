import { sanitize } from 'isomorphic-dompurify';

// Die Volltextfelder einer Ausschreibung sind HTML aus der Bundeswehr-API.
// Adressen stehen darin oft als blosser Text ("www.bundeswehrkarriere.de") -
// Bewerber mussten sie abtippen. Reihenfolge: erst DOMPurify, dann am bereits
// bereinigten DOM nur noch Text-Knoten durch selbst gebaute Links ersetzen.
// Es wird nie Text als HTML geparst, daher kann daraus kein Markup entstehen.

const TEXT_KNOTEN = 3;

/**
 * Adressen mit Schema, mit `www.` oder nackt mit gaengiger Endung. Das
 * Lookbehind haelt die Domain einer E-Mail-Adresse (`info@bundeswehr.org`)
 * und Wortteile heraus; `z.B.` hat keine passende Endung.
 */
const ADRESSE =
  /(?<![@\p{L}\p{N}_./-])(?:https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:de|com|org|net|eu|info)(?![\w-])(?:\/[^\s<>"]*)?)/giu;

const SATZZEICHEN_AM_ENDE = /[.,;:!?'"»«“”‘’]+$/;

/** Satzzeichen hinter der Adresse gehoeren zum Satz; `)` nur, wenn die Adresse keine oeffnet. */
function kuerzeAdresse(roh: string): string {
  let adresse = roh;
  for (;;) {
    const vorher = adresse;
    adresse = adresse.replace(SATZZEICHEN_AM_ENDE, '');
    if (adresse.endsWith(')') && !adresse.includes('(')) adresse = adresse.slice(0, -1);
    if (adresse === vorher) return adresse;
  }
}

function alsHref(adresse: string): string | null {
  const mitSchema = /^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`;
  try {
    const url = new URL(mitSchema);
    return url.protocol === 'https:' || url.protocol === 'http:' ? mitSchema : null;
  } catch {
    return null;
  }
}

const NEUER_TAB = ' (öffnet in neuem Tab)';

function haerteLink(link: Element) {
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  if (link.textContent?.includes(NEUER_TAB.trim())) return;
  const hinweis = link.ownerDocument.createElement('span');
  hinweis.setAttribute('class', 'sr-only');
  hinweis.append(link.ownerDocument.createTextNode(NEUER_TAB));
  link.append(hinweis);
}

function baueLink(dokument: Document, adresse: string, href: string): HTMLAnchorElement {
  const link = dokument.createElement('a');
  link.setAttribute('href', href);
  link.append(dokument.createTextNode(adresse));
  haerteLink(link);
  return link;
}

function verlinkeTextKnoten(knoten: Text) {
  const text = knoten.data;
  const dokument = knoten.ownerDocument;
  const teile: Node[] = [];
  let position = 0;
  for (const treffer of text.matchAll(ADRESSE)) {
    const adresse = kuerzeAdresse(treffer[0]);
    const href = alsHref(adresse);
    if (!href) continue;
    const start = treffer.index;
    if (start > position) teile.push(dokument.createTextNode(text.slice(position, start)));
    teile.push(baueLink(dokument, adresse, href));
    position = start + adresse.length;
  }
  if (teile.length === 0) return;
  if (position < text.length) teile.push(dokument.createTextNode(text.slice(position)));
  knoten.replaceWith(...teile);
}

/** Hier drin wird nichts verlinkt: schon ein Link, oder Text, der kein Fliesstext ist. SVG-`a` heisst klein `a`. */
const NICHT_VERLINKEN = new Set(['A', 'TEXTAREA', 'SVG', 'MATH', 'SCRIPT', 'STYLE']);

function sammleTextKnoten(wurzel: Node, ergebnis: Text[] = []): Text[] {
  for (const kind of Array.from(wurzel.childNodes)) {
    if (kind.nodeType === TEXT_KNOTEN) ergebnis.push(kind as Text);
    else if (!NICHT_VERLINKEN.has(kind.nodeName.toUpperCase())) sammleTextKnoten(kind, ergebnis);
  }
  return ergebnis;
}

/**
 * Was eine Ausschreibung zum Lesen nicht braucht. Formulare und Eingabefelder
 * koennten unter unserer Domain Angaben abfragen, `style` die Seite
 * ueberdecken oder umgestalten - DOMPurify liesse all das standardmaessig zu.
 * `class` genauso: Tailwind-Klassen wie `fixed inset-0` liegen im
 * ausgelieferten CSS. Die einzige Klasse in echten Ausschreibungen ist das
 * `glossary-term` aus dem Sync, und die gestaltet hier nichts.
 */
const VERBOTENE_TAGS = [
  'style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'dialog',
  // Fremd geladene Medien verraten dem Absender, wer die Stelle liest; echte
  // Ausschreibungen enthalten keine.
  'img', 'picture', 'source', 'video', 'audio'
];

/**
 * Bereinigt das HTML einer Ausschreibung und macht Adressen darin klickbar.
 * `data-glossary-term` bleibt erlaubt (s. GlossaryAnnotatedHtml).
 */
export function bereiteStellenHtmlAuf(html: string): string {
  const fragment = sanitize(html, {
    ADD_ATTR: ['data-glossary-term'],
    FORBID_TAGS: VERBOTENE_TAGS,
    FORBID_ATTR: ['style', 'class'],
    RETURN_DOM_FRAGMENT: true
  });
  const dokument = fragment.ownerDocument;
  const huelle = dokument.createElement('div');
  huelle.append(fragment);

  for (const link of Array.from(huelle.querySelectorAll('a[href]'))) haerteLink(link);
  for (const knoten of sammleTextKnoten(huelle)) verlinkeTextKnoten(knoten);

  return huelle.innerHTML;
}
