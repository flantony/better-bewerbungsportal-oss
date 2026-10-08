import { geteilterHinweis, type GeteilterHinweis } from "./geteilterHinweis";

/**
 * Der Wegweiser zu `erstelle_suchprofil_link` im Rueckgabewert von list_jobs
 * und zaehle_treffer - nur wenn die Suche etwas gefunden hat.
 *
 * WOZU: Ein Bewerber, der fragt "sag mir Bescheid, wenn so etwas Neues kommt",
 * stellt die Frage NACH einer Suche, mit den Filtern noch im Kontext. Genau
 * dort muss das Werkzeug auftauchen, im Rueckgabewert, nicht nur in seiner
 * eigenen Beschreibung, die beim Verbindungsaufbau gelesen
 * und bis dahin vergessen ist.
 *
 * EIGENES FELD statt `hinweis`, aus demselben Grund wie `herkunftDerAngaben`:
 * es trifft bei jeder Suche mit Treffern zu und wuerde die situativen Hinweise
 * (Leerfall, Lesedeckel) verdraengen - und ein `hinweis` an einer gefuellten
 * Liste ist ein Signal, dass etwas zu tun ist.
 *
 * Bei einer LEEREN Suche fehlt er: dort ist der naechste Schritt eine
 * bessere Suche, nicht "dann eben benachrichtigen lassen".
 *
 * Ohne Bewerberhaelfte: was der Bewerber hoeren soll, bringt erst das
 * Werkzeug selbst mit.
 */
export const NEUE_STELLEN_PER_MAIL: GeteilterHinweis = geteilterHinweis(
  "Will der Bewerber von kuenftigen passenden Stellen erfahren, macht erstelle_suchprofil_link aus den Filtern " +
    "dieser Suche (ohne alter, limit, sortierung, cursor) einen Link, mit dem er sie in seinem Konto auf der " +
    "Website speichert - Mails kommen dann nur bei neuen Treffern. Anbieten, wenn es zum Wunsch passt, nicht nach jeder Suche.",
);
