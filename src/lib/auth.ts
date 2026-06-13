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
  if (process.env.ALLOW_ENV_LOGIN_BOOTSTRAP === "false") {
    console.warn("[auth] env bootstrap disabled", { email });
    return null;
  }

  const user = initialData.users.find((item) => item.email === email);
  const credential =
    loginCredentials.find((item) => item.email === email) ??
    (user ? loginCredentials.find((item) => item.role === user.role) : undefined);
  if (!credential?.password || credential.password !== password || !user) {
    console.warn("[auth] env bootstrap rejected", {
      email,
      hasCredential: Boolean(credential),
      hasCredentialPassword: Boolean(credential?.password),
      hasDemoUser: Boolean(user),
      passwordMatched: Boolean(credential?.password && credential.password === password),
    });
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    console.warn("[auth] env bootstrap updating user by email", { email, userId: existingByEmail.id });
    return prisma.user.update({
      where: { email },
      data: {
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

  const existingById = await prisma.user.findUnique({ where: { id: user.id } });
  if (existingById) {
    console.warn("[auth] env bootstrap updating user by id", { email, userId: user.id });
    return prisma.user.update({
      where: { id: user.id },
      data: {
        email,
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

  console.warn("[auth] env bootstrap creating user", { email, userId: user.id });
  return prisma.user.create({
    data: {
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
        const limit = checkRateLimit(rateLimitKey(request as unknown as Request | undefined, "login", email), { max: 30, windowMs: 15 * 60_000 });

        if (!limit.ok || !email || !password) {
          console.warn("[auth] login rejected before lookup", {
            email,
            hasPassword: Boolean(password),
            rateLimitOk: limit.ok,
          });
          return null;
        }

        let user = await prisma.user.findUnique({ where: { email } });
        console.warn("[auth] login lookup", {
          email,
          foundUser: Boolean(user),
          hasPasswordHash: Boolean(user?.passwordHash),
          active: user?.active,
        });
        if (!user) {
          user = await bootstrapUserFromEnv(email, password);
        }
        if (!user?.passwordHash || user.active === false) {
          console.warn("[auth] login rejected after bootstrap", {
            email,
            hasUser: Boolean(user),
            hasPasswordHash: Boolean(user?.passwordHash),
            active: user?.active,
          });
          return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          const bootstrappedUser = await bootstrapUserFromEnv(email, password);
          if (!bootstrappedUser?.passwordHash || bootstrappedUser.active === false) {
            console.warn("[auth] login rejected after password refresh", {
              email,
              hasUser: Boolean(bootstrappedUser),
              hasPasswordHash: Boolean(bootstrappedUser?.passwordHash),
              active: bootstrappedUser?.active,
            });
            return null;
          }

          const validBootstrappedPassword = await bcrypt.compare(password, bootstrappedUser.passwordHash);
          if (!validBootstrappedPassword) {
            console.warn("[auth] refreshed password still invalid", { email });
            return null;
          }

          user = bootstrappedUser;
        }

        console.warn("[auth] login accepted", { email, userId: user.id, role: user.role });
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
