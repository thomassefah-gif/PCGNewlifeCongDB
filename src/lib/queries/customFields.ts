import { supabase } from '../supabaseClient';

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'textarea' | 'email' | 'phone';
export type CustomFieldTarget = 'member' | 'group' | 'staff';

export interface CustomField {
  id: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType | string;
  options: string[] | null;
  is_required: boolean;
  applies_to: CustomFieldTarget | string;
  display_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at?: string;
}

export interface CustomFieldInput {
  label: string;
  field_key: string;
  field_type: string;
  options?: string[];
  is_required: boolean;
  applies_to: string;
  display_order?: number;
}

export interface MemberCustomFieldValue {
  id: string;
  member_id: string;
  field_id: string;
  value: unknown;
  custom_fields: CustomField | null;
}

export async function getCustomFields(): Promise<CustomField[]> {
  const { data, error } = await supabase
    .from('custom_fields')
    .select('id,field_key,label,field_type,options,is_required,applies_to,display_order,is_active,created_by,created_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomField[];
}

export async function createCustomField(data: CustomFieldInput): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const createdBy = authData.user?.id?.trim();
  const payload = {
    label: data.label.trim(),
    field_key: data.field_key.trim(),
    field_type: data.field_type,
    options: data.field_type.toLowerCase() === 'select' ? data.options ?? [] : null,
    is_required: data.is_required,
    applies_to: data.applies_to,
    display_order: data.display_order ?? 0,
    is_active: true,
    ...(createdBy ? { created_by: createdBy } : {}),
  };
  const { error } = await supabase.from('custom_fields').insert(payload);
  if (error) throw error;
}

export async function updateCustomField(id: string, data: Partial<CustomField>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.label !== undefined) payload.label = data.label.trim();
  if (data.field_key !== undefined) payload.field_key = data.field_key.trim();
  if (data.field_type !== undefined) payload.field_type = data.field_type;
  if (data.options !== undefined) {
    payload.options = (data.field_type ?? '').toLowerCase() === 'select' ? data.options : null;
  } else if (data.field_type !== undefined && data.field_type.toLowerCase() !== 'select') {
    payload.options = null;
  }
  if (data.is_required !== undefined) payload.is_required = data.is_required;
  if (data.applies_to !== undefined) payload.applies_to = data.applies_to;
  if (data.display_order !== undefined) payload.display_order = data.display_order;
  if (data.is_active !== undefined) payload.is_active = data.is_active;
  const { error } = await supabase.from('custom_fields').update(payload).eq('id', id);
  if (error) throw error;
}

export async function toggleCustomFieldActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('custom_fields').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deleteCustomField(id: string): Promise<void> {
  const { error } = await supabase.from('custom_fields').delete().eq('id', id);
  if (error) throw error;
}

export async function getMemberCustomFieldValues(memberId: string): Promise<MemberCustomFieldValue[]> {
  const { data, error } = await supabase
    .from('member_custom_field_values')
    .select('id,member_id,field_id,value,custom_fields(id,field_key,label,field_type,options,is_required,applies_to,display_order,is_active,created_by)')
    .eq('member_id', memberId);
  if (error) throw error;
  return (data ?? []) as unknown as MemberCustomFieldValue[];
}

export async function upsertMemberCustomFieldValues(memberId: string, values: Record<string, unknown>): Promise<void> {
  const fieldKeys = Object.keys(values).filter((key) => key.trim());
  if (fieldKeys.length === 0) return;
  const { data: fields, error: fieldsError } = await supabase
    .from('custom_fields')
    .select('id,field_key')
    .in('field_key', fieldKeys);
  if (fieldsError) throw fieldsError;

  const fieldIdByKey = new Map((fields ?? []).map((field) => [field.field_key as string, field.id as string]));
  const rows = fieldKeys.flatMap((fieldKey) => {
    const fieldId = fieldIdByKey.get(fieldKey);
    return fieldId ? [{ member_id: memberId, field_id: fieldId, value: values[fieldKey] ?? null }] : [];
  });
  if (!rows.length) return;
  const { error } = await supabase.from('member_custom_field_values').upsert(rows, { onConflict: 'member_id,field_id' });
  if (error) throw error;
}
