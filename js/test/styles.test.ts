import { describe, expect, it } from "vitest";

import { STYLES } from "../src/styles";

describe("type selector styles", () => {
  it("lets a segment grow when its label wraps", () => {
    const tab = STYLES.match(/^\.tab \{([^}]*)\}/m)?.[1] ?? "";
    expect(tab).toContain("min-height: 32px");
    expect(tab).not.toMatch(/(^|[\s;])height:/);
  });
});
