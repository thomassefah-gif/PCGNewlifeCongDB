import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { getDriveThumbnailUrl, getMemberPhotoUrl, getPhotoDriveFileId } from '../lib/memberFields';
import type { Member } from '../types/member';

interface MemberAvatarProps {
  member?: Partial<Member> | null;
  /** Overrides the member's stored photo, e.g. a live form value. Run through the same Drive conversion. */
  url?: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
  /** Click the photo to view it full size and download it. */
  enlargeable?: boolean;
}

function extensionFor(blobType: string, url: string): string {
  const fromType = /^image\/(\w+)/.exec(blobType)?.[1];
  if (fromType) return fromType === 'jpeg' ? 'jpg' : fromType;
  return /\.(png|jpe?g|webp|gif)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
}

function PhotoLightbox({ src, alt, name, onClose }: { src: string; alt: string; name: string; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${name || 'member'}.${extensionFor(blob.type, src)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Cross-origin hosts (e.g. Google Drive) can block fetch; open the image so it can be saved manually.
      window.open(src, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt || 'Member photo'} className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-primaryDark/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} className="max-h-[78vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl" />
      <div className="flex gap-3" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => void download()} disabled={downloading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow hover:bg-primaryDark disabled:opacity-60">
          <Download aria-hidden="true" size={16} /> {downloading ? 'Downloading…' : 'Download'}
        </button>
        <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 shadow hover:bg-stone-100">
          <X aria-hidden="true" size={16} /> Close
        </button>
      </div>
    </div>,
    document.body,
  );
}

function PhotoImage({ url, alt, className, fallback, enlargeable, name }: { url: string; alt: string; className: string; fallback: ReactNode; enlargeable: boolean; name: string }) {
  const [stage, setStage] = useState<'primary' | 'thumbnail' | 'failed'>('primary');
  const [open, setOpen] = useState(false);
  const fileId = getPhotoDriveFileId(url);

  if (stage === 'failed') return <>{fallback}</>;
  const src = stage === 'thumbnail' && fileId ? getDriveThumbnailUrl(fileId) : url;
  const onError = () => setStage(stage === 'primary' && fileId ? 'thumbnail' : 'failed');
  const image = <img src={src} alt={alt} onError={onError} className={`shrink-0 object-cover ring-1 ring-stone-200 ${className}`} />;
  if (!enlargeable) return image;

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`View ${name || 'member'} photo`} title="Click to enlarge" className="shrink-0 cursor-zoom-in rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">{image}</button>
    {open && <PhotoLightbox src={src} alt={alt || name} name={name} onClose={() => setOpen(false)} />}
  </>;
}

export default function MemberAvatar({ member, url, alt = '', className = 'h-9 w-9 rounded-full text-xs', fallback, enlargeable = false }: MemberAvatarProps) {
  const photoUrl = url === undefined ? getMemberPhotoUrl(member) : getMemberPhotoUrl({ photo_url: url });
  const initials = `${member?.first_name?.[0] ?? ''}${member?.surname?.[0] ?? ''}`.toUpperCase() || '?';
  const name = [member?.first_name, member?.surname].filter(Boolean).join('_');
  const placeholder = fallback ?? <div className={`flex shrink-0 items-center justify-center bg-primary/10 font-bold text-primaryDark ${className}`} aria-hidden="true">{initials}</div>;

  if (!photoUrl) return <>{placeholder}</>;
  // Keyed by URL so a new photo restarts the fallback chain.
  return <PhotoImage key={photoUrl} url={photoUrl} alt={alt} className={className} fallback={placeholder} enlargeable={enlargeable} name={name} />;
}
