import { describe, it, expect, vi } from "vitest";
import { retryCache } from "@/lib/office/retryCache";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("retryCache", () => {
  it("loads once, reports ready, then serves the value", async () => {
    const load = vi.fn().mockResolvedValue("bg");
    const onReady = vi.fn();
    const cache = retryCache(load, onReady, 1000, () => 0);
    expect(cache.get("noon")).toBeNull();
    expect(cache.get("noon")).toBeNull();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(cache.get("noon")).toBe("bg");
  });

  it("retries a failed load after the delay, not before", async () => {
    let t = 0;
    const load = vi.fn().mockRejectedValueOnce(new Error("network blip")).mockResolvedValue("bg");
    const cache = retryCache(load, () => {}, 1000, () => t);
    cache.get("noon");
    await flush();
    t = 999;
    expect(cache.get("noon")).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    t = 1000;
    expect(cache.get("noon")).toBeNull();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.get("noon")).toBe("bg");
  });
});
