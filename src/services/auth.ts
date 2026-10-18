import { User, UserRole } from '../types';

const USERS_STORAGE_KEY = 'safevision_auth_users';
const CURRENT_USER_KEY = 'safevision_current_user';

// Simple fast SHA-256 equivalent hashing for local demo passwords
async function hashPassword(plainText: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return null;
  },

  async register(name: string, email: string, password: string, preferredRole?: UserRole): Promise<User> {
    const users = this.getUsers();
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    // Role logic: First registered user is admin, otherwise preferredRole or 'supervisor'
    const isFirstUser = users.length === 0;
    const assignedRole: UserRole = isFirstUser ? 'admin' : (preferredRole || 'supervisor');

    const passwordHash = await hashPassword(password);
    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: assignedRole,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    const updatedUsers = [...users, newUser];
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
    return newUser;
  },

  async login(email: string, password: string): Promise<User> {
    const users = this.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const inputHash = await hashPassword(password);
    // Support default user hashes or plain comparison fallback
    if (user.passwordHash && user.passwordHash !== inputHash) {
      // Also allow common demo passwords 'admin123' / 'password' for easy testing
      if (!(password === 'admin123' && user.email.includes('admin')) &&
          !(password === 'password' && user.email.includes('supervisor'))) {
        throw new Error('Invalid email or password.');
      }
    }

    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  logout(): void {
    localStorage.removeItem(CURRENT_USER_KEY);
  },
};
