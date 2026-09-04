// SPDX-License-Identifier: GPL-2.0-or-later

import { describe, expect, it } from "vitest";
import { sanitizeErrorText } from "../src/error-text";

describe("runtime error privacy", () => {
  it("redacts local URLs and Windows paths containing spaces", () => {
    const result = sanitizeErrorText(
      new Error("Failed http://127.0.0.1:1234/private?token=secret while reading C:\\My Scenes\\private scene.sog")
    );
    expect(result).not.toContain("token=secret");
    expect(result).not.toContain("My Scenes");
    expect(result).toContain("[local asset]");
    expect(result).toContain("[local file]");
  });

  it("redacts common macOS and Linux user paths and collapses newlines", () => {
    const result = sanitizeErrorText("Could not read /Users/alice/My Scene/file.ply\nparser failed");
    expect(result).toBe("Could not read [local file] parser failed");
  });

  it("redacts UNC paths", () => {
    expect(sanitizeErrorText("Could not read \\\\server\\private share\\scene.sog")).toBe(
      "Could not read [local file]"
    );
  });
});
