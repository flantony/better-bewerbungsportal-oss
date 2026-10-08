import { describe, it, expect, vi } from "vitest";
import {
  abrufbareUrl,
  anhangTyp,
  documentIdFor,
  firebaseDownloadUrl,
  ladeAnhang,
  MAX_ANHANG_BYTES,
} from "./jobDocumentStore";

const ECHTE_QUELLE = "https://bewerbung.bundeswehr-karriere.de/erece/unregattach?sap-client=300&param=abc";

/** Antwort aus einzelnen Stuecken - so, wie sie beim Streamen ankommt. */
function antwort(stuecke: Uint8Array[], kopf: Record<string, string> = {}): Response & { abgebrochen: () => boolean } {
  let abgebrochen = false;
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(steuerung) {
      if (i < stuecke.length) steuerung.enqueue(stuecke[i++]);
      else steuerung.close();
    },
    cancel() {
      abgebrochen = true;
    },
  });
  return Object.assign(new Response(body, { status: 200, headers: kopf }), { abgebrochen: () => abgebrochen });
}

/**
 * WOZU: `AttachmentUrl` kommt aus einer fremden API und darf absolut sein.
 * Ohne Schutz luede der Sync jeden genannten Host, folgte jeder Weiterleitung
 * und laese die ganze Antwort in den Speicher, bevor er die Groesse prueft -
 * das Ergebnis laege danach oeffentlich bei uns.
 */
describe("ladeAnhang", () => {
  it("laedt vom Bundeswehr-Host, ohne Weiterleitungen zu folgen", async () => {
    const abruf = vi.fn(async () => antwort([new TextEncoder().encode("%PDF-1.4 inhalt")]));
    const bytes = await ladeAnhang(ECHTE_QUELLE, {}, abruf);
    expect(bytes?.toString()).toBe("%PDF-1.4 inhalt");
    expect(abruf).toHaveBeenCalledWith(ECHTE_QUELLE, expect.objectContaining({ redirect: "error" }));
    // Mit Zeitlimit - ein haengender Host darf den Sync nicht aufhalten.
    expect((abruf.mock.calls[0] as unknown[])[1]).toHaveProperty("signal");
  });

  it.each([
    "https://boese.example/erece/unregattach?param=abc",
    "http://bewerbung.bundeswehr-karriere.de/erece/unregattach",
    "https://bewerbung.bundeswehr-karriere.de.boese.example/x",
    "https://bewerbung.bundeswehr-karriere.de:8443/x",
    "file:///etc/passwd",
    "kein url",
  ])("ruft %s gar nicht erst ab", async (url) => {
    const abruf = vi.fn();
    expect(await ladeAnhang(url, {}, abruf)).toBeNull();
    expect(abruf).not.toHaveBeenCalled();
  });

  it("bricht beim Lesen ab, sobald die Grenze ueberschritten ist", async () => {
    const stueck = new Uint8Array(4 * 1024 * 1024);
    const stuecke = Array.from({ length: Math.ceil(MAX_ANHANG_BYTES / stueck.byteLength) + 5 }, () => stueck);
    const unterwegs = antwort(stuecke);
    expect(await ladeAnhang(ECHTE_QUELLE, {}, async () => unterwegs)).toBeNull();
    expect(unterwegs.abgebrochen()).toBe(true);
  });

  it("liest gar nicht erst, wenn die angekuendigte Groesse zu gross ist", async () => {
    const unterwegs = antwort([new Uint8Array(10)], { "content-length": String(MAX_ANHANG_BYTES + 1) });
    expect(await ladeAnhang(ECHTE_QUELLE, {}, async () => unterwegs)).toBeNull();
  });

  it("verwirft leere Antworten und Fehlerstatus", async () => {
    expect(await ladeAnhang(ECHTE_QUELLE, {}, async () => antwort([]))).toBeNull();
    expect(await ladeAnhang(ECHTE_QUELLE, {}, async () => new Response("x", { status: 404 }))).toBeNull();
  });
});

describe("anhangTyp", () => {
  it("legt nur ein erkanntes PDF als PDF ab", () => {
    expect(anhangTyp(new TextEncoder().encode("%PDF-1.7"))).toEqual({ contentType: "application/pdf", endung: ".pdf" });
  });

  it("liefert alles andere als Download aus, nie als anzeigbaren Typ", () => {
    expect(anhangTyp(new TextEncoder().encode("<html><script>"))).toEqual({
      contentType: "application/octet-stream",
      endung: "",
    });
  });
});

describe("documentIdFor", () => {
  // Der eigentliche Zweck: derselbe Anhang an vielen Ausschreibungen muss
  // dieselbe ID ergeben, sonst wird dieselbe Datei vielfach geladen.
  it("ergibt fuer denselben Anhang dieselbe ID, unabhaengig von URL-Beiwerk", () => {
    const param = Buffer.from("cand_hrobject=01NB00423620&attachment=000020").toString("base64");
    const a = `https://bewerbung.bundeswehr-karriere.de/erece/unregattach?param=${param}&sap-client=300&sap-language=DE`;
    const b = `https://bewerbung.bundeswehr-karriere.de/erece/unregattach?param=${param}&sap-client=300`;
    expect(documentIdFor(a)).toBe(documentIdFor(b));
  });

  it("unterscheidet verschiedene Anhaenge", () => {
    const p1 = Buffer.from("cand_hrobject=01NB00423620&attachment=000020").toString("base64");
    const p2 = Buffer.from("cand_hrobject=01NB00423620&attachment=000017").toString("base64");
    expect(documentIdFor(`https://x/?param=${p1}`)).not.toBe(documentIdFor(`https://x/?param=${p2}`));
  });

  it("bleibt deterministisch und dateinamensicher", () => {
    const id = documentIdFor("https://x/?param=" + Buffer.from("a=1").toString("base64"));
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(documentIdFor("https://x/?param=" + Buffer.from("a=1").toString("base64"))).toBe(id);
  });

  it("funktioniert auch ohne param-Anteil", () => {
    expect(documentIdFor("https://x/irgendwas.pdf")).toMatch(/^[0-9a-f]{24}$/);
    expect(documentIdFor("https://x/a.pdf")).not.toBe(documentIdFor("https://x/b.pdf"));
  });
});

// Die direkte GCS-Adresse liefert anonym 403, die Firebase-Download-URL
// desselben Objekts 200.
describe("abrufbareUrl", () => {
  it("setzt die direkte GCS-Adresse auf die Firebase-Download-URL um", () => {
    expect(
      abrufbareUrl(
        "https://storage.googleapis.com/better-bewerbungsportal.firebasestorage.app/jobDocuments/fdecdd42d88cd078414c8b01.pdf",
      ),
    ).toBe(
      "https://firebasestorage.googleapis.com/v0/b/better-bewerbungsportal.firebasestorage.app/o/jobDocuments%2Ffdecdd42d88cd078414c8b01.pdf?alt=media",
    );
  });

  it("laesst andere Adressen unveraendert", () => {
    const url = firebaseDownloadUrl("bucket", "jobDocuments/abc.pdf");
    expect(abrufbareUrl(url)).toBe(url);
    expect(abrufbareUrl("")).toBe("");
  });
});
