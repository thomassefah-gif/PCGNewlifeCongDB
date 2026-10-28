import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, ImagePlus, Search, UserRound } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { supabase } from '../lib/supabaseClient';
import { getCustomFields, getMemberCustomFieldValues, upsertMemberCustomFieldValues, type CustomField } from '../lib/queries/customFields';
import { createMember, getAllGroups, getMemberById, searchMembers, updateMember } from '../lib/queries/members';
import { firstBool, firstText, getFamilyGroup, getMemberLandmark, getMemberPhotoUrl, getMembershipId, getMobilePhone, getOtherPhone, getPrimaryGenerationalGroup, getResidenceArea, getSacramentValue, type SacramentKey } from '../lib/memberFields';
import MemberAvatar from '../components/MemberAvatar';
import { syncToGoogleSheet } from '../lib/googleSheetSync';
import type { Group, Member, MemberFormInput, MemberProfile } from '../types/member';

const requiredChoice = <T extends string>(values: readonly T[], message: string) =>
  z.union([...(values.map((value) => z.literal(value))), z.literal('')]).refine((value) => value !== '', message);

const formSchema = z.object({
  spouse_name: z.string(),
  spouse_phone: z.string(),
  spouse_postal_address: z.string(),
  children_names: z.string(),
  children_contacts: z.string(),
  member_code: z.string(),
  title: z.string(),
  title_other: z.string(),
  surname: z.string().refine((value) => value.trim().length > 0, 'Surname is required.'),
  first_name: z.string().refine((value) => value.trim().length > 0, 'First name is required.'),
  maiden_name: z.string(),
  sex: requiredChoice(['Male', 'Female'] as const, 'Select sex.'),
  date_of_birth: z.string().min(1, 'Date of birth is required.'),
  date_of_birth_is_estimated: z.boolean(),
  communicant_status: z.union([z.literal('Communicant'), z.literal('Non-Communicant'), z.literal('')]),
  marital_status: z.union([z.literal('Married'), z.literal('Single'), z.literal('Divorced'), z.literal('Widow'), z.literal('Widower'), z.literal('Co-habiting'), z.literal('')]),
  marriage_type: z.string(),
  profession: z.string(),
  occupation: z.string(),
  special_interests: z.string(),
  home_town: z.string(),
  place_of_birth: z.string(),
  nationality: z.string(),
  residence_area: z.string(),
  residence_description: z.string(),
  house_number: z.string(),
  street_name: z.string(),
  postal_address: z.string(),
  mobile_phone: z.string(),
  residential_phone: z.string(),
  emergency_contact_name: z.string(),
  emergency_contact_phone: z.string(),
  photo_url: z.string(),
  email: z.string().email('Enter a valid email address.').or(z.literal('')),
  status: z.enum(['Active', 'Inactive']),
  is_distant_member: z.boolean(),
  date_joined_new_life: z.string(),
  date_joined_pcg: z.string(),
  date_joined_new_life_is_estimated: z.boolean(),
  date_joined_pcg_is_estimated: z.boolean(),
  primary_group_id: z.string(),
  primary_group_name: z.string(),
  family_group_id: z.string(),
  interest_group_ids: z.array(z.string()),
  parent_member_id: z.string(),
  parent_relationship_type: z.union([z.literal('parent'), z.literal('guardian')]),
  baptism_date: z.string(),
  baptised_by: z.string(),
  confirmation_date: z.string(),
  local_congregation: z.string(),
  district: z.string(),
  presbytery: z.string(),
  memory_verse: z.string(),
});

type ParentOption = Pick<Member, 'id' | 'title' | 'first_name' | 'surname' | 'email' | 'mobile_phone'>;

const defaults: MemberFormInput = {
  spouse_name: '', spouse_phone: '', spouse_postal_address: '', children_names: '', children_contacts: '',
  member_code: '',
  title: '', title_other: '', surname: '', first_name: '', maiden_name: '', sex: '', date_of_birth: '',
  date_of_birth_is_estimated: false, communicant_status: '', marital_status: '', marriage_type: '',
  profession: '', occupation: '', special_interests: '', home_town: '', place_of_birth: '', nationality: '',
  residence_area: '', residence_description: '', house_number: '', street_name: '', postal_address: '',
  mobile_phone: '', residential_phone: '', emergency_contact_name: '', emergency_contact_phone: '', photo_url: '', email: '', status: 'Active', is_distant_member: false,
  date_joined_new_life: '', date_joined_pcg: '',
  date_joined_new_life_is_estimated: false, date_joined_pcg_is_estimated: false,
  primary_group_id: '', primary_group_name: '', family_group_id: '', interest_group_ids: [],
  parent_member_id: '', parent_relationship_type: 'parent', baptism_date: '', baptised_by: '', confirmation_date: '', local_congregation: '',
  district: '', presbytery: '', memory_verse: '',
};

function text(value: string | null | undefined): string {
  return value ?? '';
}

function profileToForm(member: MemberProfile): MemberFormInput {
  const activeGroups = member.member_groups.filter((membership) => membership.membership_status === 'Active');
  const primaryMembership = activeGroups.find((membership) => membership.is_primary && membership.groups?.group_type === 'generational');
  const familyMembership = activeGroups.find((membership) => membership.groups?.group_type === 'family');
  const sacraments = member.member_sacraments;
  const parent = member.member_relationships.find((relationship) => relationship.direction === 'outgoing' && ['parent', 'guardian'].includes(relationship.relationship_type));
  const spouse = member.member_family_contacts.find((contact) => contact.relationship_type === 'spouse');
  const t = (...keys: string[]) => firstText(member, keys);
  const sv = (key: SacramentKey) => getSacramentValue(member, sacraments as unknown as Record<string, unknown> | null, key);
  const sex = t('sex', 'gender', 'Sex', 'Gender');
  const normalizedSex = /^m/i.test(sex) ? 'Male' : /^f/i.test(sex) ? 'Female' : '';
  const status = t('status', 'member_status');
  const dobEstimated = firstBool(member, ['date_of_birth_is_estimated', 'is_dob_estimated', 'dob_estimated', 'date_of_birth_estimated']);
  const newLifeEstimated = firstBool(member, ['date_joined_new_life_is_estimated', 'is_joined_new_life_estimated', 'date_joined_current_is_estimated', 'date_joined_estimated']);
  const pcgEstimated = firstBool(member, ['date_joined_pcg_is_estimated', 'is_joined_pcg_estimated']);

  return {
    ...defaults,
    spouse_name: t('spouse_name', 'spouse_full_name', 'Spouse Name') || spouse?.full_name || '',
    spouse_phone: t('spouse_contact', 'spouse_phone', 'Spouse Contact') || spouse?.contact_number || '',
    spouse_postal_address: text(member.spouse_postal_address ?? spouse?.postal_address),
    children_names: t('children_names', 'Children Names'), children_contacts: t('children_contacts', 'Children Contacts'),
    member_code: getMembershipId(member), title_other: text(member.title_other), surname: t('surname', 'last_name'),
    first_name: t('first_name', 'First Name'), maiden_name: t('maiden_name', 'Maiden Name'), sex: normalizedSex,
    date_of_birth: text(member.date_of_birth), date_of_birth_is_estimated: dobEstimated ?? false,
    communicant_status: member.communicant_status ?? (firstBool(member, ['is_communicant']) === undefined ? '' : firstBool(member, ['is_communicant']) ? 'Communicant' : 'Non-Communicant'), marital_status: member.marital_status ?? '',
    marriage_type: t('marriage_type', 'Marriage Type') === 'Ordinance' ? 'Church Ordinance' : t('marriage_type', 'Marriage Type'),
    profession: t('profession', 'Profession'), occupation: t('occupation', 'Occupation'),
    special_interests: text(member.special_interests), home_town: t('home_town', 'hometown'),
    place_of_birth: t('place_of_birth', 'Place of Birth'), nationality: t('nationality', 'Nationality'),
    residence_area: getResidenceArea(member), residence_description: getMemberLandmark(member),
    house_number: t('house_number', 'House Number'), street_name: t('street_name', 'Street Name'), postal_address: t('postal_address', 'address', 'Postal Address'),
    mobile_phone: getMobilePhone(member),
    residential_phone: getOtherPhone(member),
    emergency_contact_name: t('emergency_contact_name', 'emergency_name', 'Emergency Contact Name'), emergency_contact_phone: t('emergency_contact_phone', 'emergency_phone', 'Emergency Contact Phone'), email: t('email', 'Email'),
    photo_url: getMemberPhotoUrl(member),
    status: status === 'Inactive' ? 'Inactive' : member.status ?? 'Active', is_distant_member: member.is_distant_member ?? /distant/i.test(t('location_status')),
    date_joined_new_life: t('date_joined_new_life', 'date_joined_current_congregation', 'date_joined'),
    date_joined_pcg: text(member.date_joined_pcg),
    date_joined_new_life_is_estimated: newLifeEstimated ?? false,
    date_joined_pcg_is_estimated: pcgEstimated ?? false,
    primary_group_id: primaryMembership?.group_id ?? '',
    primary_group_name: primaryMembership?.groups?.name ?? getPrimaryGenerationalGroup(member),
    family_group_id: familyMembership?.group_id ?? '',
    interest_group_ids: activeGroups.filter((membership) => membership.groups?.group_type === 'interest').map((membership) => membership.group_id),
    parent_member_id: parent?.related_member_id ?? '',
    parent_relationship_type: parent?.relationship_type === 'guardian' ? 'guardian' : 'parent',
    baptism_date: sv('baptism_date'), baptised_by: sv('baptised_by'),
    confirmation_date: sv('confirmation_date'), local_congregation: sv('local_congregation'),
    district: sv('district'), presbytery: sv('presbytery'), memory_verse: sv('memory_verse'),
  };
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required && <span className="ml-1 text-danger">*</span>}</label>
      {children}
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

const inputClass = 'h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10';
const selectClass = `${inputClass} appearance-none`;

export default function MemberFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null);
  const [parentResults, setParentResults] = useState<ParentOption[]>([]);
  const [searchingParents, setSearchingParents] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const photoInputRef = useRef<HTMLInputElement>(null);
  const originalMemberRef = useRef<MemberProfile | null>(null);

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<MemberFormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });
  const primaryGroupId = useWatch({ control, name: 'primary_group_id' });
  const maritalStatus = useWatch({ control, name: 'marital_status' });
  const sex = useWatch({ control, name: 'sex' });
  const photoUrl = useWatch({ control, name: 'photo_url' });
  const primaryGroup = useMemo(() => groups.find((group) => group.id === primaryGroupId), [groups, primaryGroupId]);
  const isYouth = ['Children Service', 'Junior Youth (JY)'].includes(primaryGroup?.name ?? '');
  const isMarried = maritalStatus === 'Married' && !isYouth;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const loadFormData = async () => {
      try {
        const [availableGroups, allCustomFields, member] = await Promise.all([
          getAllGroups(),
          getCustomFields(),
          id ? getMemberById(id) : Promise.resolve(null),
        ]);
        if (!mounted) return;
        setGroups(availableGroups);
        const memberFields = allCustomFields.filter((field) => field.is_active && field.applies_to.toLowerCase() === 'member');
        setCustomFields(memberFields);
        if (member) {
          originalMemberRef.current = member;
          const formValues = profileToForm(member);
          // Sheet-imported members only have group names as text, so match them to real groups.
          const byName = (type: Group['group_type'], name: string) => name
            ? availableGroups.find((group) => group.group_type === type && group.name.trim().toLowerCase() === name.trim().toLowerCase())
            : undefined;
          if (!formValues.primary_group_id) {
            const match = byName('generational', getPrimaryGenerationalGroup(member));
            if (match) { formValues.primary_group_id = match.id; formValues.primary_group_name = match.name; }
          }
          if (!formValues.family_group_id) {
            const match = byName('family', getFamilyGroup(member));
            if (match) formValues.family_group_id = match.id;
          }
          if (formValues.interest_group_ids.length === 0) {
            const names = firstText(member, ['interest_groups']).split(/[,;]/).map((name) => name.trim().toLowerCase()).filter(Boolean);
            formValues.interest_group_ids = availableGroups.filter((group) => group.group_type === 'interest' && names.includes(group.name.trim().toLowerCase())).map((group) => group.id);
          }
          reset(formValues);
          const savedValues = await getMemberCustomFieldValues(member.id);
          if (!mounted) return;
          setCustomValues(Object.fromEntries(savedValues.flatMap((saved) => saved.custom_fields?.field_key ? [[saved.custom_fields.field_key, saved.value]] : [])));
          const linkedParent = member.member_relationships.find((relationship) => relationship.direction === 'outgoing' && ['parent', 'guardian'].includes(relationship.relationship_type))?.related_member;
          if (linkedParent) {
            setSelectedParent(linkedParent);
            setParentSearch([linkedParent.title, linkedParent.first_name, linkedParent.surname].filter(Boolean).join(' '));
          }
        }
      } catch (error) {
        console.error(error);
        if (mounted) {
          showToast(error instanceof Error ? error.message : String(error), 'error');
          if (id) navigate('/contacts', { replace: true });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadFormData();
    return () => { mounted = false; };
  }, [id, navigate, reset, showToast]);

  useEffect(() => {
    const term = parentSearch.trim();
    if (selectedParent && [selectedParent.title, selectedParent.first_name, selectedParent.surname].filter(Boolean).join(' ') === term) return;
    if (term.length < 2) {
      setParentResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearchingParents(true);
      void searchMembers(term)
        .then((matches) => setParentResults(matches.filter((match) => match.id !== id)))
        .catch((error: unknown) => {
          console.error(error);
          showToast(error instanceof Error ? error.message : String(error), 'error');
        })
        .finally(() => setSearchingParents(false));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [id, parentSearch, selectedParent, showToast]);

  const changePrimaryGroup = (value: string) => {
    const group = groups.find((item) => item.id === value);
    setValue('primary_group_id', value, { shouldDirty: true, shouldValidate: true });
    setValue('primary_group_name', group?.name ?? '');
    if (['Children Service', 'Junior Youth (JY)'].includes(group?.name ?? '')) {
      setValue('marital_status', '');
      setValue('marriage_type', '');
      setValue('profession', '');
      setValue('occupation', '');
      setValue('spouse_name', '');
      setValue('spouse_phone', '');
      setValue('spouse_postal_address', '');
      setValue('children_names', '');
      setValue('children_contacts', '');
    }
  };

  const submit = async (values: MemberFormInput) => {
    if (uploadingPhoto) return;
    const missingRequired = customFields.find((field) => field.is_required && (
      customValues[field.field_key] === undefined || customValues[field.field_key] === null ||
      (typeof customValues[field.field_key] === 'string' && !String(customValues[field.field_key]).trim()) ||
      (field.field_type.toLowerCase() === 'boolean' && customValues[field.field_key] !== true)
    ));
    if (missingRequired) {
      showToast(`${missingRequired.label} is required.`, 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...values, primary_group_name: primaryGroup?.name ?? '' };
      const memberId = isEditing && id ? (await updateMember(id, payload), id) : await createMember(payload);
      void syncToGoogleSheet(isEditing ? 'update' : 'create', {
        ...payload,
        id: memberId,
        last_name: payload.surname,
        phone_number: payload.mobile_phone,
        other_phone_number: payload.residential_phone,
        area_description: payload.residence_description,
        landmark: payload.residence_description,
        membership_id: payload.member_code,
      }, originalMemberRef.current);
      try {
        await upsertMemberCustomFieldValues(memberId, Object.fromEntries(customFields.map((field) => [field.field_key, customValues[field.field_key] ?? (field.field_type.toLowerCase() === 'boolean' ? false : '')])));
      } catch (customFieldError) {
        console.error(customFieldError);
        showToast(customFieldError instanceof Error ? customFieldError.message : String(customFieldError), 'error');
      }
      showToast('Member saved successfully', 'success');
      navigate('/contacts');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image file for the member photo.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Member photos must be 5 MB or smaller.', 'error');
      return;
    }
    setUploadingPhoto(true);
    try {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
      const storagePath = `${id ?? crypto.randomUUID()}/${Date.now()}-${safeName}`;
      const { data, error } = await supabase.storage.from('member_photos').upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data: publicData } = supabase.storage.from('member_photos').getPublicUrl(data.path);
      setValue('photo_url', publicData.publicUrl, { shouldDirty: true, shouldValidate: true });
      showToast('Member photo uploaded.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  if (loading) {
    return <div className="animate-pulse rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">Loading member details...</div>;
  }

  const primaryGroups = groups.filter((group) => group.group_type === 'generational' && group.name.trim().toLowerCase() !== 'no group membership');
  const familyGroups = groups.filter((group) => group.group_type === 'family' && !['no family group', 'no group membership'].includes(group.name.trim().toLowerCase()));
  const interestGroups = groups.filter((group) => group.group_type === 'interest');
  const emailError = errors.email?.message;

  const setCustomValue = (fieldKey: string, value: unknown) => {
    setCustomValues((current) => ({ ...current, [fieldKey]: value }));
  };

  const renderCustomField = (field: CustomField) => {
    const type = field.field_type.toLowerCase();
    const value = customValues[field.field_key];
    const inputType = type === 'email' ? 'email' : type === 'phone' ? 'tel' : type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
    if (type === 'boolean') return <label key={field.id} className="flex min-h-10 items-center gap-2.5 text-sm text-slate-700"><input type="checkbox" checked={Boolean(value)} onChange={(event) => setCustomValue(field.field_key, event.target.checked)} className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" />{field.label}{field.is_required && <span className="text-danger">*</span>}</label>;
    if (type === 'select') return <Field key={field.id} label={field.label} required={field.is_required}><select value={String(value ?? '')} onChange={(event) => setCustomValue(field.field_key, event.target.value)} className={selectClass}><option value="">Select an option</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>;
    if (type === 'textarea') return <Field key={field.id} label={field.label} required={field.is_required}><textarea rows={3} value={String(value ?? '')} onChange={(event) => setCustomValue(field.field_key, event.target.value)} className={`${inputClass} h-auto py-2.5`} /></Field>;
    return <Field key={field.id} label={field.label} required={field.is_required}><input type={inputType} value={String(value ?? '')} onChange={(event) => setCustomValue(field.field_key, type === 'number' ? event.target.value === '' ? '' : Number(event.target.value) : event.target.value)} className={inputClass} /></Field>;
  };

  return (
    <form className="mx-auto max-w-5xl space-y-6" onSubmit={handleSubmit(submit)} noValidate>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <button type="button" onClick={() => navigate('/contacts')} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary">
            <ArrowLeft aria-hidden="true" size={16} /> Back to contacts
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Member record</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{isEditing ? 'Edit Member' : 'Add Member'}</h1>
          <p className="mt-1 text-sm text-slate-500">Fields marked with <span className="text-danger">*</span> are required.</p>
        </div>
        <Button type="submit" loading={saving} icon={!saving ? <Check aria-hidden="true" size={17} /> : undefined}>
          {isEditing ? 'Save Changes' : 'Save Member'}
        </Button>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <MemberAvatar url={photoUrl} alt="Member profile" className="h-20 w-20 rounded-2xl" fallback={<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ImagePlus aria-hidden="true" size={28} /></div>} />
        <div className="flex-1"><h2 className="font-semibold text-slate-900">Member Photo</h2><p className="mt-1 text-sm text-slate-500">Upload a profile picture (JPG, PNG, or other image, up to 5 MB).</p>{uploadingPhoto && <p className="mt-1 text-xs font-medium text-primary">Uploading photo...</p>}</div>
        <div className="flex gap-2"><input ref={photoInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => void uploadPhoto(event.target.files?.[0])} /><Button type="button" variant="outline" loading={uploadingPhoto} icon={<ImagePlus aria-hidden="true" size={16} />} onClick={() => photoInputRef.current?.click()}>Upload Photo</Button>{photoUrl && <Button type="button" variant="ghost" disabled={uploadingPhoto} onClick={() => setValue('photo_url', '', { shouldDirty: true })}>Remove</Button>}</div>
        <input type="hidden" {...register('photo_url')} />
      </section>

      <section className="rounded-2xl border border-primary/20 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Primary Generational Group</h2>
          <p className="mt-1 text-sm text-slate-500">This selection controls which member details are shown.</p>
        </div>
        <Field label="Primary generational group">
          <select className={selectClass} value={primaryGroupId ?? ''} onChange={(event) => changePrimaryGroup(event.target.value)}>
            <option value="">No Group Membership</option>
            {primaryGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
      </section>

      <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div><h2 className="font-semibold text-slate-900">Personal Information</h2><p className="mt-1 text-sm text-slate-500">Basic identity and church membership details.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Membership ID"><input className={inputClass} {...register('member_code')} /></Field>
          <Field label="Title"><input className={inputClass} placeholder="e.g. Mr, Mrs, Rev" {...register('title')} /></Field>
          {watch('title') === 'Other' && <Field label="Other title"><input className={inputClass} {...register('title_other')} /></Field>}
          <Field label="First Name" required error={errors.first_name?.message}><input className={inputClass} autoComplete="given-name" {...register('first_name')} /></Field>
          <Field label="Surname" required error={errors.surname?.message}><input className={inputClass} autoComplete="family-name" {...register('surname')} /></Field>
          <Field label="Sex" required error={errors.sex?.message}>
            <select className={selectClass} {...register('sex')}><option value="">Select sex</option><option value="Male">Male</option><option value="Female">Female</option></select>
          </Field>
          <Field label="Date of Birth" required error={errors.date_of_birth?.message}>
            <input type="date" className={inputClass} {...register('date_of_birth')} />
          </Field>
          <label className="flex min-h-10 items-center gap-2.5 self-end pb-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" {...register('date_of_birth_is_estimated')} /> Date is estimated</label>
          <Field label="Communicant Status">
            <select className={selectClass} {...register('communicant_status')}><option value="">Select status</option><option value="Communicant">Communicant</option><option value="Non-Communicant">Non-Communicant</option></select>
          </Field>
        </div>
        <div className="border-t border-stone-100 pt-5">
          <div className="mb-4"><h3 className="text-sm font-semibold text-slate-900">Emergency Contact</h3><p className="mt-1 text-xs text-slate-500">A person to contact in case of an emergency.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emergency Contact Name"><input className={inputClass} autoComplete="off" {...register('emergency_contact_name')} /></Field>
            <Field label="Emergency Contact Phone"><input className={inputClass} inputMode="tel" autoComplete="off" {...register('emergency_contact_phone')} /></Field>
          </div>
        </div>
      </section>

      {isYouth ? (
        <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div><h2 className="font-semibold text-slate-900">Child / Youth Information</h2><p className="mt-1 text-sm text-slate-500">Interests and parent or guardian details.</p></div>
          <Field label="Special Interests"><textarea rows={3} className={`${inputClass} h-auto py-2.5`} {...register('special_interests')} /></Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_190px]">
            <Field label="Parent / Guardian member">
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input value={parentSearch} onChange={(event) => { setParentSearch(event.target.value); setSelectedParent(null); setValue('parent_member_id', ''); }} className={`${inputClass} pl-9`} placeholder="Search name or phone (2+ characters)" />
              </div>
              {searchingParents && <p className="mt-1 text-xs text-slate-500">Searching members...</p>}
              {parentResults.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-sm">
                {parentResults.map((person) => <button key={person.id} type="button" onClick={() => { setSelectedParent(person); setParentSearch([person.title, person.first_name, person.surname].filter(Boolean).join(' ')); setValue('parent_member_id', person.id); setParentResults([]); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound aria-hidden="true" size={16} /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{[person.title, person.first_name, person.surname].filter(Boolean).join(' ')}</span><span className="block truncate text-xs text-slate-500">{person.mobile_phone || person.email || 'Member'}</span></span>
                </button>)}
              </div>}
              {selectedParent && <p className="mt-1 text-xs text-success">Selected as linked member.</p>}
            </Field>
            <Field label="Relationship type">
              <select className={selectClass} {...register('parent_relationship_type')}><option value="parent">Parent</option><option value="guardian">Guardian</option></select>
            </Field>
          </div>
        </section>
      ) : (
        <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div><h2 className="font-semibold text-slate-900">Adult Information</h2><p className="mt-1 text-sm text-slate-500">Marital status, vocation, and spouse contact details.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Marital Status">
              <select className={selectClass} {...register('marital_status')} onChange={(event) => {
                setValue('marital_status', event.target.value as MemberFormInput['marital_status'], { shouldDirty: true });
                if (event.target.value !== 'Married') {
                  setValue('marriage_type', ''); setValue('spouse_name', ''); setValue('spouse_phone', ''); setValue('spouse_postal_address', '');
                }
              }}>
                <option value="">Select marital status</option><option>Married</option><option>Single</option><option>Divorced</option><option>Widow</option><option>Widower</option><option>Co-habiting</option>
              </select>
            </Field>
            {sex === 'Female' && isMarried && <Field label="Maiden Name"><input className={inputClass} {...register('maiden_name')} /></Field>}
            {isMarried && <Field label="Marriage Type"><select className={selectClass} {...register('marriage_type')}><option value="">Select type</option><option>Customary</option><option>Church Ordinance</option><option>Civil Registry</option></select></Field>}
            <Field label="Profession"><input className={inputClass} {...register('profession')} /></Field>
            <Field label="Occupation"><input className={inputClass} {...register('occupation')} /></Field>
            {isMarried && <>
              <Field label="Spouse Name"><input className={inputClass} {...register('spouse_name')} /></Field>
              <Field label="Spouse Contact Phone"><input className={inputClass} inputMode="tel" {...register('spouse_phone')} /></Field>
              <Field label="Spouse Postal Address"><input className={inputClass} {...register('spouse_postal_address')} /></Field>
            </>}
            <Field label="Children Names"><textarea rows={3} className={`${inputClass} h-auto py-2.5`} placeholder="e.g. Samuel Doe, Kwame Doe" {...register('children_names')} /></Field>
            <Field label="Children Contacts"><textarea rows={3} className={`${inputClass} h-auto py-2.5`} placeholder="e.g. 0244123456, 0551234567" {...register('children_contacts')} /></Field>
          </div>
        </section>
      )}

      <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div><h2 className="font-semibold text-slate-900">Origin &amp; Residence</h2><p className="mt-1 text-sm text-slate-500">Home town, residential address, and contact details.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Home Town"><input className={inputClass} {...register('home_town')} /></Field>
          <Field label="Place of Birth"><input className={inputClass} {...register('place_of_birth')} /></Field>
          <Field label="Nationality"><input className={inputClass} {...register('nationality')} /></Field>
          <Field label="Residence Area"><input className={inputClass} {...register('residence_area')} /></Field>
          <Field label="Landmark or Nearby Location"><input className={inputClass} placeholder="e.g., Near Shell Fuel Station" {...register('residence_description')} /></Field>
          <Field label="House Number"><input className={inputClass} {...register('house_number')} /></Field>
          <Field label="Street Name"><input className={inputClass} {...register('street_name')} /></Field>
          <Field label="Postal Address"><input className={inputClass} {...register('postal_address')} /></Field>
          <Field label="Mobile Phone"><input className={inputClass} inputMode="tel" autoComplete="tel" {...register('mobile_phone')} /></Field>
          <Field label="Other Phone"><input className={inputClass} inputMode="tel" placeholder="e.g. 0240000000 (Optional secondary phone)" {...register('residential_phone')} /></Field>
          <Field label="Email" error={emailError}><input type="email" className={inputClass} autoComplete="email" {...register('email')} /></Field>
          <Field label="Member Status"><select className={selectClass} {...register('status')}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" {...register('is_distant_member')} /> Is Distant Member?</label>
      </section>

      <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div><h2 className="font-semibold text-slate-900">Church Membership &amp; Groups</h2><p className="mt-1 text-sm text-slate-500">Congregation joining dates and additional group memberships.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date Joined New Life Congregation"><input type="date" className={inputClass} {...register('date_joined_new_life')} /></Field>
          <label className="flex min-h-10 items-center gap-2.5 self-end pb-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" {...register('date_joined_new_life_is_estimated')} /> Date is estimated</label>
          <Field label="Date Joined PCG"><input type="date" className={inputClass} {...register('date_joined_pcg')} /></Field>
          <label className="flex min-h-10 items-center gap-2.5 self-end pb-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" {...register('date_joined_pcg_is_estimated')} /> Date is estimated</label>
          <Field label="Family Group"><select className={selectClass} {...register('family_group_id')}><option value="">No family group</option>{familyGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
        </div>
        {interestGroups.length > 0 && <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Interest Groups</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {interestGroups.map((group) => <label key={group.id} className="flex items-center gap-2.5 rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-accent/60"><input type="checkbox" value={group.id} className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary" {...register('interest_group_ids')} />{group.name}</label>)}
          </div>
        </fieldset>}
      </section>

      <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div><h2 className="font-semibold text-slate-900">Sacraments &amp; Church History <span className="font-normal text-slate-400">(Optional)</span></h2><p className="mt-1 text-sm text-slate-500">Baptism and confirmation records.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Baptism Date"><input type="date" className={inputClass} {...register('baptism_date')} /></Field>
          <Field label="Baptised By"><input className={inputClass} {...register('baptised_by')} /></Field>
          <Field label="Confirmation Date"><input type="date" className={inputClass} {...register('confirmation_date')} /></Field>
          <Field label="Local Congregation"><input className={inputClass} {...register('local_congregation')} /></Field>
          <Field label="District"><input className={inputClass} {...register('district')} /></Field>
          <Field label="Presbytery"><input className={inputClass} {...register('presbytery')} /></Field>
          <Field label="Memory Verse"><textarea rows={2} className={`${inputClass} h-auto py-2.5`} {...register('memory_verse')} /></Field>
        </div>
      </section>

      {customFields.length > 0 && <section className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div><h2 className="font-semibold text-slate-900">Additional Custom Information</h2><p className="mt-1 text-sm text-slate-500">Congregation-specific information for this member.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{customFields.map(renderCustomField)}</div>
      </section>}

      <div className="flex flex-col-reverse justify-end gap-3 pb-4 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => navigate('/contacts')}>Cancel</Button>
        <Button type="submit" loading={saving} icon={!saving ? <Check aria-hidden="true" size={17} /> : undefined}>{isEditing ? 'Save Changes' : 'Save Member'}</Button>
      </div>
    </form>
  );
}
