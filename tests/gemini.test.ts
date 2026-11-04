import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { draftEndOfDay, geminiEnabled } from "@/lib/gemini";

const SOD = "- Update CRM contacts\n- Draft the weekly newsletter";

function geminiReply(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("draftEndOfDay (Gemini past-tense draft)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("returns Gemini's rewrite and sends only the task text", async () => {
    fetchMock.mockResolvedValue(
      geminiReply("- Updated CRM contacts\n- Drafted the weekly newsletter\n"),
    );

    await expect(draftEndOfDay(SOD)).resolves.toBe(
      "- Updated CRM contacts\n- Drafted the weekly newsletter",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: SOD }] }]);
  });

  it("skips thought parts and joins the text parts", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "thinking…", thought: true },
                  { text: "- Updated CRM" },
                  { text: " contacts" },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(draftEndOfDay(SOD)).resolves.toBe("- Updated CRM contacts");
  });

  it("returns null on an HTTP error (e.g. free-tier quota hit)", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(draftEndOfDay(SOD)).resolves.toBeNull();
  });

  it("returns null when the request times out or the network fails", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(draftEndOfDay(SOD)).resolves.toBeNull();
  });

  it("returns null for an empty reply", async () => {
    fetchMock.mockResolvedValue(geminiReply("   "));
    await expect(draftEndOfDay(SOD)).resolves.toBeNull();
  });

  it("does not call Gemini without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(geminiEnabled()).toBe(false);
    await expect(draftEndOfDay(SOD)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
