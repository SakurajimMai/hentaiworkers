import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import {
  createSessionOptions,
  type SessionData,
  type SessionEnv,
} from '../../identity/session-config';
import type { SessionPort } from '../../identity/ports/session';

export class IronSessionAdapter implements SessionPort {
  constructor(private readonly env: SessionEnv = process.env) {}

  private async session() {
    return getIronSession<SessionData>(await cookies(), createSessionOptions(this.env));
  }

  async get(): Promise<SessionData> {
    const session = await this.session();
    return {
      userId: session.userId,
      username: session.username,
      role: session.role,
      isLoggedIn: !!session.isLoggedIn,
    };
  }

  async save(data: SessionData): Promise<void> {
    const session = await this.session();
    session.userId = data.userId;
    session.username = data.username;
    session.role = data.role;
    session.isLoggedIn = data.isLoggedIn;
    await session.save();
  }

  async destroy(): Promise<void> {
    const session = await this.session();
    session.destroy();
  }
}
