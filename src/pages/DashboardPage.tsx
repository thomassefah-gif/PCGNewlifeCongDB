import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, CheckCircle2, Globe2, Home, TrendingUp, UsersRound } from 'lucide-react';
import { endOfYear, format, startOfYear, subYears } from 'date-fns';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ExportButton from '../components/ui/ExportButton';
import MemberAvatar from '../components/MemberAvatar';
import BarCard from '../components/charts/BarCard';
import DonutCard from '../components/charts/DonutCard';
import { useToast } from '../components/ui/Toast';
import { calculateAge, formatDate } from '../lib/date';
import { getBirthdays, getDashboardMetrics, getGroupDistributionMetrics, getRecentContacts, type BirthdayMember, type DashboardDateRange, type DashboardMetrics, type GroupDistribution } from '../lib/queries/dashboard';
import { supabase } from '../lib/supabaseClient';
import type { Member } from '../types/member';

type DatePreset = 'all' | 'this-year' | 'last-year' | 'last-2' | 'last-5' | 'custom';
type BirthdayTab = 'today' | 'upcoming';

const emptyMetrics: DashboardMetrics = { totalMembers: 0, activeMembers: 0, inactiveMembers: 0, distantMembers: 0, residentMembers: 0, newMembers: 0 };
const emptyDistribution: GroupDistribution = { generational: [], interest: [], family: [] };

function currentRange(preset: Exclude<DatePreset, 'all' | 'custom'>, now = new Date()): DashboardDateRange {
  const currentYear = now.getFullYear();
  if (preset === 'this-year') return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
  if (preset === 'last-year') {
    const lastYear = subYears(now, 1);
    return { from: format(startOfYear(lastYear), 'yyyy-MM-dd'), to: format(endOfYear(lastYear), 'yyyy-MM-dd') };
  }
  const years = preset === 'last-2' ? 2 : 5;
  return { from: format(new Date(currentYear - years + 1, 0, 1), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
}

function nameOf(member: Member): string {
  return [member.title, member.first_name, member.surname].filter(Boolean).join(' ') || 'Unnamed member';
}

function birthdayName(member: BirthdayMember): string {
  return nameOf(member);
}

function birthdayGroups(members: BirthdayMember[]): Array<{ date: string; people: BirthdayMember[] }> {
  const groups = new Map<string, BirthdayMember[]>();
  for (const member of members) {
    const current = groups.get(member.birthday_date) ?? [];
    current.push(member);
    groups.set(member.birthday_date, current);
  }
  return [...groups.entries()].map(([date, people]) => ({ date, people }));
}

function MetricCard({ label, value, icon: Icon, tone, detail }: { label: string; value: number; icon: typeof UsersRound; tone: string; detail?: string }) {
  return <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value.toLocaleString()}</p></div><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon aria-hidden="true" size={20} /></span></div>
    {detail && <p className="mt-2 text-[11px] text-slate-400">{detail}</p>}
  </article>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [preset, setPreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [distribution, setDistribution] = useState<GroupDistribution>(emptyDistribution);
  const [recentContacts, setRecentContacts] = useState<Member[]>([]);
  const [birthdaysToday, setBirthdaysToday] = useState<BirthdayMember[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayMember[]>([]);
  const [birthdayTab, setBirthdayTab] = useState<BirthdayTab>('today');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const dateRange = useMemo<DashboardDateRange>(() => {
    if (preset === 'all') return {};
    if (preset === 'custom') return { ...(customFrom ? { from: customFrom } : {}), ...(customTo ? { to: customTo } : {}) };
    return currentRange(preset);
  }, [customFrom, customTo, preset]);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [nextMetrics, nextDistribution, recent, birthdays] = await Promise.all([
        getDashboardMetrics(dateRange),
        getGroupDistributionMetrics(dateRange),
        getRecentContacts(10),
        getBirthdays(),
      ]);
      setMetrics(nextMetrics);
      setDistribution(nextDistribution);
      setRecentContacts(recent);
      setBirthdaysToday(birthdays.today);
      setUpcomingBirthdays(birthdays.upcoming);
    } catch (error) {
      setLoadError(true);
      showToast(error instanceof Error ? error.message : 'Unable to load dashboard data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateRange, showToast]);

  useEffect(() => { void refreshDashboard(); }, [refreshDashboard]);

  useEffect(() => {
    const channel = supabase
      .channel('dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => { void refreshDashboard(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_groups' }, () => { void refreshDashboard(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshDashboard]);

  const upcomingGroups = useMemo(() => birthdayGroups(upcomingBirthdays), [upcomingBirthdays]);
  const dateLabel = preset === 'all' ? 'All time' : preset === 'custom' ? `${customFrom || 'Any start'} – ${customTo || 'Today'}` : preset === 'this-year' ? 'This year' : preset === 'last-year' ? 'Last year' : preset === 'last-2' ? 'Last 2 years' : 'Last 5 years';

  const birthdayExport = useMemo(() => [
    ...birthdaysToday.map((member) => ({ ...member, Birthday_Category: 'Today', Age_Turning: member.age_turning })),
    ...upcomingBirthdays.map((member) => ({ ...member, Birthday_Category: 'Next 7 Days', Age_Turning: member.age_turning })),
  ], [birthdaysToday, upcomingBirthdays]);

  const handleCustomRangeChange = (kind: 'from' | 'to', value: string) => {
    setPreset('custom');
    if (kind === 'from') setCustomFrom(value);
    else setCustomTo(value);
  };

  const todayList = <div className="divide-y divide-stone-100">
    {birthdaysToday.map((member) => <div key={member.id} className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-lg">🎂</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{birthdayName(member)}</p><p className="mt-0.5 truncate text-xs text-slate-500">{member.age_turning === null ? 'Age unavailable' : `Turning ${member.age_turning}`}<span className="px-1">·</span>{member.mobile_phone || member.email || 'No contact recorded'}</p></div>
      <Button size="sm" variant="ghost" onClick={() => navigate(`/contacts/${member.id}`)}>View Member</Button>
    </div>)}
    {birthdaysToday.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No birthdays today.</p>}
  </div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Church overview</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h1><p className="mt-1 text-sm text-slate-600">New Life Congregation — Community Management Overview</p></div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/80 bg-white p-2 shadow-sm">
          {([
            ['all', 'All time'], ['this-year', 'This year'], ['last-year', 'Last year'], ['last-2', 'Last 2 years'], ['last-5', 'Last 5 years'],
          ] as Array<[DatePreset, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setPreset(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${preset === value ? 'bg-primary text-white' : 'text-slate-600 hover:bg-accent hover:text-primaryDark'}`}>{label}</button>)}
          <button type="button" onClick={() => setPreset('custom')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${preset === 'custom' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-accent hover:text-primaryDark'}`}>Custom Range</button>
          {preset === 'custom' && <div className="flex w-full flex-wrap items-center gap-2 border-t border-stone-100 px-1 pt-2 sm:w-auto sm:border-0 sm:pt-0">
            <label className="sr-only" htmlFor="dashboard-from">From date</label><input id="dashboard-from" aria-label="From date" type="date" value={customFrom} max={customTo || format(new Date(), 'yyyy-MM-dd')} onChange={(event) => handleCustomRangeChange('from', event.target.value)} className="h-9 rounded-lg border border-stone-200 px-2 text-xs text-slate-700" />
            <span className="text-xs text-slate-400">to</span><label className="sr-only" htmlFor="dashboard-to">To date</label><input id="dashboard-to" aria-label="To date" type="date" value={customTo} min={customFrom || undefined} max={format(new Date(), 'yyyy-MM-dd')} onChange={(event) => handleCustomRangeChange('to', event.target.value)} className="h-9 rounded-lg border border-stone-200 px-2 text-xs text-slate-700" />
          </div>}
        </div>
      </header>

      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"><span>Some dashboard data could not be loaded.</span><Button size="sm" variant="outline" onClick={() => void refreshDashboard()}>Retry</Button></div>}

      <section aria-label="Church key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Active Contacts" value={metrics.activeMembers} icon={CheckCircle2} tone="bg-success/10 text-success" />
        <MetricCard label="Total Contacts" value={metrics.totalMembers} icon={UsersRound} tone="bg-primary/10 text-primary" detail={dateLabel} />
        <MetricCard label="Distant Members" value={metrics.distantMembers} icon={Globe2} tone="bg-warning/10 text-warning" />
        <MetricCard label="Resident Members" value={metrics.residentMembers} icon={Home} tone="bg-sky-50 text-sky-700" />
        <MetricCard label="Birthdays Today" value={birthdaysToday.length} icon={Cake} tone="bg-amber-50 text-amber-700" detail={birthdaysToday.length ? 'Celebrate with your church family' : undefined} />
        <MetricCard label="New Enrollments" value={metrics.newMembers} icon={TrendingUp} tone="bg-primary/10 text-primaryDark" detail={dateLabel} />
      </section>

      {loading && metrics.totalMembers === 0 ? <div className="animate-pulse rounded-2xl border border-stone-200 bg-white px-6 py-14 text-center text-sm font-medium text-slate-500">Loading dashboard analytics...</div> : <>
        <section aria-label="Membership analytics charts" className="grid gap-4 xl:grid-cols-2">
          <BarCard title="Enrollments per Group" description="Active membership in generational groups within selected period" data={distribution.generational} />
          <DonutCard title="Contacts by Status" data={[{ name: 'Active', value: metrics.activeMembers, color: '#1D4ED8' }, { name: 'Inactive', value: metrics.inactiveMembers, color: '#94A3B8' }]} />
          <BarCard title="Interest Groups Breakdown" description="Active interest group memberships within selected period" data={distribution.interest} color="#1D4ED8" />
          <BarCard title="Family Groups Breakdown" description="Active family group memberships within selected period" data={distribution.family} color="#1D4ED8" />
        </section>

        <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
          <article className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Recent Contacts</h2><p className="mt-0.5 text-xs text-slate-500">Latest member records added to the directory</p></div><ExportButton<Member> data={recentContacts} filename="recent_contacts" label="Export Recent (CSV)" isMemberData size="sm" /></div>
            {loading && recentContacts.length === 0 ? <div className="animate-pulse px-5 py-12 text-center text-sm text-slate-500">Loading recent contacts...</div> : recentContacts.length === 0 ? <EmptyState title="No recent contacts" description="Recently added church members will appear here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left"><thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Contact</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Age</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Date Added</th></tr></thead><tbody className="divide-y divide-stone-100">{recentContacts.map((member) => <tr key={member.id} tabIndex={0} onClick={() => navigate(`/contacts/${member.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/contacts/${member.id}`); }} className="cursor-pointer transition-colors hover:bg-accent/50 focus:bg-accent/50"><td className="px-5 py-3"><div className="flex items-center gap-3"><MemberAvatar member={member} className="h-8 w-8 rounded-full text-[10px]" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{nameOf(member)}</span><span className="block truncate text-xs text-slate-500">{member.email || 'No email recorded'}</span></span></div></td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{member.mobile_phone || member.residential_phone || '—'}</td><td className="px-3 py-3 text-xs text-slate-600">{calculateAge(member.date_of_birth) ?? '—'}</td><td className="px-3 py-3"><Badge variant={member.status === 'Active' ? 'active' : 'inactive'}>{member.status}</Badge></td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatDate(member.created_at)}</td></tr>)}</tbody></table></div>}
          </article>

          <article className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Birthdays Today &amp; Upcoming</h2><p className="mt-0.5 text-xs text-slate-500">Celebrate members in your church family</p></div><ExportButton data={birthdayExport} filename="birthdays" label="Export Birthdays (CSV)" isMemberData size="sm" /></div>
            <div role="tablist" aria-label="Birthday list period" className="flex gap-1 border-b border-stone-100 px-4 pt-2"><button type="button" role="tab" aria-selected={birthdayTab === 'today'} onClick={() => setBirthdayTab('today')} className={`rounded-t-lg px-3 py-2.5 text-sm font-medium ${birthdayTab === 'today' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-800'}`}>Today <span className="ml-1 text-xs">{birthdaysToday.length}</span></button><button type="button" role="tab" aria-selected={birthdayTab === 'upcoming'} onClick={() => setBirthdayTab('upcoming')} className={`rounded-t-lg px-3 py-2.5 text-sm font-medium ${birthdayTab === 'upcoming' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-800'}`}>Next 7 Days <span className="ml-1 text-xs">{upcomingBirthdays.length}</span></button></div>
            {birthdayTab === 'today' ? todayList : upcomingBirthdays.length === 0 ? <p className="px-4 py-9 text-center text-sm text-slate-500">No birthdays in the next 7 days.</p> : <div className="max-h-[430px] divide-y divide-stone-100 overflow-y-auto">{upcomingGroups.map(({ date, people }) => <div key={date}><p className="sticky top-0 bg-stone-50 px-4 py-2 text-xs font-semibold text-slate-600">{format(new Date(`${date}T00:00:00`), 'EEEE, d MMM')}</p>{people.map((member) => <div key={member.id} className="flex items-center gap-3 px-4 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50">🎂</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{birthdayName(member)}</p><p className="truncate text-xs text-slate-500">{member.age_turning === null ? 'Age unavailable' : `Turning ${member.age_turning}`}<span className="px-1">·</span>{member.mobile_phone || member.email || 'No contact recorded'}</p></div><button type="button" onClick={() => navigate(`/contacts/${member.id}`)} className="text-xs font-semibold text-primary hover:text-primaryDark">View</button></div>)}</div>)}</div>}
          </article>
        </section>
      </>}
    </div>
  );
}
