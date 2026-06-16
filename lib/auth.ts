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

        const userId = row[0] as string;
        const now    = new Date().toISOString();
        // Track login: set first_login_at on first login, always update last_login_at
        await db.execute({
          sql: `UPDATE users SET
                  last_login_at  = ?,
                  login_count    = COALESCE(login_count, 0) + 1,
                  first_login_at = CASE WHEN first_login_at IS NULL THEN ? ELSE first_login_at END
                WHERE id = ?`,
          args: [now, now, userId],
        });

        return {
          id:            userId,
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

      // Recharge le statut admin depuis la base à chaque requête, pour que les changements
      // de droits (ex : promotion admin) s'appliquent sans avoir à se reconnecter.
      if (token.id) {
        await initDb();
        const adminRes = await db.execute({
          sql: 'SELECT is_global_admin FROM users WHERE id = ?',
          args: [token.id as string],
        });
        if (adminRes.rows.length) {
          token.isGlobalAdmin = Boolean(adminRes.rows[0][0]);
        }
      }

      // Mise à jour last_login_at au plus une fois par heure
      const now       = Date.now();
      const lastTrack = (token.lastTrackedAt as number) ?? 0;
      if (token.id && now - lastTrack > 60 * 60 * 1000) {
        token.lastTrackedAt = now;
        const iso = new Date(now).toISOString();
        await db.execute({
          sql: `UPDATE users SET
                  last_login_at  = ?,
                  login_count    = COALESCE(login_count, 0) + 1,
                  first_login_at = CASE WHEN first_login_at IS NULL THEN ? ELSE first_login_at END
                WHERE id = ?`,
          args: [iso, iso, token.id],
        });
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
