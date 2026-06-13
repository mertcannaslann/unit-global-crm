import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { initialData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import type { Role } from "@/lib/types";

const loginCredentials = [
  { email: process.env.ADMIN_LOGIN_EMAIL ?? "mertcan@unitcrm.com", password: process.env.ADMIN_LOGIN_PASSWORD, role: "ADMIN" },
  { email: process.env.OWNER_LOGIN_EMAIL ?? "dorukhan@unitglobal.com", password: process.env.OWNER_LOGIN_PASSWORD, role: "OFFICE_MANAGER" },
  { email: process.env.CONSULTANT_LOGIN_EMAIL ?? "kaan@unitglobal.com", password: process.env.CONSULTANT_LOGIN_PASSWORD, role: "CONSULTANT" },
] as const;

async function bootstrapUserFromEnv(email: string, password: string) {
  if (process.env.ALLOW_ENV_LOGIN_BOOTSTRAP !== "true") return null;

  const credential = loginCredentials.find((item) => item.email === email);
  const user = initialData.users.find((item) => item.email === email);
  if (!credential?.password || credential.password !== password || !user) return null;

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    create: {
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash,
      role: user.role,
      title: user.title,
      phone: user.phone,
      avatarColor: user.avatarColor,
      active: user.active,
    },
    update: {
      passwordHash,
      name: user.name,
      role: user.role,
      title: user.title,
      phone: user.phone,
      avatarColor: user.avatarColor,
      active: user.active,
    },
  });
}

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Emlak Ofisi CRM Login",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        const limit = checkRateLimit(rateLimitKey(request as unknown as Request | undefined, "login", email), { max: 10, windowMs: 15 * 60_000 });

        if (!limit.ok || !email || !password) {
          return null;
        }

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await bootstrapUserFromEnv(email, password);
        }
        if (!user?.passwordHash || user.active === false) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          const bootstrappedUser = await bootstrapUserFromEnv(email, password);
          if (!bootstrappedUser?.passwordHash || bootstrappedUser.active === false) return null;

          const validBootstrappedPassword = await bcrypt.compare(password, bootstrappedUser.passwordHash);
          if (!validBootstrappedPassword) return null;

          user = bootstrappedUser;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }

      return session;
    },
  },
};
