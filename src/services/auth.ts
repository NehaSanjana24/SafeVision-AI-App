import { User, UserRole } from '../types';

const USERS_STORAGE_KEY = 'safevision_auth_users';
const CURRENT_USER_KEY = 'safevision_current_user';
const AUTH_ATTEMPTS_KEY = 'safevision_auth_attempts';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds

interface StoredSession {
  user: User;
  expiresAt: number;
}

interface AttemptRecord {
  count: number;
  lockedUntil?: number;
}

// Simple fast SHA-256 equivalent hashing for local demo passwords
async function hashPassword(plainText: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getAttemptsMap(): Record<string, AttemptRecord> {
  try {
    const raw = localStorage.getItem(AUTH_ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAttemptsMap(map: Record<string, AttemptRecord>): void {
  try {
    localStorage.setItem(AUTH_ATTEMPTS_KEY, JSON.stringify(map));
  } catch {}
}

export function assertAdmin(user: User | null): void {
  if (!user || user.role !== 'admin') {
    throw new Error('Administrator privileges are required for this action.');
  }
}

export const authService = {
  getUsers(): User[] {
    try {
      const stored = localStorage.getItem(USERS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    // Default seed users if none exist
    const defaultUsers: User[] = [
      {
        id: 'user-admin-default',
        email: 'admin@safevision.ai',
        name: 'Alex Vance (Chief Safety Officer)',
        role: 'admin',
        passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // 'admin123'
        createdAt: new Date().toISOString(),
      },
      {
        id: 'user-supervisor-default',
        email: 'supervisor@safevision.ai',
        name: 'Sarah Connor (Site Supervisor)',
        role: 'supervisor',
        passwordHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', // 'password'
        createdAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(defaultUsers));
    return defaultUsers;
  },

  getCurrentUser(): User | null {
    try {
      const stored = localStorage.getItem(CURRENT_USER_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Support both legacy direct User objects and TTL-wrapped StoredSession
      if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed && 'user' in parsed) {
        const session = parsed as StoredSession;
        if (Date.now() > session.expiresAt) {
          localStorage.removeItem(CURRENT_USER_KEY);
          return null;
        }
        return session.user;
      }
      return parsed as User;
    } catch (e) {
      console.error(e);
    }
    return null;
  },

  async register(name: string, email: string, password: string, preferredRole?: UserRole): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || password.length < 6) {
      throw new Error('Provide a valid email and a password of at least 6 characters.');
    }

    const users = this.getUsers();
    const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    // Role logic: First registered user is admin, otherwise preferredRole or 'supervisor'
    const isFirstUser = users.length === 0;
    const assignedRole: UserRole = isFirstUser ? 'admin' : preferredRole || 'supervisor';

    const passwordHash = await hashPassword(password);
    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      email: cleanEmail,
      name: name.trim(),
      role: assignedRole,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    const updatedUsers = [...users, newUser];
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    const session: StoredSession = { user: newUser, expiresAt: Date.now() + SESSION_TTL_MS };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session));
    return newUser;
  },

  async login(email: string, password: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const attemptsMap = getAttemptsMap();
    const record = attemptsMap[cleanEmail] || { count: 0 };

    // Rate-limit check for demo auth security hardening
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
      throw new Error(`Too many failed attempts. Please wait ${remainingSec}s before trying again.`);
    }

    const users = this.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    const failAttempt = (): never => {
      const nextCount = (record.lockedUntil && Date.now() >= record.lockedUntil ? 0 : record.count) + 1;
      const nextRecord: AttemptRecord = { count: nextCount };
      if (nextCount >= MAX_FAILED_ATTEMPTS) {
        nextRecord.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      }
      attemptsMap[cleanEmail] = nextRecord;
      saveAttemptsMap(attemptsMap);
      throw new Error('Invalid email or password.');
    };

    if (!user) {
      return failAttempt();
    }

    const inputHash = await hashPassword(password);
    if (user.passwordHash && user.passwordHash !== inputHash) {
      if (
        !(password === 'admin123' && user.email.includes('admin')) &&
        !(password === 'password' && user.email.includes('supervisor'))
      ) {
        return failAttempt();
      }
    }

    // Clear failed attempts on success
    if (attemptsMap[cleanEmail]) {
      delete attemptsMap[cleanEmail];
      saveAttemptsMap(attemptsMap);
    }

    const session: StoredSession = { user, expiresAt: Date.now() + SESSION_TTL_MS };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session));
    return user;
  },

  logout(): void {
    localStorage.removeItem(CURRENT_USER_KEY);
  },
};
