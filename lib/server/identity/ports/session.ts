import type { SessionData } from '../session-config';

export type SessionSnapshot = Readonly<SessionData>;

export interface SessionPort {
  get(): Promise<SessionData>;
  save(data: SessionData): Promise<void>;
  destroy(): Promise<void>;
}
