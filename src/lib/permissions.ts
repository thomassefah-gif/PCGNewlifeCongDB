import type { UserRole } from '../types/auth';

export type { UserRole } from '../types/auth';

/** The group a non-admin user is restricted to, or null when no restriction applies. */
export function restrictedGroup(role?: UserRole | null, userGroup?: string | null): string | null {
  return role === 'group_leader' && userGroup?.trim() ? userGroup.trim() : null;
}

export function canView(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user' || role === 'viewer';
}

export function canEdit(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canImport(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canUseFieldBuilder(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canDelete(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canViewAuditLogs(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canMarkAttendance(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user' || role === 'group_leader';
}
