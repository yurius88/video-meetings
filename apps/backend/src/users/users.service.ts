import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

// Доступ к встречам сверяется по email без учёта регистра, поэтому и учётки уникальны без него.
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class UsersService {
  private users: User[] = [];

  async findByEmail(email: string): Promise<User | undefined> {
    const normalized = normalizeEmail(email);
    return this.users.find((user) => user.email === normalized);
  }

  async create(email: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user: User = {
      id: this.generateId(),
      email: normalizeEmail(email),
      password: hashedPassword,
      createdAt: new Date(),
    };

    this.users.push(user);
    return user;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
