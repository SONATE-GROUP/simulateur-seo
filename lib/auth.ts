import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db, initDb } from './turso';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',          type: 'email'    },
        password: { label: 'Mot de passe',   type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await initDb();
        const res = await db.execute({
          sql: 'SELECT id, email, password_hash, name, is_global_admin FROM users WHERE email = ?',
          args: [credentials.email.toLowerCase().trim()],
        });
        if (!res.rows.length) return null;
        const row = res.rows[0];
        const valid = await bcrypt.compare(credentials.password, row[2] as string);
        if (!valid) return null;
        return {
          id:            row[0] as string,
          email:         row[1] as string,
          name:          (row[3] as string) || '',
          isGlobalAdmin: Boolean(row[4]),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id            = user.id;
        token.isGlobalAdmin = user.isGlobalAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id            = token.id;
      session.user.isGlobalAdmin = token.isGlobalAdmin;
      return session;
    },
  },
  pages:   { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret:  process.env.NEXTAUTH_SECRET,
};
