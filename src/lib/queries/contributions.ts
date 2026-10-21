import { supabase } from '../supabaseClient';
import { logAuditEvent } from './auditlogs';
import {
  CONTRIBUTION_CATEGORIES,
  type Contribution,
  type ContributionFilters,
  type ContributionFormData,
  type ContributionSummary,
} from '../../types/contributions';

const baseColumns = 'id,member_id,guest_name,category,amount,payment_method,payment_date,reference_number,notes,recorded_by,created_at';
const memberJoin = 'members(id,first_name,surname,mobile_phone,member_groups(membership_status,groups(name)))';
const withProfile = `${baseColumns},${memberJoin},profiles:recorded_by(full_name)`;
const withoutProfile = `${baseColumns},${memberJoin}`;

function toError(error: { message?: string; details?: string }): Error {
  return new Error(error.message || error.details || String(error));
}

// Supabase rejects/ignores undefined; coerce every field to a value or null.
function buildPayload(input: ContributionFormData) {
  const name = input.contributor_name || input.guest_name || null;
  return {
    member_id: input.member_id ?? null,
    contributor_name: name,
    guest_name: name,
    category: input.category,
    amount: input.amount,
    payment_method: input.payment_method,
    payment_date: input.payment_date,
    reference_number: input.reference_number ?? null,
    notes: input.notes ?? null,
  };
}

function normalize(row: unknown): Contribution {
  const r = row as Contribution;
  let members = r.members ?? null;
  if (members) {
    const memberGroups = (members as unknown as { member_groups?: { membership_status?: string | null; groups: { name: string | null } | null }[] }).member_groups;
    const groups = (memberGroups ?? [])
      .filter((mg) => mg.membership_status !== 'Inactive')
      .map((mg) => mg.groups?.name)
      .filter((name): name is string => Boolean(name));
    members = { ...members, groups };
  }
  return { ...r, amount: Number(r.amount), members, profiles: r.profiles ?? null };
}

export async function fetchContributions(filters: ContributionFilters = {}): Promise<Contribution[]> {
  const run = async (columns: string) => {
    let query = supabase.from('contributions').select(columns);
    if (filters.category && filters.category !== 'ALL') query = query.eq('category', filters.category);
    if (filters.startDate) query = query.gte('payment_date', filters.startDate);
    if (filters.endDate) query = query.lte('payment_date', filters.endDate);
    return query
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5000);
  };

  let { data, error } = await run(withProfile);
  // The profiles relationship may not exist; fall back to the member-only join.
  if (error) ({ data, error } = await run(withoutProfile));
  if (error) throw toError(error);

  let rows = (data ?? []).map(normalize);
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter((row) => {
      const name = row.members ? `${row.members.first_name ?? ''} ${row.members.surname ?? ''}` : row.guest_name ?? '';
      return name.toLowerCase().includes(search) || (row.reference_number ?? '').toLowerCase().includes(search);
    });
  }
  return rows;
}

export interface ActingUser {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
}

export async function fetchContributionSummary(): Promise<ContributionSummary> {
  const rows: Contribution[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('contributions')
      .select('id,category,amount,payment_date')
      .range(start, start + pageSize - 1);
    if (error) throw toError(error);
    const page = (data ?? []) as unknown as Contribution[];
    rows.push(...page.map((r) => ({ ...r, amount: Number(r.amount) })));
    if (page.length < pageSize) break;
  }
  return summarizeContributions(rows);
}

export async function createContribution(
  input: ContributionFormData,
  userId: string | null,
  userEmail: string | null,
  userName: string | null,
): Promise<Contribution> {
  const payload = { ...buildPayload(input), recorded_by: userId ?? null };
  const { data, error } = await supabase
    .from('contributions')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw toError(error);
  const created = normalize(data);
  try {
    await logAuditEvent({
      action: 'create',
      entity_type: 'contribution',
      entity_id: created.id,
      entity_label: `${created.category} - ${created.amount}`,
      changes: { ...input, performed_by: { userId, userEmail, userName } },
    });
  } catch (auditError) {
    console.error('Audit logging failed for contribution create', auditError);
  }
  return created;
}

export async function updateContribution(
  id: string,
  input: ContributionFormData,
  userId: string | null,
  userEmail: string | null,
  userName: string | null,
): Promise<void> {
  const { error } = await supabase.from('contributions').update(buildPayload(input)).eq('id', id);
  if (error) throw toError(error);
  await logAuditEvent({
    action: 'update',
    entity_type: 'contribution',
    entity_id: id,
    entity_label: `${input.category} - ${input.amount}`,
    changes: { ...input, performed_by: { userId, userEmail, userName } },
  });
}

export async function deleteContribution(
  id: string,
  userId: string | null,
  userEmail: string | null,
  userName: string | null,
): Promise<void> {
  const { data: existing } = await supabase.from('contributions').select('category,amount').eq('id', id).maybeSingle();
  const { error } = await supabase.from('contributions').delete().eq('id', id);
  if (error) throw toError(error);
  await logAuditEvent({
    action: 'delete',
    entity_type: 'contribution',
    entity_id: id,
    entity_label: existing ? `${existing.category} - ${existing.amount}` : undefined,
    changes: { performed_by: { userId, userEmail, userName } },
  });
}

function summarizeContributions(rows: Contribution[], now = new Date()): ContributionSummary {
  const year = String(now.getFullYear());
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const categoryTotals = Object.fromEntries(CONTRIBUTION_CATEGORIES.map((c) => [c, 0])) as ContributionSummary['categoryTotals'];
  const summary: ContributionSummary = { totalRevenue: 0, monthRevenue: 0, yearRevenue: 0, totalTransactions: rows.length, categoryTotals };
  for (const row of rows) {
    summary.totalRevenue += row.amount;
    if (row.payment_date.startsWith(month)) summary.monthRevenue += row.amount;
    if (row.payment_date.startsWith(year)) summary.yearRevenue += row.amount;
    if (row.category in categoryTotals) categoryTotals[row.category] += row.amount;
  }
  return summary;
}

export function contributorName(row: Contribution): string {
  if (row.members) return `${row.members.first_name ?? ''} ${row.members.surname ?? ''}`.trim() || 'Unknown member';
  return row.guest_name?.trim() || 'Guest';
}
