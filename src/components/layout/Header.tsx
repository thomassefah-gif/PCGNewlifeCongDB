import { LogOut, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { routeItems } from '../../routes/routeItems';
import { useAuth } from '../../features/auth/AuthContext';
import HeaderSearch from './HeaderSearch';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const currentPage = routeItems.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  const accountLabel = profile?.full_name || user?.email || 'Church staff';
  const initials = (profile?.full_name || user?.email || 'NL')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      showToast('Signed out successfully', 'success');
      navigate('/login', { replace: true });
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-accent/90 px-4 py-4 backdrop-blur-md sm:px-7 lg:px-10">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-slate-700 lg:hidden"
        >
          <Menu aria-hidden="true" size={20} />
        </button>
        <div className="hidden min-w-36 sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Church office</p>
          <h1 className="mt-0.5 text-base font-semibold text-slate-900">{currentPage?.label ?? 'Workspace'}</h1>
        </div>
        <HeaderSearch />
        <div className="ml-1 flex shrink-0 items-center gap-3 border-l border-stone-200 pl-3 sm:ml-2 sm:pl-5">
          <div className="hidden text-right sm:block">
            <p className="max-w-40 truncate text-xs font-semibold text-slate-800">{accountLabel}</p>
            <p className="mt-0.5 text-[11px] capitalize text-slate-500">{profile?.role ?? 'Church account'}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold tracking-wide text-white" aria-label="New Life Congregation">
            {initials || 'NL'}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<LogOut aria-hidden="true" size={16} />}
            loading={signingOut}
            onClick={() => void handleSignOut()}
            aria-label="Logout"
            title="Logout"
          >
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
