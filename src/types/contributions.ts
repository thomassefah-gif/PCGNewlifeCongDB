export const CONTRIBUTION_CATEGORIES = [
  'Tithe',
  'Welfare Dues',
  'Sunday Offering',
  'Building Fund',
  'Harvest Seed',
  'Special Levy',
  'Other',
] as const;
export type ContributionCategory = (typeof CONTRIBUTION_CATEGORIES)[number];

export const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ContributionMember {
  id: string;
  first_name: string | null;
  surname: string | null;
  mobile_phone: string | null;
}

export interface Contribution {
  id: string;
  member_id: string | null;
  guest_name: string | null;
  category: ContributionCategory;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  members: ContributionMember | null;
  profiles: { full_name: string | null } | null;
}

export interface ContributionFormData {
  member_id: string | null;
  guest_name: string | null;
  contributor_name?: string | null;
  category: ContributionCategory;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
}

export interface ContributionFilters {
  search?: string;
  category?: ContributionCategory | 'ALL';
  startDate?: string;
  endDate?: string;
}

export interface ContributionSummary {
  totalRevenue: number;
  monthRevenue: number;
  yearRevenue: number;
  totalTransactions: number;
  categoryTotals: Record<ContributionCategory, number>;
}
