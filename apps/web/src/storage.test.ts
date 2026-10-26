import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBankMistakes,
  getAllBankMistakes,
  getBankMistakes,
  saveBankMistakes,
} from "./storage";

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
};
vi.stubGlobal("localStorage", localStorageMock);

describe("bank mistakes storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves missed questions for a bank", () => {
    expect(getBankMistakes("bank_1")).toEqual([]);

    saveBankMistakes("bank_1", ["q1", "q2", "q3"]);
    expect(getBankMistakes("bank_1")).toEqual(["q1", "q2", "q3"]);

    // Saving duplicate IDs keeps unique set
    saveBankMistakes("bank_1", ["q2", "q4"]);
    expect(getBankMistakes("bank_1")).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("clears specific mastered questions or all questions for a bank", () => {
    saveBankMistakes("bank_2", ["qA", "qB", "qC"]);

    // Clear specific
    clearBankMistakes("bank_2", ["qB"]);
    expect(getBankMistakes("bank_2")).toEqual(["qA", "qC"]);

    // Clear all
    clearBankMistakes("bank_2");
    expect(getBankMistakes("bank_2")).toEqual([]);
  });

  it("lists all banks with pending mistakes for dashboard aggregation", () => {
    saveBankMistakes("bank_math", ["m1", "m2"]);
    saveBankMistakes("bank_physics", ["p1"]);

    const all = getAllBankMistakes();
    expect(all["bank_math"]).toEqual(["m1", "m2"]);
    expect(all["bank_physics"]).toEqual(["p1"]);
  });
});
