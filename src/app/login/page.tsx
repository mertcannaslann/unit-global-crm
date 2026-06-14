"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("E-posta veya şifre hatalı.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="luxury-grid flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.12)] md:grid-cols-[1.04fr_0.96fr]">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_20%_0%,rgba(29,117,255,0.26),transparent_32%),linear-gradient(145deg,#071328_0%,#0b1730_48%,#0f4c91_100%)] p-8 text-white md:p-12">
          <div className="absolute -right-28 -top-28 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative mb-16 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 shadow-2xl shadow-blue-950/30">
              <Image src="/brand/estafy-crm-icon.svg" alt="Estafy CRM ikonu" width={44} height={44} priority />
            </div>
            <div>
              <p className="text-xl font-semibold uppercase tracking-[0.22em] text-white">Estafy</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-200">CRM</p>
            </div>
          </div>
          <p className="relative mb-3 text-sm font-medium uppercase tracking-[0.18em] text-blue-100">Estafy CRM</p>
          <h1 className="relative max-w-md text-4xl font-semibold leading-tight md:text-5xl">Emlak ofisleri için premium operasyon paneli</h1>
          <p className="relative mt-5 max-w-md text-sm leading-6 text-blue-100">
            Ofis, portföy, müşteri, görev ve takvim akışlarını tek güvenli çalışma alanında yönet.
          </p>
          <div className="relative mt-10 grid max-w-md gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <ShieldCheck className="h-5 w-5 text-blue-200" />
              <p className="mt-3 text-sm font-semibold">Yetkili erişim</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <Sparkles className="h-5 w-5 text-blue-200" />
              <p className="mt-3 text-sm font-semibold">Modern ofis deneyimi</p>
            </div>
          </div>
        </section>

        <section className="p-8 md:p-12">
          <div className="mb-8">
            <Image src="/brand/estafy-wordmark.png" alt="Estafy" width={168} height={22} priority className="mb-8 h-6 w-auto object-contain" />
            <p className="text-sm font-medium text-primary">Güvenli giriş</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Estafy CRM’e giriş yap</h2>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">E-posta</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Şifre</span>
              <div className="relative">
                <Input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} className="pr-11" />
                <button
                  aria-label="Şifre görünürlüğü"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
