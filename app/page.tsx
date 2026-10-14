import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6">
      <p className="text-sm tracking-[0.35em] text-primary uppercase">Supernova</p>
      <h1 className="mt-3 font-heading text-5xl">Audience voting</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Voting opens from the personal link in your email. Each link can be used once.
      </p>
      <Link href="/results" className="mt-8 text-sm text-primary underline-offset-4 hover:underline">
        Open the results screen
      </Link>
    </main>
  );
}
