import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto min-h-[70vh] max-w-2xl px-5 py-20 text-center sm:px-8">
      <p className="text-sm font-medium text-zinc-500">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Card not found</h1>
      <Link className="mt-6 inline-block text-sm font-medium text-zinc-950 underline" href="/">
        Return to the catalog
      </Link>
    </main>
  );
}
