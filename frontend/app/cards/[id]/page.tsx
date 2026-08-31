import Image from "next/image";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { PriceDashboard } from "@/components/price-dashboard";
import { cardImageUrl, getCard, getCardPricing } from "@/lib/api";

type CardPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function CardPage({ params }: CardPageProps) {
  const { id } = await params;
  const [card, pricing] = await Promise.all([getCard(id), getCardPricing(id)]);
  if (!card) notFound();
  const number = card.printed_total ? `${card.number}/${card.printed_total}` : card.number;

  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-5 py-9 sm:px-8 sm:py-12">
      <BackButton />

      <div className="mt-8 grid gap-8 rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_18px_55px_rgba(33,45,25,0.06)] md:grid-cols-[320px_1fr] md:gap-12 md:p-8">
        <div className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,_#f1fee7,_#f5f5f4_70%)] p-5">
          <Image
            alt={`${card.name} from ${card.set_name}`}
            className="mx-auto block h-auto w-full rounded-xl drop-shadow-[0_18px_18px_rgba(15,23,42,0.18)]"
            height={440}
            priority
            quality={75}
            src={cardImageUrl(card.image_url)}
            sizes="(max-width: 768px) 80vw, 320px"
            width={320}
          />
        </div>

        <section className="pt-1 md:pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-700">
            {card.set_name}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.035em] text-slate-950 sm:text-5xl">
            {card.name}
          </h1>
          <p className="mt-3 font-mono text-sm text-slate-500">#{number}</p>

          <dl className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
            <div className="grid grid-cols-2 gap-4 py-4">
              <dt className="text-sm text-zinc-500">Set</dt>
              <dd className="text-right text-sm font-medium text-zinc-950">{card.set_name}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4 py-4">
              <dt className="text-sm text-zinc-500">Series</dt>
              <dd className="text-right text-sm font-medium text-zinc-950">
                {card.series ?? "Not provided"}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-4 py-4">
              <dt className="text-sm text-zinc-500">Rarity</dt>
              <dd className="text-right text-sm font-medium text-zinc-950">
                {card.rarity || "None"}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-4 py-4">
              <dt className="text-sm text-zinc-500">Release date</dt>
              <dd className="text-right text-sm font-medium text-zinc-950">
                {formatDate(card.release_date)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      {pricing ? <PriceDashboard pricing={pricing} /> : null}
    </main>
  );
}
