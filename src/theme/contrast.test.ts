import { describe, it, expect } from "vitest";
import { luminance, autoFg } from "./contrast";

describe("luminance", () => {
  it("is ~1.0 for white", () => {
    expect(luminance("#FFFFFF")).toBeCloseTo(1.0, 2);
  });

  it("is 0 for black", () => {
    expect(luminance("#000000")).toBeCloseTo(0, 3);
  });

  it("is high for yellow", () => {
    expect(luminance("#FFDC96")).toBeGreaterThan(0.5);
  });

  it("is low for dark navy", () => {
    expect(luminance("#1a1d28")).toBeLessThan(0.1);
  });
});

describe("autoFg", () => {
  it("returns dark text on light background", () => {
    expect(autoFg("#FFDC96")).toBe("#3a2e10");
  });

  it("returns light text on dark background", () => {
    expect(autoFg("#1a1d28")).toBe("#f0f0f0");
  });
});
