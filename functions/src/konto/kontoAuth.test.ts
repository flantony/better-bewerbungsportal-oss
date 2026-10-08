import { describe, expect, it } from "vitest";
import { anmeldungAusAnfrage, bearerToken, uidAusAnfrage } from "./kontoAuth";

/**
 * WOZU: Das ist die einzige Tuer zu den Kontodaten - die Rules sind deny-all.
 * Jeder Fall, in dem hier faelschlich eine uid herauskommt, ist ein Zugriff auf
 * ein fremdes Konto.
 */
describe("bearerToken", () => {
  it("liest das Token hinter 'Bearer '", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
  });
  it("lehnt ein fehlendes oder anderes Schema ab", () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
  });
});

describe("uidAusAnfrage", () => {
  it("gibt die uid eines gueltigen Tokens zurueck", async () => {
    const uid = await uidAusAnfrage("Bearer gut", async () => ({ uid: "u1" }));
    expect(uid).toBe("u1");
  });
  it("gibt null zurueck, wenn die Pruefung wirft", async () => {
    const uid = await uidAusAnfrage("Bearer schlecht", async () => {
      throw new Error("auth/argument-error");
    });
    expect(uid).toBeNull();
  });
  it("fragt ohne Token gar nicht erst nach", async () => {
    let gefragt = false;
    const uid = await uidAusAnfrage(undefined, async () => {
      gefragt = true;
      return { uid: "u1" };
    });
    expect(uid).toBeNull();
    expect(gefragt).toBe(false);
  });
});

/**
 * WOZU: `emailBestaetigt` entscheidet ueber die 409-Sperre in
 * kontoBenachrichtigungSetzen - kommt sie hier falsch heraus, laesst sich die
 * Sperre umgehen (true faelschlich) oder ein bestaetigtes Konto blockiert
 * (false faelschlich).
 */
describe("anmeldungAusAnfrage", () => {
  it("liefert uid und emailBestaetigt:true bei email_verified:true", async () => {
    const anmeldung = await anmeldungAusAnfrage("Bearer gut", async () => ({ uid: "u1", email_verified: true }));
    expect(anmeldung).toEqual({ uid: "u1", emailBestaetigt: true, email: null });
  });

  it("liefert emailBestaetigt:false, wenn email_verified fehlt", async () => {
    const anmeldung = await anmeldungAusAnfrage("Bearer gut", async () => ({ uid: "u1" }));
    expect(anmeldung).toEqual({ uid: "u1", emailBestaetigt: false, email: null });
  });

  it("liefert emailBestaetigt:false bei email_verified:false", async () => {
    const anmeldung = await anmeldungAusAnfrage("Bearer gut", async () => ({ uid: "u1", email_verified: false }));
    expect(anmeldung).toEqual({ uid: "u1", emailBestaetigt: false, email: null });
  });

  it("gibt null zurueck, wenn die Pruefung wirft", async () => {
    const anmeldung = await anmeldungAusAnfrage("Bearer schlecht", async () => {
      throw new Error("auth/argument-error");
    });
    expect(anmeldung).toBeNull();
  });

  it("fragt ohne Token gar nicht erst nach", async () => {
    let gefragt = false;
    const anmeldung = await anmeldungAusAnfrage(undefined, async () => {
      gefragt = true;
      return { uid: "u1", email_verified: true };
    });
    expect(anmeldung).toBeNull();
    expect(gefragt).toBe(false);
  });

  /**
   * WOZU (kontoExport): der Export braucht die tatsaechliche
   * Adresse - aus dem geprueften ID-Token, nie aus Firestore (dort wird sie
   * nirgends gespeichert).
   */
  it("liefert die E-Mail-Adresse aus dem Token", async () => {
    const anmeldung = await anmeldungAusAnfrage("Bearer gut", async () => ({
      uid: "u1",
      email_verified: true,
      email: "bewerber@example.com",
    }));
    expect(anmeldung).toEqual({ uid: "u1", emailBestaetigt: true, email: "bewerber@example.com" });
  });

  it("liefert email:null, wenn das Token keine Adresse traegt", async () => {
    const anmeldung = await anmeldungAusAnfrage("Bearer gut", async () => ({ uid: "u1" }));
    expect(anmeldung?.email).toBeNull();
  });
});
