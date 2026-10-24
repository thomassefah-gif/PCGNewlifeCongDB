import { useGroupScope } from '../hooks/useGroupScope';

export default function GroupScopeBanner() {
  const { isLeader, assignedGroup } = useGroupScope();
  if (!isLeader) return null;

  return (
    <aside className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-[#1E3A8A]" role="status">
      You are viewing <strong>{assignedGroup || 'your assigned group'}</strong> only.
    </aside>
  );
}
