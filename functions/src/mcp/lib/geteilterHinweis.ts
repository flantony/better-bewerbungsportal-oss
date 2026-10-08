/**
 * Ein Hinweis in zwei Hälften: was der Bewerber hören darf, und was nur die
 * anfragende KI angeht.
 *
 * WOZU: Unsere Hinweise sind an das Modell adressiert - Imperativ, Feldnamen in
 * Backticks, und vom Bewerber ist in der dritten Person die Rede ("bitte den
 * Bewerber nicht, einen hochzuladen"). Ein schwacher Client reicht so einen Satz
 * wörtlich durch, und dann liest der Bewerber eine interne Notiz über sich.
 *
 * Deshalb sind die Adressaten getrennt: `nurFuerDich` darf so technisch sein,
 * wie es nützlich ist, und `fuerDenBewerber` steht für sich - ohne Feldnamen,
 * ohne Anweisung, in der Anrede an ihn selbst.
 *
 * `fuerDenBewerber` fehlt dort, wo es nichts zu sagen gibt: die
 * Zielhilfe von zaehle_treffer oder ein "nimm die downloadUrl statt der Datei"
 * sind reine Wegweiser. Eine erfundene Bewerberhälfte wäre schlechter als keine.
 */
export interface GeteilterHinweis {
  /** Regieanweisung an die KI. Nicht vorlesen, nicht zitieren. */
  nurFuerDich: string;
  /** Ein Satz für den Bewerber, wörtlich weitergebbar. Fehlt, wenn es keinen gibt. */
  fuerDenBewerber?: string;
}

/**
 * Baut den Hinweis so, dass die Bewerberhälfte im JSON zuerst steht - ein
 * Modell, das nur den Anfang liest, sieht dann das Zitierbare.
 */
export function geteilterHinweis(nurFuerDich: string, fuerDenBewerber?: string): GeteilterHinweis {
  return {
    ...(fuerDenBewerber ? { fuerDenBewerber } : {}),
    nurFuerDich,
  } as GeteilterHinweis;
}

/**
 * Mehrere Hinweise zu einem zusammenfassen - hälftenweise, damit die
 * Regieanweisung des einen nicht in der Bewerberhälfte des anderen landet.
 *
 * Mehrere können gleichzeitig zutreffen (s. zaehle_treffer: kein Treffer UND
 * eine Facette ohne Zahlen). Dann müssen beide ankommen, sonst fällt genau der
 * weg, der aus der Sackgasse führt.
 */
export function fasseHinweiseZusammen(teile: (GeteilterHinweis | null)[]): GeteilterHinweis | null {
  const vorhanden = teile.filter((teil): teil is GeteilterHinweis => teil !== null);
  if (vorhanden.length === 0) return null;

  const bewerber = vorhanden
    .map((teil) => teil.fuerDenBewerber)
    .filter((satz): satz is string => Boolean(satz))
    .join(" ");

  return geteilterHinweis(
    vorhanden.map((teil) => teil.nurFuerDich).join(" "),
    bewerber || undefined,
  );
}
