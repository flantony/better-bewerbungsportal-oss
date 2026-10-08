import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { MAX_MCP_BODY_BYTES, mcpApp, pruefeAnfrageform } from "./server";

/**
 * WOZU:
 * - Ein JSON-RPC-Batch mit hunderten `tools/call` kostete sonst EIN Token der
 *   Pro-IP-Drosselung. MCP kennt ab Protokollfassung 2025-06-18 keine Batches; jedes Array
 *   wird vor der Drosselung abgewiesen.
 * - In Cloud Functions ist der Body schon geparst, `express.json` greift dort
 *   nicht - die Groesse muss an `rawBody` gemessen werden.
 */
describe("pruefeAnfrageform", () => {
  const einzeln = { jsonrpc: "2.0", id: 1, method: "tools/list" };

  it("laesst eine einzelne Nachricht durch", () => {
    expect(pruefeAnfrageform({ body: einzeln, headers: {} })).toBeNull();
  });

  it("weist jedes Array ab, auch ein kurzes", () => {
    expect(pruefeAnfrageform({ body: [einzeln], headers: {} })).toMatchObject({ status: 400, code: -32600 });
  });

  it("misst in Cloud Functions die tatsaechlich empfangenen Bytes, nicht die Angabe des Clients", () => {
    const ablehnung = pruefeAnfrageform({
      body: einzeln,
      headers: { "content-length": "10" },
      rawBody: Buffer.alloc(MAX_MCP_BODY_BYTES + 1),
    });
    expect(ablehnung).toMatchObject({ status: 413 });
  });

  it("nimmt ohne rawBody die Content-Length", () => {
    expect(pruefeAnfrageform({ body: einzeln, headers: { "content-length": String(MAX_MCP_BODY_BYTES + 1) } })).toMatchObject({
      status: 413,
    });
    expect(pruefeAnfrageform({ body: einzeln, headers: { "content-length": String(MAX_MCP_BODY_BYTES) } })).toBeNull();
  });
});

describe("POST /mcp ueber HTTP", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = mcpApp.listen(0, "127.0.0.1");
    await new Promise<void>((fertig) => server.once("listening", () => fertig()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });

  afterAll(() => {
    server.close();
  });

  function post(body: string, ip: string): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-forwarded-for": ip,
      },
      body,
    });
  }

  it("weist einen Batch mit 400 und JSON-RPC-Fehler ab", async () => {
    const batch = Array.from({ length: 300 }, (_, i) => ({
      jsonrpc: "2.0",
      id: i,
      method: "tools/call",
      params: { name: "list_jobs", arguments: {} },
    }));
    const antwort = await post(JSON.stringify(batch), "198.51.100.1");
    expect(antwort.status).toBe(400);
    const inhalt = (await antwort.json()) as { error: { code: number; message: string } };
    expect(inhalt.error.code).toBe(-32600);
    expect(inhalt.error.message).toMatch(/Batch/);
  });

  // Die Ablehnung zaehlt nicht gegen das Kontingent: sie kostet uns nichts,
  // und ein Client, der einmal ein Array schickt, soll danach normal weiterarbeiten.
  it("verbraucht mit abgewiesenen Batches kein Kontingent", async () => {
    const ip = "198.51.100.2";
    for (let i = 0; i < 70; i++) {
      const antwort = await post("[]", ip);
      expect(antwort.status).toBe(400);
    }
    const einzeln = await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }), ip);
    expect(einzeln.status).not.toBe(429);
  });

  it("weist eine zu grosse Anfrage mit 413 und JSON-RPC-Fehler ab", async () => {
    const riesig = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "fuege_dokument_hinzu", arguments: { text: "x".repeat(MAX_MCP_BODY_BYTES) } },
    });
    const antwort = await post(riesig, "198.51.100.3");
    expect(antwort.status).toBe(413);
    const inhalt = (await antwort.json()) as { error: { message: string } };
    expect(inhalt.error.message).toMatch(/upload page/);
  });
});
