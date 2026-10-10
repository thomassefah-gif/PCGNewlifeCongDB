import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Badge from '../ui/Badge';
import { calculateAge } from '../../lib/date';
import { searchMembers } from '../../lib/queries/members';
import type { Member } from '../../types/member';

type SearchResult = Pick<Member, 'id' | 'title' | 'first_name' | 'surname' | 'email' | 'mobile_phone' | 'date_of_birth' | 'status'>;

function fullName(member: SearchResult): string {
  return [member.title, member.first_name, member.surname].filter(Boolean).join(' ') || 'Unnamed member';
}

export default function HeaderSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedTerm(term.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    let active = true;
    if (debouncedTerm.length < 2) {
      setResults([]);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void searchMembers(debouncedTerm, 8)
      .then((matches) => { if (active) setResults(matches); })
      .catch((error: unknown) => {
        if (active) {
          console.error('Global member search failed.', error);
          setResults([]);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedTerm]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    setOpen(false);
    setTerm('');
    setResults([]);
  }, [location.pathname]);

  const selectResult = (member: SearchResult) => {
    setOpen(false);
    setTerm('');
    navigate(`/contacts/${member.id}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => results.length ? (current + 1) % results.length : -1);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => results.length ? (current <= 0 ? results.length - 1 : current - 1) : -1);
    }
    if (event.key === 'Enter' && open && results.length) {
      event.preventDefault();
      selectResult(results[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  return (
    <div ref={containerRef} className="relative ml-auto w-full max-w-md sm:ml-0">
      <label className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3.5 text-slate-500 shadow-sm transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
        <Search aria-hidden="true" size={18} />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => { setTerm(event.target.value); setOpen(true); setActiveIndex(-1); }}
          onFocus={() => { if (term.trim().length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Search members..."
          aria-label="Search members across the church"
          aria-autocomplete="list"
          aria-expanded={open && term.trim().length >= 2}
          aria-controls="global-member-search-results"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        <kbd className="hidden rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 md:inline">⌘ K</kbd>
      </label>

      {open && term.trim().length >= 2 && <div id="global-member-search-results" role="listbox" aria-label="Member search results" className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] max-h-[min(70vh,480px)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
        {loading ? <div className="animate-pulse px-4 py-8 text-center text-sm text-slate-500">Searching members...</div> : results.length === 0 ? <p className="px-4 py-7 text-center text-sm text-slate-500">No members found</p> : results.map((member, index) => {
          const initials = `${member.first_name?.[0] ?? ''}${member.surname?.[0] ?? ''}`.toUpperCase() || '?';
          const age = calculateAge(member.date_of_birth);
          return <button
            key={member.id}
            type="button"
            role="option"
            aria-selected={activeIndex === index}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectResult(member)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${activeIndex === index ? 'bg-accent' : 'hover:bg-stone-50'}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primaryDark">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="truncate text-sm font-semibold text-slate-900">{fullName(member)}</span><span className="text-xs text-slate-500">{age === null ? 'Age unavailable' : `${age} years`}</span></span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{member.email || member.mobile_phone || 'No email or phone recorded'}{member.email && member.mobile_phone ? ` · ${member.mobile_phone}` : ''}</span>
            </span>
            <Badge variant={member.status === 'Active' ? 'active' : 'inactive'}>{member.status}</Badge>
          </button>;
        })}
        <p className="border-t border-stone-100 px-3 pb-1 pt-2 text-[10px] text-slate-400">Use ↑ ↓ to navigate · Enter to open · Esc to close</p>
      </div>}
    </div>
  );
}
