import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';

@Injectable()
export class AuthService {
  constructor(private db: DbService, private jwt: JwtService) {}

  private async sign(u: any) {
    const token = await this.jwt.signAsync({ sub: u.id, email: u.email, name: u.name, role: u.role });
    return { token, user: { id: u.id, email: u.email, name: u.name, role: u.role } };
  }

  /** Public registration only ever creates attendees. Organizers are seeded/admin-created. */
  async register(email: string, name: string, password: string) {
    const exists = await this.db.query('SELECT 1 FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rowCount) throw new ConflictException('Email already registered');
    const hash = await bcrypt.hash(password, 8);
    const r = await this.db.query(
      "INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,'attendee') RETURNING *",
      [email.toLowerCase(), name, hash],
    );
    return this.sign(r.rows[0]);
  }

  async login(email: string, password: string) {
    const r = await this.db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.sign(u);
  }
}
