import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardCheck,
  ContactRound,
  FileUp,
  FolderKanban,
  Landmark,
  Megaphone,
  Settings2,
  UserRoundCog,
  UsersRound,
} from 'lucide-react';

export interface RouteItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const routeItems: RouteItem[] = [
  { path: '/dashboard', label: 'Dashboard', description: 'Your church management overview is being prepared.', icon: BarChart3 },
  { path: '/contacts', label: 'Contacts', description: 'Member records and contact details will appear here.', icon: ContactRound },
  { path: '/programs', label: 'Groups', description: 'Church groups and memberships will appear here.', icon: FolderKanban },
  { path: '/staff', label: 'Staff Directory', description: 'Staff directory tools will appear here.', icon: UsersRound },
  { path: '/announcements', label: 'Announcements', description: 'Church news and important notices.', icon: Megaphone },
  { path: '/contributions', label: 'Contributions', description: 'Dues, tithes and offerings.', icon: Landmark },
  { path: '/attendance', label: 'Attendance', description: 'Service check-in and attendance tracking.', icon: ClipboardCheck },
  { path: '/field-builder', label: 'Field Builder', description: 'Custom contact fields will be managed here.', icon: Settings2, adminOnly: true },
  { path: '/users', label: 'User Management', description: 'System user administration will be available here.', icon: UserRoundCog, adminOnly: true },
  { path: '/imports', label: 'CSV Imports', description: 'CSV import and mapping tools will be available here.', icon: FileUp, adminOnly: true },
];
