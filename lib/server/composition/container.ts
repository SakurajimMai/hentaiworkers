import { SystemClock, type Clock } from '../shared/clock';
import {
  collectRedactionSecrets,
  getProcessEnvironment,
  parseConfig,
  type AppConfig,
  type EnvironmentSource,
} from '../shared/config';
import { createLogger, type Logger, type LogSink } from '../shared/logger';

export type ContainerOverrides = Readonly<{
  env?: EnvironmentSource;
  config?: AppConfig;
  clock?: Clock;
  logger?: Logger;
  /** Test hook: capture default logger output without bypassing secret wiring. */
  logSink?: LogSink;
}>;

export interface ServiceContainer {
  getConfig(): AppConfig;
  getClock(): Clock;
  getLogger(): Logger;
}

export function createContainer(
  overrides: ContainerOverrides = {},
): ServiceContainer {
  let config = overrides.config;
  let clock = overrides.clock;
  let logger = overrides.logger;

  const serviceContainer: ServiceContainer = {
    getConfig() {
      config ??= parseConfig(overrides.env ?? getProcessEnvironment());
      return config;
    },
    getClock() {
      clock ??= new SystemClock();
      return clock;
    },
    getLogger() {
      if (!logger) {
        const resolvedConfig = serviceContainer.getConfig();
        logger = createLogger({
          clock: serviceContainer.getClock(),
          secrets: collectRedactionSecrets(resolvedConfig),
          ...(overrides.logSink ? { sink: overrides.logSink } : {}),
        });
      }
      return logger;
    },
  };

  return serviceContainer;
}

export const container = createContainer();
