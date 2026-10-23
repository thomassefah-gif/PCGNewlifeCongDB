import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Edit3, Plus, Trash2, UserRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../features/auth/AuthContext';
import { calculateAge, formatDate } from '../lib/date';
import { addMemberToGroup, getAllGroups, getMemberById, removeMemberFromGroup, updateMember } from '../lib/queries/members';
import { getCustomFields, getMemberCustomFieldValues, upsertMemberCustomFieldValues, type CustomField } from '../lib/queries/customFields';
import { exportToCSV } from '../lib/csv';
import type { Group, MemberProfile } from '../types/member';

type ProfileTab = 'Overview' | 'Groups' | 'Family & Relationships' | 'Sacraments' | 'Custom Fields' | 'Admin Notes';
const tabs: ProfileTab[] = ['Overview', 'Groups', 'Family & Relationships', 'Sacraments', 'Custom Fields', 'Admin Notes'];

function display(value: string | null | undefined): string {
  return value?.trim() || '—';
}

function memberName(member: MemberProfile): string {
  return [member.title, member.first_name, member.surname].filter(Boolean).join(' ') || 'Unnamed member';
}

function InfoGrid({ items }: { items: Array<[string, string | null | undefined]> }) {
  return <dl className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
    {items.map(([label, value]) => <div key={label} className="border-b border-stone-100 py-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">{display(value)}</dd>
    </div>)}
  </dl>;
}

function relationshipLabel(type: string, direction: 'outgoing' | 'incoming'): string {
  if (direction === 'outgoing') return type.charAt(0).toUpperCase() + type.slice(1);
  const inverse: Record<string, string> = { parent: 'Child', child: 'Parent', guardian: 'Ward', ward: 'Guardian', spouse: 'Spouse', sibling: 'Sibling' };
  return inverse[type] ?? type;
}

export default function MemberDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { role } = useAuth();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tab, setTab] = useState<ProfileTab>('Overview');
  const [loading, setLoading] = useState(true);
  const [groupToAdd, setGroupToAdd] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [savingCustomValues, setSavingCustomValues] = useState(false);

  const refreshMember = useCallback(async () => {
    const record = await getMemberById(id, role === 'admin');
    setMember(record);
  }, [id, role]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([getMemberById(id, role === 'admin'), getAllGroups(), getCustomFields(), getMemberCustomFieldValues(id)])
      .then(([record, availableGroups, allCustomFields, savedCustomValues]) => {
        if (!active) return;
        setMember(record);
        setAdminNotes(record.admin_notes ?? '');
        setGroups(availableGroups);
        setCustomFields(allCustomFields.filter((field) => field.is_active && field.applies_to.toLowerCase() === 'member'));
        setCustomValues(Object.fromEntries(savedCustomValues.flatMap((saved) => saved.custom_fields?.field_key ? [[saved.custom_fields.field_key, saved.value]] : [])));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error(error);
        showToast(error instanceof Error ? error.message : String(error), 'error');
        navigate('/contacts', { replace: true });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getMemberById, id, navigate, role, showToast]);

  const activeGroupIds = useMemo(() => new Set(member?.member_groups.filter((item) => item.membership_status === 'Active').map((item) => item.group_id) ?? []), [member]);
  const availableToAdd = groups.filter((group) => !activeGroupIds.has(group.id));

  const handleAddGroup = async () => {
    if (!groupToAdd) return;
    setSavingGroup(true);
    try {
      await addMemberToGroup(id, groupToAdd);
      await refreshMember();
      setGroupToAdd('');
      showToast('Member added to group.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    try {
      await removeMemberFromGroup(id, groupId);
      await refreshMember();
      showToast('Group membership removed.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const saveAdminNotes = async () => {
    setSavingNotes(true);
    try {
      await updateMember(id, { admin_notes: adminNotes });
      setMember((current) => current ? { ...current, admin_notes: adminNotes } : current);
      showToast('Admin notes saved.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const saveCustomValues = async () => {
    setSavingCustomValues(true);
    try {
      const missingRequired = customFields.find((field) => field.is_required && (
        customValues[field.field_key] === undefined || customValues[field.field_key] === null ||
        (typeof customValues[field.field_key] === 'string' && !String(customValues[field.field_key]).trim()) ||
        (field.field_type.toLowerCase() === 'boolean' && customValues[field.field_key] !== true)
      ));
      if (missingRequired) {
        showToast(`${missingRequired.label} is required.`, 'error');
        return;
      }
      await upsertMemberCustomFieldValues(id, Object.fromEntries(customFields.map((field) => [field.field_key, customValues[field.field_key] ?? (field.field_type.toLowerCase() === 'boolean' ? false : '')])));
      showToast('Custom field values saved.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSavingCustomValues(false);
    }
  };

  const setCustomValue = (fieldKey: string, value: unknown) => {
    setCustomValues((current) => ({ ...current, [fieldKey]: value }));
  };

  const renderCustomField = (field: CustomField) => {
    const type = field.field_type.toLowerCase();
    const value = customValues[field.field_key];
    const inputClass = 'h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
    if (type === 'boolean') return <label key={field.id} className="flex min-h-10 items-center gap-2.5 text-sm font-medium text-slate-700"><input type="checkbox" checked={Boolean(value)} onChange={(event) => setCustomValue(field.field_key, event.target.checked)} className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" />{field.label}</label>;
    if (type === 'select') return <label key={field.id} className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span><select value={String(value ?? '')} onChange={(event) => setCustomValue(field.field_key, event.target.value)} className={`${inputClass} appearance-none`}><option value="">Select an option</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
    if (type === 'textarea') return <label key={field.id} className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span><textarea rows={3} value={String(value ?? '')} onChange={(event) => setCustomValue(field.field_key, event.target.value)} className={`${inputClass} h-auto py-2.5`} /></label>;
    const inputType = ['email', 'phone', 'number', 'date'].includes(type) ? (type === 'phone' ? 'tel' : type) : 'text';
    return <label key={field.id} className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span><input type={inputType} value={String(value ?? '')} onChange={(event) => setCustomValue(field.field_key, type === 'number' ? event.target.value === '' ? '' : Number(event.target.value) : event.target.value)} className={inputClass} /></label>;
  };

  if (loading) return <div className="animate-pulse rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">Loading member profile...</div>;
  if (!member) return <EmptyState title="Member not found" description="This member record may have been removed or is not available to your account." />;

  const age = calculateAge(member.date_of_birth);
  const initials = `${member.first_name?.[0] ?? ''}${member.surname?.[0] ?? ''}`.toUpperCase() || '?';
  const sacraments = member.member_sacraments;
  const exportRecord = (({ member_groups, member_relationships, member_family_contacts, member_sacraments, ...data }) => ({
    ...data,
    Groups: member_groups.map((item) => item.groups?.name).filter(Boolean).join('; '),
    Relationships: member_relationships.map((item) => `${relationshipLabel(item.relationship_type, item.direction)}: ${item.related_member ? [item.related_member.first_name, item.related_member.surname].filter(Boolean).join(' ') : ''}`).join('; '),
    Family_Contacts: member_family_contacts.map((item) => `${item.relationship_type}: ${item.full_name}`).join('; '),
    Baptism_Date: member_sacraments?.baptism_date ?? '',
    Confirmation_Date: member_sacraments?.confirmation_date ?? '',
  }))(member);

  const generationalGroup = member.member_groups.find((item) => item.membership_status === 'Active' && item.groups?.group_type === 'generational')?.groups?.name ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button type="button" onClick={() => navigate('/contacts')} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary">
        <ArrowLeft aria-hidden="true" size={16} /> Back to contacts
      </button>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {member.photo_url ? <img src={member.photo_url} alt={`${memberName(member)} profile`} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-stone-200" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primaryDark sm:h-20 sm:w-20 sm:text-xl">{initials}</div>}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{memberName(member)}</h1>
                <Badge variant={member.status === 'Active' ? 'active' : 'inactive'}>{member.status}</Badge>
                <Badge variant={member.is_distant_member ? 'distant' : 'primary'}>{member.is_distant_member ? 'Distant' : 'Resident'}</Badge>
                {generationalGroup && generationalGroup !== 'No Group Membership' && <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{generationalGroup}</span>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{member.email || 'No email recorded'} <span className="px-1">·</span> {member.mobile_phone || member.residential_phone || 'No phone recorded'}</p>
              {member.title_other && <p className="mt-1 text-xs text-slate-500">{member.title_other}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-accent px-5 py-3 lg:min-w-48">
            <UserRound aria-hidden="true" className="text-primary" size={22} />
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calculated age</p><p className="mt-0.5 text-xl font-bold text-primaryDark">{age === null ? '—' : `${age} ${age === 1 ? 'year' : 'years'}`}</p></div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-100 pt-5">
          <Button type="button" icon={<Edit3 aria-hidden="true" size={16} />} onClick={() => navigate(`/contacts/${id}/edit`)}>Edit Member</Button>
          <Button type="button" variant="outline" icon={<Download aria-hidden="true" size={16} />} onClick={() => exportToCSV([exportRecord], { filename: `member_${id}`, isMemberData: true })}>Export Profile (CSV)</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <div role="tablist" aria-label="Member profile sections" className="flex gap-1 overflow-x-auto border-b border-stone-200 px-3 pt-3 sm:px-5">
          {tabs.filter((item) => item !== 'Admin Notes' || role === 'admin').map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-t-xl px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${tab === item ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-800'}`}>{item}</button>)}
        </div>

        {tab === 'Overview' && <div className="space-y-7 p-5 sm:p-7">
          <div><h2 className="mb-2 font-semibold text-slate-900">Personal Information</h2><InfoGrid items={[
            ['Title', member.title], ['First Name', member.first_name], ['Surname', member.surname], ['Maiden Name', member.maiden_name],
            ['Sex', member.sex], ['Date of Birth', formatDate(member.date_of_birth)], ['Date of Birth Estimated', member.date_of_birth_is_estimated ? 'Yes' : 'No'],
            ['Communicant Status', member.communicant_status], ['Marital Status', member.marital_status], ['Marriage Type', member.marriage_type],
            ['Profession', member.profession], ['Occupation', member.occupation], ['Special Interests', member.special_interests],
          ]} /></div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <h2 className="font-semibold text-primaryDark">Emergency Contact</h2>
            <InfoGrid items={[
              ['Emergency Contact Name', member.emergency_contact_name],
              ['Emergency Contact Phone', member.emergency_contact_phone],
            ]} />
          </div>
          <div><h2 className="mb-2 font-semibold text-slate-900">Origin &amp; Residence</h2><InfoGrid items={[
            ['Home Town', member.home_town], ['Place of Birth', member.place_of_birth], ['Nationality', member.nationality],
            ['Residence Area', member.residence_area], ['Area Description', member.residence_description], ['House Number', member.house_number],
            ['Street Name', member.street_name], ['Postal Address', member.postal_address], ['Mobile Phone', member.mobile_phone],
            ['Residential Phone', member.residential_phone], ['Email', member.email], ['Location Status', member.is_distant_member ? 'Distant Member' : 'Resident Member'],
          ]} /></div>
          <div><h2 className="mb-2 font-semibold text-slate-900">Church Membership</h2><InfoGrid items={[
            ['Member Status', member.status], ['Date Joined New Life', formatDate(member.date_joined_new_life)], ['New Life Date Estimated', member.date_joined_new_life_is_estimated ? 'Yes' : 'No'],
            ['Date Joined PCG', formatDate(member.date_joined_pcg)],
            ['Primary Generational Group', member.member_groups.find((item) => item.membership_status === 'Active' && item.is_primary && item.groups?.group_type === 'generational')?.groups?.name ?? null],
            ['Family Group', member.member_groups.find((item) => item.membership_status === 'Active' && item.groups?.group_type === 'family')?.groups?.name ?? null],
          ]} /></div>
        </div>}

        {tab === 'Groups' && <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><h2 className="font-semibold text-slate-900">Group Memberships</h2><p className="mt-1 text-sm text-slate-500">Active and inactive groups linked to this member.</p></div>
            <div className="flex gap-2">
              <select aria-label="Select group to add" value={groupToAdd} onChange={(event) => setGroupToAdd(event.target.value)} className="h-10 min-w-48 rounded-xl border border-stone-300 bg-white px-3 text-sm text-slate-700">
                <option value="">Select a group</option>{availableToAdd.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <Button type="button" icon={<Plus aria-hidden="true" size={16} />} disabled={!groupToAdd} loading={savingGroup} onClick={() => void handleAddGroup()}>Add</Button>
            </div>
          </div>
          {member.member_groups.length === 0 ? <EmptyState title="No groups assigned" description="Add this member to a church group using the selector above." /> : <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {member.member_groups.map((membership) => <div key={membership.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound aria-hidden="true" size={17} /></span><div><p className="text-sm font-semibold text-slate-800">{membership.groups?.name ?? 'Unknown group'}</p><p className="mt-0.5 text-xs capitalize text-slate-500">{membership.groups?.group_type ?? 'Group'}{membership.is_primary ? ' · Primary' : ''}</p></div></div>
              <div className="flex items-center gap-3"><Badge variant={membership.membership_status === 'Active' ? 'active' : 'inactive'}>{membership.membership_status}</Badge><button type="button" aria-label={`Remove ${membership.groups?.name ?? 'group'} membership`} onClick={() => void handleRemoveGroup(membership.group_id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-danger/10 hover:text-danger"><Trash2 aria-hidden="true" size={16} /></button></div>
            </div>)}
          </div>}
        </div>}

        {tab === 'Family & Relationships' && <div className="space-y-7 p-5 sm:p-7">
          {(member.maiden_name || member.marriage_type || member.spouse_name || member.spouse_phone || member.spouse_postal_address || member.children_names || member.children_contacts) && <div><h2 className="mb-2 font-semibold text-slate-900">Family Details</h2><InfoGrid items={[
            ...(member.maiden_name ? [['Maiden Name', member.maiden_name] as [string, string]] : []),
            ...(member.marriage_type ? [['Marriage Type', member.marriage_type] as [string, string]] : []),
            ...(member.spouse_name ? [['Spouse Name', member.spouse_name] as [string, string]] : []),
            ...(member.spouse_phone ? [['Spouse Contact Phone', member.spouse_phone] as [string, string]] : []),
            ...(member.spouse_postal_address ? [['Spouse Postal Address', member.spouse_postal_address] as [string, string]] : []),
            ...(member.children_names ? [['Children Names', member.children_names] as [string, string]] : []),
            ...(member.children_contacts ? [['Children Contacts', member.children_contacts] as [string, string]] : []),
          ]} /></div>}
          <div><h2 className="mb-3 font-semibold text-slate-900">Linked Church Members</h2>
            {member.member_relationships.length === 0 ? <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-slate-500">No church member relationships recorded.</p> : <div className="grid gap-3 md:grid-cols-2">
              {member.member_relationships.map((relationship) => <article key={`${relationship.id}-${relationship.direction}`} className="flex items-center gap-3 rounded-xl border border-stone-200 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound aria-hidden="true" size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{relationship.related_member ? [relationship.related_member.title, relationship.related_member.first_name, relationship.related_member.surname].filter(Boolean).join(' ') : 'Member record unavailable'}</p><p className="mt-0.5 text-xs text-slate-500">{relationshipLabel(relationship.relationship_type, relationship.direction)}{relationship.is_primary ? ' · Primary' : ''}</p><p className="mt-1 truncate text-xs text-slate-500">{relationship.related_member?.mobile_phone || relationship.related_member?.email || ''}</p></div>
              </article>)}
            </div>}
          </div>
          <div><h2 className="mb-3 font-semibold text-slate-900">External Family Contacts</h2>
            {member.member_family_contacts.length === 0 ? <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-slate-500">No external family contacts recorded.</p> : <div className="grid gap-3 md:grid-cols-2">
              {member.member_family_contacts.map((contact) => <article key={contact.id} className="rounded-xl border border-stone-200 p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-800">{contact.full_name}</h3><Badge variant="gray">{contact.relationship_type.replace('_', ' ')}</Badge></div><p className="mt-2 text-sm text-slate-600">{contact.contact_number || 'No phone recorded'}</p><p className="mt-1 text-sm text-slate-600">{contact.email || 'No email recorded'}</p><p className="mt-1 text-sm text-slate-500">{contact.postal_address || 'No postal address recorded'}</p>{contact.notes && <p className="mt-2 text-xs text-slate-500">{contact.notes}</p>}</article>)}
            </div>}
          </div>
        </div>}

        {tab === 'Sacraments' && <div className="p-5 sm:p-7">
          {!sacraments ? <EmptyState title="No sacrament details" description="Baptism and confirmation information has not been recorded for this member." /> : <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-stone-200 p-5"><h2 className="font-semibold text-slate-900">Baptism</h2><InfoGrid items={[["Baptism Date", formatDate(sacraments.baptism_date)], ['Baptised By', sacraments.baptised_by]]} /></article>
            <article className="rounded-2xl border border-stone-200 p-5"><h2 className="font-semibold text-slate-900">Confirmation</h2><InfoGrid items={[["Confirmation Date", formatDate(sacraments.confirmation_date)], ['Local Congregation', sacraments.local_congregation], ['District', sacraments.district], ['Presbytery', sacraments.presbytery], ['Memory Verse', sacraments.memory_verse]]} /></article>
          </div>}
        </div>}

        {tab === 'Custom Fields' && <div className="space-y-5 p-5 sm:p-7">
          <div><h2 className="font-semibold text-slate-900">Additional Custom Information</h2><p className="mt-1 text-sm text-slate-500">Member-specific fields configured by church administrators.</p></div>
          {customFields.length === 0 ? <EmptyState title="No active custom fields" description="Active custom fields for members will appear here." /> : <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{customFields.map(renderCustomField)}</div>
            <div className="flex justify-end"><Button type="button" loading={savingCustomValues} onClick={() => void saveCustomValues()}>Save Custom Fields</Button></div>
          </>}
        </div>}

        {tab === 'Admin Notes' && role === 'admin' && <div className="space-y-4 p-5 sm:p-7">
          <div><h2 className="font-semibold text-slate-900">Administrative Notes</h2><p className="mt-1 text-sm text-slate-500">Private notes visible only to administrators.</p></div>
          <textarea rows={8} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} aria-label="Administrative notes" className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="Add private notes about this member..." />
          <div className="flex justify-end"><Button type="button" loading={savingNotes} onClick={() => void saveAdminNotes()}>Save Notes</Button></div>
        </div>}
      </section>
    </div>
  );
}
