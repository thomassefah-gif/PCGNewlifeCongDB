import type { Member } from '../types/member';

type MemberLike = Partial<Member> | Record<string, unknown> | null | undefined;

function pick(member: MemberLike, keys: string[]): string {
  if (!member) return '';
  const record = member as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function getResidenceArea(member: MemberLike): string {
  return pick(member, [
    'residence_area', 'residential_area', 'current_place_of_residence',
    'Residence Area', 'Residential Area', 'Current Place of Residence', 'Current place of residence',
  ]);
}

export function getAreaDescription(member: MemberLike): string {
  return pick(member, [
    'area_description', 'residence_description', 'landmark',
    'Area Description', 'Description of Area', 'Landmark', 'Nearest Landmark',
  ]);
}

export function getPrimaryGenerationalGroup(member: MemberLike): string {
  return pick(member, [
    'primary_generational_group', 'generational_group',
    'Primary Generational Group', 'Generational Group',
  ]);
}

export function getFamilyGroup(member: MemberLike): string {
  return pick(member, [
    'family_group', 'church_family_group', 'family',
    'Family Group', 'Church Family Group', 'Family',
  ]);
}
