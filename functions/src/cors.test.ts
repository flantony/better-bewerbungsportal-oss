import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/**
 * WOZU: mit `cors: true` duerfte jede Webseite im Netz die Konto- und
 * Mappen-Endpunkte aus dem Browser ihrer Besucher aufrufen und die Antwort
 * lesen. Erlaubt ist deshalb nur die eigene Website (und localhost fuer die
 * Entwicklung). MCP-Server und
 * `kiSeite` bleiben offen - sie sind fuer fremde Clients gebaut.
 *
 * Geprueft wird ueber echtes HTTP, weil die CORS-Antwort von der Middleware in
 * `onRequest` kommt, nicht vom Handler.
 */
vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return {
    ...actual,
    getFirestore: () => {
      throw new Error("Firestore wird in diesem Test nicht gebraucht");
    },
  };
});
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => {
    throw new Error("Storage wird in diesem Test nicht gebraucht");
  },
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => {
    throw new Error("Auth wird in diesem Test nicht gebraucht");
  },
}));

const { mappeUploadUrl } = await import("./mappeHttp");
const { kontoLaden } = await import("./kontoHttp");
const { kiSeite } = await import("./kiSeite");
const { mcpApp } = await import("./mcp/server");
const { ERLAUBTE_URSPRUENGE, PUBLIC_SITE_URL } = await import("./mcp/publicSite");

type Handler = (req: express.Request, res: express.Response) => unknown;

const server: Server[] = [];
const adressen = new Map<string, string>();

async function starte(name: string, app: express.Express): Promise<void> {
  const laufend = app.listen(0, "127.0.0.1");
  await new Promise<void>((fertig) => laufend.once("listening", () => fertig()));
  server.push(laufend);
  adressen.set(name, `http://127.0.0.1:${(laufend.address() as AddressInfo).port}`);
}

function alsApp(handler: Handler): express.Express {
  const app = express();
  app.use(express.json());
  app.all("*", (req, res) => handler(req, res));
  return app;
}

beforeAll(async () => {
  await starte("mappe", alsApp(mappeUploadUrl as unknown as Handler));
  await starte("konto", alsApp(kontoLaden as unknown as Handler));
  await starte("ki", alsApp(kiSeite as unknown as Handler));
  await starte("mcp", mcpApp);
});

afterAll(() => {
  for (const laufend of server) laufend.close();
});

async function preflight(name: string, origin: string, pfad = "/"): Promise<Response> {
  return fetch(`${adressen.get(name)}${pfad}`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
}

describe("CORS der Konto- und Mappen-Endpunkte", () => {
  it.each(["mappe", "konto"])("%s: erlaubt die eigene Website", async (name) => {
    const antwort = await preflight(name, PUBLIC_SITE_URL);
    expect(antwort.headers.get("access-control-allow-origin")).toBe(PUBLIC_SITE_URL);
  });

  it.each(["mappe", "konto"])("%s: erlaubt localhost:3000 fuer die Entwicklung", async (name) => {
    const antwort = await preflight(name, "http://localhost:3000");
    expect(antwort.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it.each(["mappe", "konto"])("%s: gibt einer fremden Seite keine Freigabe", async (name) => {
    const antwort = await preflight(name, "https://boese.example");
    expect(antwort.headers.get("access-control-allow-origin")).toBeNull();
  });

  // Der Kurzlink /k/{id} und Mail-Anbieter rufen ohne Origin auf - CORS darf
  // sie nicht abhalten, der Handler muss erreicht werden.
  it("laesst Aufrufe ohne Origin zum Handler durch", async () => {
    const mappe = await fetch(`${adressen.get("mappe")}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(mappe.status).toBe(400);
    const konto = await fetch(`${adressen.get("konto")}/`);
    expect(konto.status).toBe(401);
  });
});

describe("CORS der offenen Endpunkte", () => {
  it("kiSeite antwortet jeder Herkunft", async () => {
    const antwort = await preflight("ki", "https://chat.example");
    expect(antwort.headers.get("access-control-allow-origin")).toBe("https://chat.example");
  });

  it("der MCP-Server antwortet jeder Herkunft", async () => {
    const antwort = await preflight("mcp", "https://chat.example", "/mcp");
    expect(antwort.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("ERLAUBTE_URSPRUENGE", () => {
  // Die Bucket-CORS (storage.cors.json, per gcloud gesetzt) muss dieselben
  // Herkuenfte kennen - sonst laedt die Upload-Seite die URL, kann aber nicht
  // hochladen, oder umgekehrt.
  it("stimmt mit storage.cors.json ueberein", () => {
    const bucket = JSON.parse(readFileSync(resolve(__dirname, "../../storage.cors.json"), "utf8")) as {
      origin: string[];
    }[];
    expect(new Set(bucket.flatMap((eintrag) => eintrag.origin))).toEqual(new Set(ERLAUBTE_URSPRUENGE));
  });
});
