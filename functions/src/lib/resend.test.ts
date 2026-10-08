import { describe, expect, it, vi } from "vitest";
import { sendeMail } from "./resend";

function antwort(status: number, kopf: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(),
    headers: { get: (name: string) => kopf[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

function inhalt() {
  return { betreff: "Betreff", text: "Text", html: "<p>Html</p>" };
}

describe("sendeMail - Request-Body", () => {
  it("ruft die Resend-API mit from/to/subject/text/html auf", async () => {
    const abrufen = vi.fn().mockResolvedValue(antwort(200));
    await sendeMail({ apiKey: "key-123", domain: "mail.example.de", an: "test@example.de", inhalt: inhalt() }, abrufen);

    expect(abrufen).toHaveBeenCalledTimes(1);
    const [url, init] = abrufen.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer key-123");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Better Bewerbungsportal <benachrichtigung@mail.example.de>");
    expect(body.to).toBe("test@example.de");
    expect(body.subject).toBe("Betreff");
    expect(body.text).toBe("Text");
    expect(body.html).toBe("<p>Html</p>");
  });

  it("traegt List-Unsubscribe und List-Unsubscribe-Post als Kopfzeilen mit", async () => {
    const abrufen = vi.fn().mockResolvedValue(antwort(200));
    await sendeMail(
      {
        apiKey: "key",
        domain: "mail.example.de",
        an: "test@example.de",
        inhalt: inhalt(),
        kopfzeilen: {
          "List-Unsubscribe": "<https://example.de/kontoAbbestellen?k=abc&t=def>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      },
      abrufen,
    );

    const body = JSON.parse(abrufen.mock.calls[0][1].body as string);
    expect(body.headers["List-Unsubscribe"]).toBe("<https://example.de/kontoAbbestellen?k=abc&t=def>");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("laesst das headers-Feld ganz weg, wenn keine Kopfzeilen mitgegeben werden", async () => {
    const abrufen = vi.fn().mockResolvedValue(antwort(200));
    await sendeMail({ apiKey: "key", domain: "d", an: "a@b.de", inhalt: inhalt() }, abrufen);

    const body = JSON.parse(abrufen.mock.calls[0][1].body as string);
    expect(body.headers).toBeUndefined();
  });
});

describe("sendeMail - Fehlerfall", () => {
  it("wirft `Resend-Status <status>` bei !ok, ohne den Antworttext zu lesen", async () => {
    const res = antwort(422);
    const abrufen = vi.fn().mockResolvedValue(res);

    await expect(sendeMail({ apiKey: "key", domain: "d", an: "a@b.de", inhalt: inhalt() }, abrufen)).rejects.toThrow(
      "Resend-Status 422",
    );
    // Der Antworttext kann die Empfaengeradresse enthalten -
    // er darf deshalb nicht einmal gelesen werden, geschweige denn geloggt.
    expect(res.text).not.toHaveBeenCalled();
  });
});

// WOZU: ein 429 ist bei Resend eine kurze Drosselung, kein
// Versandfehler - ohne Wiederholung ginge die Mail eines Kontos erst eine
// Nacht spaeter raus.
describe("sendeMail - 429", () => {
  const params = { apiKey: "key", domain: "d", an: "a@b.de", inhalt: inhalt() };

  it("wiederholt einmal nach Retry-After Sekunden", async () => {
    const abrufen = vi.fn().mockResolvedValueOnce(antwort(429, { "retry-after": "2" })).mockResolvedValueOnce(antwort(200));
    const schlafen = vi.fn().mockResolvedValue(undefined);
    await sendeMail(params, abrufen, schlafen);
    expect(abrufen).toHaveBeenCalledTimes(2);
    expect(schlafen).toHaveBeenCalledWith(2000);
  });

  it("wartet ohne Retry-After 1 Sekunde", async () => {
    const abrufen = vi.fn().mockResolvedValueOnce(antwort(429)).mockResolvedValueOnce(antwort(200));
    const schlafen = vi.fn().mockResolvedValue(undefined);
    await sendeMail(params, abrufen, schlafen);
    expect(schlafen).toHaveBeenCalledWith(1000);
  });

  it("wartet hoechstens 5 Sekunden", async () => {
    const abrufen = vi.fn().mockResolvedValueOnce(antwort(429, { "retry-after": "60" })).mockResolvedValueOnce(antwort(200));
    const schlafen = vi.fn().mockResolvedValue(undefined);
    await sendeMail(params, abrufen, schlafen);
    expect(schlafen).toHaveBeenCalledWith(5000);
  });

  it("nimmt bei einem unlesbaren Retry-After (z.B. HTTP-Datum) 1 Sekunde", async () => {
    const abrufen = vi
      .fn()
      .mockResolvedValueOnce(antwort(429, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }))
      .mockResolvedValueOnce(antwort(200));
    const schlafen = vi.fn().mockResolvedValue(undefined);
    await sendeMail(params, abrufen, schlafen);
    expect(schlafen).toHaveBeenCalledWith(1000);
  });

  it("wiederholt nur einmal - ein zweites 429 wirft `Resend-Status 429`", async () => {
    const abrufen = vi.fn().mockResolvedValue(antwort(429));
    const schlafen = vi.fn().mockResolvedValue(undefined);
    await expect(sendeMail(params, abrufen, schlafen)).rejects.toThrow("Resend-Status 429");
    expect(abrufen).toHaveBeenCalledTimes(2);
    expect(schlafen).toHaveBeenCalledTimes(1);
  });

  it("wiederholt andere Fehler nicht", async () => {
    const abrufen = vi.fn().mockResolvedValue(antwort(500));
    const schlafen = vi.fn().mockResolvedValue(undefined);
    await expect(sendeMail(params, abrufen, schlafen)).rejects.toThrow("Resend-Status 500");
    expect(abrufen).toHaveBeenCalledTimes(1);
    expect(schlafen).not.toHaveBeenCalled();
  });
});
