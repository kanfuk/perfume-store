import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("image assistant server-only secrets", () => {
  it("does not reference the Brave key from the client component", () => {
    const client = readFileSync("components/admin/ImageAssistantPanel.tsx", "utf8");
    expect(client).not.toContain("BRAVE_SEARCH_API_KEY");
    expect(client).not.toContain("IMAGE_ASSISTANT_SIGNING_SECRET");
    expect(client).not.toContain("IMAGE_ASSISTANT_ALLOWED_DOMAINS");
  });
});
