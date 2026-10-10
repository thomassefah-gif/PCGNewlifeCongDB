import { ArrowUpRight, Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="mx-auto flex min-h-[min(68vh,680px)] max-w-5xl items-center justify-center">
      <div className="w-full rounded-2xl border border-stone-200/80 bg-white p-8 shadow-soft sm:p-12">
        <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Construction aria-hidden="true" size={26} strokeWidth={1.8} />
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Project foundation</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">{description}</p>
        <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-primaryDark">
          This module will be built in the upcoming phases <ArrowUpRight aria-hidden="true" size={16} />
        </div>
      </div>
    </section>
  );
}
