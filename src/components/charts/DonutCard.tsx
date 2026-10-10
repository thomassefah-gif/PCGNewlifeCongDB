import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutCardProps {
  title: string;
  data: DonutDatum[];
}

export default function DonutCard({ title, data }: DonutCardProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-3"><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">Member distribution in selected period</p></div>
      {total === 0 ? <div className="flex h-[260px] items-center justify-center rounded-xl bg-stone-50 text-sm text-slate-500">No member data available</div> : <div className="relative h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={68} outerRadius={96} paddingAngle={3} stroke="white" strokeWidth={3}>
              {data.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [`${value} (${Math.round((value / total) * 100)}%)`, name]} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', boxShadow: '0 8px 24px rgba(15,23,42,.08)' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</span><span className="text-xs text-slate-500">contacts</span></div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-5">
          {data.map((item) => <span key={item.name} className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}<span className="font-semibold text-slate-800">{item.value}</span></span>)}
        </div>
      </div>}
    </section>
  );
}
