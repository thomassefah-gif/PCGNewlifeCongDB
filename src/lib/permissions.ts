import type { UserRole } from '../types/auth';

export type { UserRole } from '../types/auth';

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
  return role === 'admin';
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
