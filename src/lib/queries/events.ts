import { supabase } from '../supabaseClient';

export interface SpecialEvent {
  id: string;
  title: string;
  event_date: string;
  notes: string | null;
}

export interface SpecialEventInput {
  title: string;
  event_date: string;
  notes: string;
}

const columns = 'id,title,event_date,notes';

function fail(err: unknown): never {
  const e = err as { message?: string } | null;
  throw new Error(e?.message || String(err));
}

export async function getSpecialEvents(): Promise<SpecialEvent[]> {
  try {
    const { data, error } = await supabase.from('special_events').select(columns).order('event_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SpecialEvent[];
  } catch (err) {
    return fail(err);
  }
}

export async function createSpecialEvent(input: SpecialEventInput): Promise<SpecialEvent> {
  try {
    const { data, error } = await supabase
      .from('special_events')
      .insert({ title: input.title.trim(), event_date: input.event_date, notes: input.notes.trim() || null })
      .select(columns)
      .single();
    if (error) throw error;
    return data as SpecialEvent;
  } catch (err) {
    return fail(err);
  }
}

export async function updateSpecialEvent(id: string, input: SpecialEventInput): Promise<SpecialEvent> {
  try {
    const { data, error } = await supabase
      .from('special_events')
      .update({ title: input.title.trim(), event_date: input.event_date, notes: input.notes.trim() || null })
      .eq('id', id)
      .select(columns)
      .single();
    if (error) throw error;
    return data as SpecialEvent;
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSpecialEvent(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('special_events').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    return fail(err);
  }
}
