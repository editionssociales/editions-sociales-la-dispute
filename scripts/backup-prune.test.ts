import { describe, expect, it } from "vitest";
import { parseBackupPathname, selectPathnamesToDelete } from "./backup-prune.mjs";

describe("parseBackupPathname", () => {
  it("reconnaît un pathname quotidien daté", () => {
    expect(parseBackupPathname("backups/daily/catalogue-20260716.dump.age")).toEqual({
      kind: "daily",
      date: "2026-07-16",
    });
  });

  it("reconnaît un pathname mensuel daté", () => {
    expect(parseBackupPathname("backups/monthly/catalogue-20260701.dump.age")).toEqual({
      kind: "monthly",
      date: "2026-07-01",
    });
  });

  it("ignore les pathnames médias (jamais purgés)", () => {
    expect(parseBackupPathname("media/couvertures/gorz.jpg")).toBeNull();
  });

  it("ignore tout pathname hors gabarit (défensif)", () => {
    expect(parseBackupPathname("backups/daily/autre-chose.txt")).toBeNull();
    expect(parseBackupPathname("backups/weekly/catalogue-20260716.dump.age")).toBeNull();
    expect(parseBackupPathname("catalogue-20260716.dump.age")).toBeNull();
  });
});

describe("selectPathnamesToDelete", () => {
  function pathname(kind: "daily" | "monthly", date: string): string {
    return `backups/${kind}/catalogue-${date.replaceAll("-", "")}.dump.age`;
  }

  it("ne purge rien tant que la rétention n'est pas dépassée", () => {
    const pathnames = ["2026-07-14", "2026-07-15", "2026-07-16"].map((d) => pathname("daily", d));
    expect(selectPathnamesToDelete(pathnames, { dailyRetention: 30, monthlyRetention: 12 })).toEqual([]);
  });

  it("garde les N plus récents quotidiens, purge le reste", () => {
    const dates = ["2026-07-14", "2026-07-15", "2026-07-16"];
    const pathnames = dates.map((d) => pathname("daily", d));
    const result = selectPathnamesToDelete(pathnames, { dailyRetention: 2, monthlyRetention: 12 });
    expect(result).toEqual([pathname("daily", "2026-07-14")]); // le plus ancien des 3
  });

  it("compte quotidiens et mensuels séparément (une copie mensuelle ne consomme pas le quota quotidien)", () => {
    const pathnames = [
      pathname("daily", "2026-06-01"),
      pathname("daily", "2026-07-01"),
      pathname("monthly", "2026-06-01"),
      pathname("monthly", "2026-07-01"),
    ];
    // Rétention quotidienne à 1 : ne purge que le plus ancien QUOTIDIEN, jamais les mensuels du même jour.
    const result = selectPathnamesToDelete(pathnames, { dailyRetention: 1, monthlyRetention: 12 });
    expect(result).toEqual([pathname("daily", "2026-06-01")]);
  });

  it("ne touche jamais media/… ni les pathnames non reconnus, même en surnombre", () => {
    const pathnames = [
      "media/couvertures/a.jpg",
      "media/couvertures/b.jpg",
      pathname("daily", "2026-07-16"),
    ];
    const result = selectPathnamesToDelete(pathnames, { dailyRetention: 0, monthlyRetention: 0 });
    expect(result).toEqual([pathname("daily", "2026-07-16")]);
  });

  it("purge au-delà de 30 quotidiens et 12 mensuels (défauts du plan)", () => {
    const daily = Array.from({ length: 32 }, (_, i) =>
      pathname("daily", `2026-07-${String(i + 1).padStart(2, "0")}`),
    );
    const monthly = Array.from({ length: 13 }, (_, i) =>
      pathname("monthly", `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`),
    );
    const result = selectPathnamesToDelete([...daily, ...monthly]);
    expect(result).toHaveLength(2 + 1); // 32-30 quotidiens + 13-12 mensuels
  });
});
