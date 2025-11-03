import pino from "pino";

let loggerInstance: pino.Logger | null = null;

export function getLogger(verbose = false): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = pino({
      level: verbose ? "debug" : "info",
      transport: verbose
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
    });
  }
  return loggerInstance;
}

export type Logger = pino.Logger;

