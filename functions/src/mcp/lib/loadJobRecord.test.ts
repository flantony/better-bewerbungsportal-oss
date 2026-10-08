import { describe, it, expect } from "vitest";
import { JobNotFoundError } from "./loadJobRecord";

/**
 * WOZU: Dieser Fehlertext geht unveraendert an das fremde KI-Tool - bei
 * `get_job`, `get_document_requirements`, `fuelle_formular` und beim Eroeffnen
 * und Schliessen der Bewerbungsmappe. Er ist damit die einzige Steuerung, die
 * genau dann ankommt, wenn der Client falsch abbiegt.
 */
describe("JobNotFoundError", () => {
  it("ist deutsch formuliert wie die uebrigen Meldungen dieses Servers", () => {
    const meldung = new JobNotFoundError().message;
    expect(meldung).not.toMatch(/No active job found/);
    expect(meldung).toMatch(/Ausschreibung/);
  });

  it("nennt den naechsten Aufruf, statt den Client in der Sackgasse zu lassen", () => {
    expect(new JobNotFoundError().message).toMatch(/list_jobs/);
  });

  /**
   * Der haeufigste Grund ist ein abgelaufener Bewerbungsschluss - ohne diesen
   * Satz liest ein Client den Fehler als Stoerung unseres Servers und sagt dem
   * Bewerber, es sei etwas kaputt, statt "diese Stelle ist nicht mehr offen".
   */
  it("nennt den wahrscheinlichen Grund, damit der Client keine Stoerung meldet", () => {
    const meldung = new JobNotFoundError().message;
    expect(meldung).toMatch(/Bewerbungsschluss/);
    expect(meldung).toMatch(/Störung/);
  });
});
