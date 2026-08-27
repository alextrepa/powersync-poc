import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("API health", () => {
  it("reports the service as healthy through HTTP", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "field-operations-api",
    });
    await app.close();
  });
});
