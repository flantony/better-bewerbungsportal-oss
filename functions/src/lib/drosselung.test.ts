import { describe, it, expect } from "vitest";
import { clientKeyFromForwardedFor, createRateLimiter, drosselSchluessel } from "./drosselung";

/**
 * WOZU: ein IPv6-Anschluss hat ein ganzes /64.
 * Mit der vollen Adresse als Schluessel bekaeme jede Anfrage aus diesem Netz
 * einen frischen Bucket - die Drosselung waere per Adresswechsel aufhebbar.
 */
describe("drosselSchluessel", () => {
  it("laesst IPv4 unveraendert", () => {
    expect(drosselSchluessel("203.0.113.7")).toBe("203.0.113.7");
  });

  it("fasst IPv6-Adressen desselben /64 zusammen", () => {
    const a = drosselSchluessel("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
    const b = drosselSchluessel("2001:db8:1234:5678::1");
    expect(a).toBe("2001:db8:1234:5678::/64");
    expect(b).toBe(a);
  });

  it("trennt verschiedene /64-Netze", () => {
    expect(drosselSchluessel("2001:db8:1234:5678::1")).not.toBe(drosselSchluessel("2001:db8:1234:5679::1"));
  });

  it("normalisiert Schreibweisen (Gross/klein, fuehrende Nullen, Kurzform)", () => {
    expect(drosselSchluessel("2001:0DB8:0000:0001:0:0:0:1")).toBe("2001:db8:0:1::/64");
    expect(drosselSchluessel("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("macht aus IPv4-in-IPv6 die IPv4-Adresse", () => {
    expect(drosselSchluessel("::ffff:198.51.100.4")).toBe("198.51.100.4");
  });

  it("verkraftet Klammern, Port und Zonenangabe", () => {
    expect(drosselSchluessel("[2001:db8:1:2::9]:443")).toBe("2001:db8:1:2::/64");
    expect(drosselSchluessel("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("laesst Unlesbares als eigenen Schluessel stehen, statt zu werfen", () => {
    expect(drosselSchluessel("kein:gueltiges::ip::")).toBe("kein:gueltiges::ip::");
    expect(drosselSchluessel("unknown")).toBe("unknown");
  });
});

describe("clientKeyFromForwardedFor mit IPv6", () => {
  it("nimmt den rechtesten Eintrag und kuerzt ihn auf das /64", () => {
    expect(clientKeyFromForwardedFor("1.1.1.1, 2001:db8:a:b:1:2:3:4", undefined)).toBe("2001:db8:a:b::/64");
  });

  it("sperrt einen Angreifer, der innerhalb seines /64 die Adresse wechselt", () => {
    const limiter = createRateLimiter(() => 0);
    const quota = { capacity: 3, refillPerMinute: 1 };
    const erlaubt = Array.from({ length: 5 }, (_, i) =>
      limiter.check(clientKeyFromForwardedFor(`2001:db8:a:b::${i + 1}`, undefined), quota, "test").allowed,
    );
    expect(erlaubt).toEqual([true, true, true, false, false]);
  });
});
