import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ChartDatum {
  name: string;
  count: number;
}

interface BarCardProps {
  title: string;
  description?: string;
  data: ChartDatum[];
  color?: string;
}

export default function BarCard({ title, description, data, color = '#1D4ED8' }: BarCardProps) {
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4"><h2 className="font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>
      {data.length === 0 ? <div className="flex h-[260px] items-center justify-center rounded-xl bg-stone-50 text-sm text-slate-500">No group data available</div> : <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={data.length > 5 ? -15 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'} height={data.length > 5 ? 52 : 32} />
            <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: '#f5f1e6', opacity: 0.55 }} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', boxShadow: '0 8px 24px rgba(15,23,42,.08)' }} />
            <Bar dataKey="count" name="Members" fill={color} radius={[6, 6, 0, 0]} maxBarSize={46} />
          </BarChart>
        </ResponsiveContainer>
      </div>}
    </section>
  );
}
