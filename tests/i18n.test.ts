import { describe, expect, it } from "vitest";
import { translationKeysMatch } from "../src/i18n";

describe("localization", () => {
  it("keeps English and Chinese keys in sync", () => {
    expect(translationKeysMatch()).toBe(true);
  });
});
