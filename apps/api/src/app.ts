import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { BusinessError } from "./domain-service.js";
import { registerRoutes } from "./routes.js";

export function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });

  void app.register(cors, { origin: false });

  app.get("/health", () => ({
    status: "ok" as const,
    service: "field-operations-api",
    timestamp: new Date().toISOString(),
  }));

  void app.register(registerRoutes);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ code: "invalid_request", issues: error.issues });
    if (error instanceof BusinessError)
      return reply
        .code(error.statusCode)
        .send({ code: error.code, message: error.message });
    if (error instanceof Error && "statusCode" in error) {
      const statusCode = Number(error.statusCode);
      const code = "code" in error ? String(error.code) : "invalid_request";
      if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500)
        return reply.code(statusCode).send({ code, message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({
      code: "internal_error",
      message: "The request could not be completed",
    });
  });

  return app;
}
