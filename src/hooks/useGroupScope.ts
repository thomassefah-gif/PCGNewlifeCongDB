import { useCallback, useMemo } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import {
  canDelete as roleCanDelete,
  canEdit as roleCanEdit,
  canImport as roleCanImport,
  canManageUsers as roleCanManageUsers,
  canMarkAttendance as roleCanMarkAttendance,
} from '../lib/permissions';
import { canonicalGroupName } from '../lib/groupScope';

interface GroupMembership {
  membership_status?: string | null;
  groups?: { name?: string | null } | null;
}

interface ScopedMemberFields {
  groups?: string[];
  member_groups?: GroupMembership[];
  primary_generational_group?: string | null;
  generational_group?: string | null;
  family_group?: string | null;
  church_family_group?: string | null;
}

interface GroupScope {
  role: ReturnType<typeof useAuth>['role'];
  assignedGroup: string | null;
  isLeader: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
  canImport: boolean;
  canMarkAttendance: boolean;
  canViewFinances: boolean;
  filterMembers<T>(members: T[]): T[];
}

export function useGroupScope(): GroupScope {
  const { role, userGroup } = useAuth();
  const isAdmin = role === 'admin';
  const isLeader = role === 'group_leader';
  const assignedGroup = userGroup;

  const filterMembers = useCallback(<T,>(members: T[]): T[] => {
    if (!isLeader || isAdmin) return members;
    if (!assignedGroup) return [];
    const target = canonicalGroupName(assignedGroup).toLocaleLowerCase();
    return members.filter((member) => {
      if (!member || typeof member !== 'object') return false;
      const row = member as T & ScopedMemberFields;
      const groupNames = [
        ...(row.groups ?? []),
        ...(row.member_groups ?? [])
          .map((membership) => membership.groups?.name)
          .filter((name): name is string => Boolean(name)),
        row.primary_generational_group,
        row.generational_group,
        row.family_group,
        row.church_family_group,
      ].filter((name): name is string => Boolean(name));
      return groupNames.some((name) => canonicalGroupName(name).toLocaleLowerCase() === target);
    });
  }, [assignedGroup, isAdmin, isLeader]);

  return useMemo(() => ({
    role,
    assignedGroup,
    isLeader,
    isAdmin,
    canEdit: roleCanEdit(role),
    canDelete: roleCanDelete(role),
    canManageUsers: roleCanManageUsers(role),
    canImport: roleCanImport(role),
    canMarkAttendance: roleCanMarkAttendance(role),
    canViewFinances: role === 'admin' || role === 'user' || role === 'viewer',
    filterMembers,
  }), [assignedGroup, filterMembers, isAdmin, isLeader, role]);
}
