import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { createCustomField, deleteCustomField, getCustomFields, toggleCustomFieldActive, updateCustomField, type CustomField, type CustomFieldInput, type CustomFieldType } from '../lib/queries/customFields';

const fieldTypes: CustomFieldType[] = ['text', 'number', 'date', 'boolean', 'select', 'textarea', 'email', 'phone'];
const schema = z.object({
  label: z.string().trim().min(1, 'Field label is required.'),
  field_key: z.string().trim().min(1, 'Field key is required.').regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers, and underscores; start with a letter.'),
  field_type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'textarea', 'email', 'phone']),
  options_text: z.string(),
  is_required: z.boolean(),
  applies_to: z.enum(['member', 'group', 'staff']),
});
type FormValues = z.infer<typeof schema>;
const defaults: FormValues = { label: '', field_key: '', field_type: 'text', options_text: '', is_required: false, applies_to: 'member' };

function keyFromLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function FieldBuilderPage() {
  const { showToast } = useToast();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [toDelete, setToDelete] = useState<CustomField | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const selectedType = watch('field_type');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFields(await getCustomFields());
    } catch (error) {
      setFields([]);
      showToast(error instanceof Error ? error.message : 'Unable to load custom fields.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void reload(); }, [reload]);

  const startCreate = () => {
    setEditing(null);
    reset(defaults);
    setModalOpen(true);
  };

  const startEdit = (field: CustomField) => {
    setEditing(field);
    reset({
      label: field.label,
      field_key: field.field_key,
      field_type: field.field_type.toLowerCase() as CustomFieldType,
      options_text: (field.options ?? []).join(', '),
      is_required: field.is_required,
      applies_to: field.applies_to.toLowerCase() as FormValues['applies_to'],
    });
    setModalOpen(true);
  };

  const saveField = async (values: FormValues) => {
    const options = values.field_type === 'select' ? values.options_text.split(',').map((option) => option.trim()).filter(Boolean) : [];
    if (values.field_type === 'select' && options.length === 0) {
      showToast('Add at least one option for a Select field.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: CustomFieldInput = {
        label: values.label,
        field_key: values.field_key,
        field_type: values.field_type,
        options,
        is_required: values.is_required,
        applies_to: values.applies_to,
        display_order: editing?.display_order ?? fields.length,
      };
      if (editing) await updateCustomField(editing.id, payload);
      else await createCustomField(payload);
      showToast(editing ? 'Custom field updated.' : 'Custom field created.', 'success');
      setModalOpen(false);
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save custom field.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (field: CustomField) => {
    setTogglingId(field.id);
    try {
      await toggleCustomFieldActive(field.id, !field.is_active);
      showToast(`${field.label} ${field.is_active ? 'deactivated' : 'activated'}.`, 'success');
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update field status.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCustomField(toDelete.id);
      showToast('Custom field deleted.', 'success');
      setToDelete(null);
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete custom field.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-2 text-primary"><Settings2 aria-hidden="true" size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">Administration</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Contact Field Builder</h1><p className="mt-1 text-sm text-slate-600">Create and manage custom fields for church members.</p></div>
        <Button type="button" icon={<Plus aria-hidden="true" size={17} />} onClick={startCreate}>Add Custom Field</Button>
      </header>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-label="Custom field list">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Custom Fields</h2><p className="mt-0.5 text-xs text-slate-500">{fields.length} configured {fields.length === 1 ? 'field' : 'fields'}</p></div></div>
        {loading ? <div className="animate-pulse px-6 py-16 text-center text-sm font-medium text-slate-500">Loading custom fields...</div> : fields.length === 0 ? <EmptyState title="No custom fields yet" description="Add a field to collect information specific to your congregation." /> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left"><thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Label &amp; Field Key</th><th className="px-4 py-3.5">Field Type</th><th className="px-4 py-3.5">Target</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-stone-100">{fields.map((field) => <tr key={field.id} className="hover:bg-accent/40"><td className="px-5 py-4"><p className="text-sm font-semibold text-slate-900">{field.label}{field.is_required && <span className="ml-1 text-danger">*</span>}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{field.field_key}</p></td><td className="px-4 py-4"><Badge variant="primary">{titleCase(field.field_type)}</Badge>{field.field_type.toLowerCase() === 'select' && field.options?.length ? <p className="mt-1 max-w-52 truncate text-xs text-slate-500">{field.options.join(', ')}</p> : null}</td><td className="px-4 py-4 text-sm capitalize text-slate-700">{field.applies_to}</td><td className="px-4 py-4"><Badge variant={field.is_active ? 'active' : 'inactive'}>{field.is_active ? 'Active' : 'Inactive'}</Badge></td><td className="px-4 py-4"><div className="flex items-center justify-end gap-2"><button type="button" role="switch" aria-checked={field.is_active} aria-label={`${field.is_active ? 'Deactivate' : 'Activate'} ${field.label}`} disabled={togglingId === field.id} onClick={() => void toggleActive(field)} className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${field.is_active ? 'bg-primary' : 'bg-stone-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${field.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} /></button><button type="button" aria-label={`Edit ${field.label}`} onClick={() => startEdit(field)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary"><Pencil aria-hidden="true" size={16} /></button><button type="button" aria-label={`Delete ${field.label}`} onClick={() => setToDelete(field)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button></div></td></tr>)}</tbody></table></div>}
      </section>

      <Modal isOpen={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editing ? 'Edit Custom Field' : 'Create Custom Field'} maxWidth="lg">
        <form className="space-y-4" onSubmit={handleSubmit(saveField)} noValidate>
          <div><label htmlFor="custom-field-label" className="mb-1.5 block text-sm font-medium text-slate-700">Field Label <span className="text-danger">*</span></label><input id="custom-field-label" autoFocus className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('label', { onChange: (event) => { if (!editing) setValue('field_key', keyFromLabel(event.target.value)); } })} placeholder="e.g. Tithe Card Number" />{errors.label && <p className="mt-1 text-xs text-danger">{errors.label.message}</p>}</div>
          <div><label htmlFor="custom-field-key" className="mb-1.5 block text-sm font-medium text-slate-700">Field Key <span className="text-danger">*</span></label><input id="custom-field-key" className="h-10 w-full rounded-xl border border-stone-300 px-3 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('field_key')} placeholder="tithe_card_number" />{errors.field_key && <p className="mt-1 text-xs text-danger">{errors.field_key.message}</p>}<p className="mt-1 text-xs text-slate-500">Stable key used to link member values to this field.</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="custom-field-type" className="mb-1.5 block text-sm font-medium text-slate-700">Field Type <span className="text-danger">*</span></label><select id="custom-field-type" className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('field_type')}>
            {fieldTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
          </select></div><div><label htmlFor="custom-field-target" className="mb-1.5 block text-sm font-medium text-slate-700">Applies To <span className="text-danger">*</span></label><select id="custom-field-target" className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('applies_to')}><option value="member">Member</option><option value="group">Group</option><option value="staff">Staff</option></select></div></div>
          {selectedType === 'select' && <div><label htmlFor="custom-field-options" className="mb-1.5 block text-sm font-medium text-slate-700">Dropdown Options <span className="text-danger">*</span></label><textarea id="custom-field-options" rows={3} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" {...register('options_text')} placeholder="Option A, Option B, Option C" /><p className="mt-1 text-xs text-slate-500">Separate options with commas.</p></div>}
          <label className="flex items-center gap-2.5 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" {...register('is_required')} /> Required field</label>
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{editing ? 'Save Changes' : 'Create Field'}</Button></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(toDelete)} onClose={() => { if (!deleting) setToDelete(null); }} onConfirm={confirmDelete} title="Delete custom field" message={`Delete “${toDelete?.label ?? 'this field'}”? Existing saved values may be removed by the database relationship policy.`} confirmLabel="Delete Field" loading={deleting} />
    </div>
  );
}
