import { describe, expect, it } from "vitest";
import { blockedWordIn } from "./moderation";

const words = [
  { word: "troll", anywhere: false },
  { word: "badword", anywhere: true },
];

describe("blocked words in names", () => {
  it("catches a blocked word however it's written", () => {
    for (const name of ["troll", "TROLL", "Tr0ll", "t r o l l", "t.r.o.l.l", "trooolll", "trôll"]) {
      expect(blockedWordIn(name, words), name).toBe("troll");
    }
  });

  it("matches whole words unless the word is blocked anywhere", () => {
    expect(blockedWordIn("Ada the troll", words)).toBe("troll");
    // "troll" alone, as a whole word only, doesn't catch a longer word.
    expect(blockedWordIn("Trollope fan", words)).toBeNull();
    expect(blockedWordIn("mybadwordname", words)).toBe("badword");
    expect(blockedWordIn("b4dw0rd99", words)).toBe("badword");
  });

  it("lets ordinary names through", () => {
    for (const name of ["Ada", "Tolu 😀", "Chidi_2", "Ngozi O.", "Zoë"]) {
      expect(blockedWordIn(name, words), name).toBeNull();
    }
    expect(blockedWordIn("anything", [])).toBeNull();
  });
});
