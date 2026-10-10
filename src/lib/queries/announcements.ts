import { supabase } from '../supabaseClient';

export interface Announcement {
  id: string;
  title: string;
  date: string;
  content: string;
  created_at: string;
}

export interface AnnouncementInput {
  title: string;
  date: string;
  content: string;
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id,title,date,content,created_at')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function createAnnouncement(data: AnnouncementInput): Promise<Announcement> {
  const { data: authResult } = await supabase.auth.getUser();
  const payload: AnnouncementInput & { created_by?: string } = {
    title: data.title.trim(),
    date: data.date,
    content: data.content.trim(),
  };
  const profileId = authResult.user?.id;
  if (profileId?.trim()) payload.created_by = profileId;

  const { data: inserted, error } = await supabase
    .from('announcements')
    .insert(payload)
    .select('id,title,date,content,created_at')
    .single();
  if (error) throw new Error(error.message);
  return inserted as Announcement;
}

export async function updateAnnouncement(id: string, data: AnnouncementInput): Promise<void> {
  const { error } = await supabase.from('announcements').update({
    title: data.title.trim(),
    date: data.date,
    content: data.content.trim(),
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkInsertAnnouncements(rows: AnnouncementInput[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('announcements').insert(rows.map((row) => ({
    title: row.title.trim(),
    date: row.date,
    content: row.content.trim(),
  })));
  if (error) throw error;
}

export async function bulkCreateAnnouncements(items: AnnouncementInput[]): Promise<void> {
  await bulkInsertAnnouncements(items);
}
