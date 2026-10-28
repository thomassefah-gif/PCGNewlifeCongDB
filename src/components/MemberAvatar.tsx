import { useState, type ReactNode } from 'react';
import { getDriveThumbnailUrl, getMemberPhotoUrl, getPhotoDriveFileId } from '../lib/memberFields';
import type { Member } from '../types/member';

interface MemberAvatarProps {
  member?: Partial<Member> | null;
  /** Overrides the member's stored photo, e.g. a live form value. Run through the same Drive conversion. */
  url?: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
}

function PhotoImage({ url, alt, className, fallback }: { url: string; alt: string; className: string; fallback: ReactNode }) {
  const [stage, setStage] = useState<'primary' | 'thumbnail' | 'failed'>('primary');
  const fileId = getPhotoDriveFileId(url);

  if (stage === 'failed') return <>{fallback}</>;
  const src = stage === 'thumbnail' && fileId ? getDriveThumbnailUrl(fileId) : url;
  const onError = () => setStage(stage === 'primary' && fileId ? 'thumbnail' : 'failed');
  return <img src={src} alt={alt} onError={onError} className={`shrink-0 object-cover ring-1 ring-stone-200 ${className}`} />;
}

export default function MemberAvatar({ member, url, alt = '', className = 'h-9 w-9 rounded-full text-xs', fallback }: MemberAvatarProps) {
  const photoUrl = url === undefined ? getMemberPhotoUrl(member) : getMemberPhotoUrl({ photo_url: url });
  const initials = `${member?.first_name?.[0] ?? ''}${member?.surname?.[0] ?? ''}`.toUpperCase() || '?';
  const placeholder = fallback ?? <div className={`flex shrink-0 items-center justify-center bg-primary/10 font-bold text-primaryDark ${className}`} aria-hidden="true">{initials}</div>;

  if (!photoUrl) return <>{placeholder}</>;
  // Keyed by URL so a new photo restarts the fallback chain.
  return <PhotoImage key={photoUrl} url={photoUrl} alt={alt} className={className} fallback={placeholder} />;
}
