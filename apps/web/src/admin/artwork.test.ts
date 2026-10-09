import { DEFAULT_TOPIC_COLORS } from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { dominantColors, type PixelImage } from "./artwork";

/** One pixel as the canvas hands it over: red, green, blue, alpha. */
const px = (r: number, g: number, b: number, a = 255): number[] => [r, g, b, a];

/** A picture's pixels, one pixel at a time. */
const picture = (...pixels: number[][]): PixelImage => ({
  data: new Uint8ClampedArray(pixels.flat()),
});

describe("the two colours taken from a picture", () => {
  it("keeps the two fullest bins, each as the average of its own pixels", () => {
    // A 2×2 of three pure reds and one blue.
    const colors = dominantColors(
      picture(px(255, 0, 0), px(255, 0, 0), px(255, 0, 0), px(0, 0, 255)),
    );

    expect(colors).toEqual(["#ff0000", "#0000ff"]);
  });

  it("falls back to the defaults when the picture holds no usable colour", () => {
    // Every pixel is fully transparent, so no bin is ever filled.
    expect(dominantColors(picture(px(255, 0, 0, 0), px(0, 0, 255, 0)))).toEqual([
      ...DEFAULT_TOPIC_COLORS,
    ]);
  });

  it("keeps the one colour it finds and fills the other slot from the defaults", () => {
    expect(dominantColors(picture(px(18, 52, 120), px(18, 52, 120)))).toEqual([
      "#123478",
      DEFAULT_TOPIC_COLORS[1],
    ]);
  });

  it("only counts pixels that are at least half opaque", () => {
    // The 50%-transparent pixel is out; the one just over the line is the whole picture.
    expect(dominantColors(picture(px(9, 9, 9, 127), px(1, 2, 3, 128)))).toEqual([
      "#010203",
      DEFAULT_TOPIC_COLORS[1],
    ]);
  });

  it("breaks a tie between bins by their key, lowest first", () => {
    // One red (bin f00) and one blue (bin 00f): same count, so the key decides.
    expect(dominantColors(picture(px(255, 0, 0), px(0, 0, 255)))).toEqual(["#0000ff", "#ff0000"]);
  });

  it("averages each bin's pixels rather than the bucket they fell into", () => {
    // (16,0,0) and (31,1,1) share bin 1,0,0: the mean is (23.5, 0.5, 0.5) → #180101.
    expect(dominantColors(picture(px(16, 0, 0), px(31, 1, 1)))).toEqual([
      "#180101",
      DEFAULT_TOPIC_COLORS[1],
    ]);
  });
});
