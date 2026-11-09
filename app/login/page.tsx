import { safeNext } from "@/lib/tobi-supabase";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  return <main className="mx-auto max-w-md p-8"><h1>Přihlášení správce TOBi</h1>
    <p>Přístup mají pouze povolení správci. Pokud váš účet nemá oprávnění, kontaktujte provozovatele.</p>
    <form action="/auth/login" method="post" className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <label>Email <input name="email" type="email" autoComplete="username" required /></label>
      <label>Heslo <input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit">Přihlásit se</button>
    </form><form action="/auth/logout" method="post"><button>Odhlásit se</button></form></main>;
}
