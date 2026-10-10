import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-accent text-slate-900">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
      <div className="min-h-screen lg:pl-[280px]">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          <Outlet />
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-slate-500 sm:px-7 lg:px-10">
          New Life Congregation <span aria-hidden="true">·</span> Presbyterian Church of Ghana — Ga West Presbytery
        </footer>
      </div>
    </div>
  );
}
