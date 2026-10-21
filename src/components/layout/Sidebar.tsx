import { useState } from 'react';
import { ArrowUpRight, Church, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { routeItems } from '../../routes/routeItems';
import { useAuth } from '../../features/auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import { useToast } from '../ui/Toast';

interface SidebarProps {
  mobileOpen: boolean;
  onNavigate: () => void;
}

export default function Sidebar({ mobileOpen, onNavigate }: SidebarProps) {
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const { signOut, role } = useAuth();
  const { showToast } = useToast();

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onNavigate();
      showToast('Signed out successfully', 'success');
      navigate('/login', { replace: true });
    } catch (error) {
      console.error(error);
      showToast(getErrorMessage(error), 'error');
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] flex-col bg-primary px-4 pb-5 pt-6 text-white shadow-xl transition-transform duration-300 lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      aria-label="Main navigation"
    >
      <div className="flex shrink-0 items-center gap-3 px-2 pb-8">
        {!logoUnavailable ? (
          <img
            src="/LogoImg/presbylogo.png"
            alt="New Life Congregation shield"
            className="h-12 w-12 rounded-xl bg-white object-contain p-1"
            onError={() => setLogoUnavailable(true)}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white">
            <Church aria-hidden="true" size={25} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide">New Life Congregation</p>
          <p className="mt-1 text-[11px] leading-4 text-white/70">Presbyterian Church of Ghana</p>
          <p className="text-[11px] leading-4 text-white/70">Ga West Presbytery</p>
        </div>
      </div>

      <p className="shrink-0 px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Workspace</p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-color:rgba(255,255,255,0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/30 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5" aria-label="Workspace pages">
        {routeItems.filter((item) => !item.adminOnly || role === 'admin').map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            onClick={onNavigate}
            className={({ isActive }) => clsx(
              'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
              isActive ? 'bg-white text-primary shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon aria-hidden="true" size={19} strokeWidth={1.9} />
            <span className="flex-1">{label}</span>
            {label === 'Dashboard' && <ArrowUpRight aria-hidden="true" className="opacity-45" size={15} />}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 shrink-0 rounded-xl border border-white/15 bg-white/10 p-4">
        <p className="text-xs font-semibold">Welcome</p>
        <p className="mt-1 text-xs leading-5 text-white/70">Your congregation workspace is ready to set up.</p>
      </div>
      <div className="mt-4 shrink-0 border-t border-white/15 pt-3">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut aria-hidden="true" size={19} className={signingOut ? 'animate-pulse' : undefined} />
          {signingOut ? 'Signing out…' : 'Logout'}
        </button>
      </div>
    </aside>
  );
}
