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

const GOOGLE_HOST = /^https?:\/\/(?:drive|docs)\.google\.com\//i;

export function getDriveFileId(url: string | null | undefined): string {
  const clean = url?.trim() ?? '';
  if (!GOOGLE_HOST.test(clean)) return '';
  return /[?&]id=([\w-]+)/.exec(clean)?.[1] ?? /\/d\/([\w-]+)/.exec(clean)?.[1] ?? '';
}

export function getDriveThumbnailUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

/** Converts Google Drive share links to a directly renderable image URL; other URLs pass through unchanged. */
export const formatDriveImageUrl = (url: string | null | undefined): string => {
  const cleanUrl = url?.trim() ?? '';
  if (!cleanUrl) return '';
  if (cleanUrl.startsWith('https://lh3.googleusercontent.com/') || cleanUrl.startsWith('data:image')) return cleanUrl;
  const fileId = getDriveFileId(cleanUrl);
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : cleanUrl;
};

/** Drive file ID behind any Drive-hosted photo URL (share link or lh3 link), used for the thumbnail fallback. */
export function getPhotoDriveFileId(url: string | null | undefined): string {
  const clean = url?.trim() ?? '';
  return getDriveFileId(clean) || /^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/.exec(clean)?.[1] || '';
}

export function getMemberPhotoUrl(m: MemberLike): string {
  return formatDriveImageUrl(pick(m, ['photo_url', 'passport_picture', 'Passport Picture', 'Photo', 'passport_photo', 'picture', 'photo']));
}

/** First non-empty string among the given keys (official column, then aliases, then raw form titles). */
export function firstText(member: MemberLike, keys: string[]): string {
  return pick(member, keys);
}

/** First boolean-like value among the given keys; undefined when none is set. */
export function firstBool(member: MemberLike, keys: string[]): boolean | undefined {
  if (!member) return undefined;
  const record = member as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(true|yes|y|1)$/i.test(value.trim())) return true;
    if (typeof value === 'string' && /^(false|no|n|0)$/i.test(value.trim())) return false;
  }
  return undefined;
}

export function getMobilePhone(member: MemberLike): string {
  return pick(member, ['mobile_phone', 'phone_number', 'phone_primary', 'phone', 'Mobile Phone', 'Phone Number']);
}

export function getOtherPhone(member: MemberLike): string {
  return pick(member, [
    'other_phone', 'other_phone_number', 'secondary_phone', 'residential_phone', 'phone_secondary',
    'Other Phone Number', 'Other Phone',
  ]);
}

export function getMembershipId(member: MemberLike): string {
  return pick(member, ['membership_id', 'member_code', 'Membership ID']);
}

export type SacramentKey = 'baptism_date' | 'baptised_by' | 'confirmation_date' | 'local_congregation' | 'district' | 'presbytery' | 'memory_verse';

const sacramentAliases: Record<SacramentKey, string[]> = {
  baptism_date: ['baptism_date'],
  baptised_by: ['baptised_by', 'baptized_by'],
  confirmation_date: ['confirmation_date'],
  local_congregation: ['local_congregation', 'confirmation_local_congregation'],
  district: ['district', 'confirmation_district'],
  presbytery: ['presbytery', 'confirmation_presbytery'],
  memory_verse: ['memory_verse'],
};

/** Sacrament value from the member_sacraments record first, then the same data stored on the members row. */
export function getSacramentValue(member: MemberLike, sacraments: Record<string, unknown> | null | undefined, key: SacramentKey): string {
  return pick(sacraments as MemberLike, [key]) || pick(member, sacramentAliases[key]);
}

export function getResidenceArea(member: MemberLike): string {
  return pick(member, [
    'residence_area', 'residential_area', 'current_place_of_residence',
    'Residence Area', 'Residential Area', 'Current Place of Residence', 'Current place of residence',
  ]);
}

export function getAreaDescription(member: MemberLike): string {
  return pick(member, [
    'area_description', 'landmark', 'landmark_or_nearby_location', 'Landmark or Nearby Location ', 'Landmark or Nearby Location',
    'residence_description', 'Area Description', 'Description of Area', 'Landmark', 'Nearest Landmark',
  ]);
}

export function getMemberLandmark(member: MemberLike): string {
  return pick(member, [
    'area_description', 'landmark', 'landmark_or_nearby_location',
    'Landmark or Nearby Location ', 'Landmark or Nearby Location',
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
    'family_group', 'family', 'church_family_group',
    'Family Group', 'Church Family Group', 'Family',
  ]);
}
