export type MemberStatus = 'Active' | 'Inactive';
export type Sex = 'Male' | 'Female';
export type GroupType = 'generational' | 'interest' | 'family' | 'custom';
export type CommunicantStatus = 'Communicant' | 'Non-Communicant';
export type MaritalStatus = 'Married' | 'Single' | 'Divorced' | 'Widow' | 'Widower' | 'Co-habiting';
export type MarriageType = 'Customary' | 'Church Ordinance' | 'Civil Registry';

export interface Member {
  id: string;
  spouse_name?: string | null;
  spouse_phone?: string | null;
  children_names?: string | null;
  children_contacts?: string | null;
  groups?: string[];
  member_code: string | null;
  title: string | null;
  title_other: string | null;
  surname: string | null;
  first_name: string | null;
  maiden_name?: string | null;
  sex: Sex | null;
  date_of_birth: string | null;
  date_of_birth_is_estimated: boolean;
  communicant_status: CommunicantStatus | null;
  marital_status: MaritalStatus | null;
  marriage_type?: string | null;
  spouse_postal_address?: string | null;
  profession: string | null;
  occupation: string | null;
  special_interests: string | null;
  home_town: string | null;
  place_of_birth: string | null;
  nationality: string | null;
  residence_area: string | null;
  residence_description: string | null;
  house_number: string | null;
  street_name: string | null;
  postal_address: string | null;
  residential_phone: string | null;
  mobile_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_url: string | null;
  admin_notes: string | null;
  email: string | null;
  status: MemberStatus;
  is_distant_member: boolean;
  date_joined_new_life: string | null;
  date_joined_pcg: string | null;
  date_joined_new_life_is_estimated: boolean;
  date_joined_pcg_is_estimated: boolean;
  created_at: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface Group {
  id: string;
  name: string;
  group_type: GroupType;
  description?: string | null;
  is_active?: boolean;
  member_count?: number;
}

export interface MemberGroup {
  id: string;
  member_id: string;
  group_id: string;
  membership_status: 'Active' | 'Inactive';
  is_primary: boolean;
  joined_at: string | null;
  groups: Group | null;
}

export interface MemberSacraments {
  id: string;
  member_id: string;
  baptism_date: string | null;
  baptised_by: string | null;
  confirmation_date: string | null;
  local_congregation: string | null;
  district: string | null;
  presbytery: string | null;
  memory_verse: string | null;
}

export type FamilyRelationshipType = 'spouse' | 'next_of_kin' | 'father' | 'mother' | 'guardian' | 'other';

export interface MemberFamilyContact {
  id: string;
  member_id: string;
  relationship_type: FamilyRelationshipType;
  full_name: string;
  postal_address: string | null;
  contact_number: string | null;
  email: string | null;
  notes: string | null;
}

export interface MemberRelationship {
  id: string;
  member_id: string;
  related_member_id: string;
  relationship_type: 'parent' | 'child' | 'guardian' | 'ward' | 'spouse' | 'sibling';
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  direction: 'outgoing' | 'incoming';
  related_member: Pick<Member, 'id' | 'title' | 'first_name' | 'surname' | 'email' | 'mobile_phone'> | null;
}

export interface MemberProfile extends Member {
  member_groups: MemberGroup[];
  area_description?: string;
  generational_group?: string;
  family_group?: string;
  member_sacraments: MemberSacraments | null;
  member_relationships: MemberRelationship[];
  member_family_contacts: MemberFamilyContact[];
  sacraments?: MemberSacraments | null;
  relationships?: MemberRelationship[];
  family_contacts?: MemberFamilyContact[];
  custom_field_values?: Array<{ id: string; member_id: string; field_id: string; value: unknown; custom_fields: unknown }>;
}

/** Form values, including group selectors and details that map to related tables. */
export interface MemberFormInput {
  spouse_name: string;
  spouse_phone: string;
  spouse_postal_address: string;
  children_names: string;
  children_contacts: string;
  member_code: string;
  title: string;
  title_other: string;
  surname: string;
  first_name: string;
  maiden_name: string;
  sex: Sex | '';
  date_of_birth: string;
  date_of_birth_is_estimated: boolean;
  communicant_status: CommunicantStatus | '';
  marital_status: MaritalStatus | '';
  marriage_type: string;
  profession: string;
  occupation: string;
  special_interests: string;
  home_town: string;
  place_of_birth: string;
  nationality: string;
  residence_area: string;
  residence_description: string;
  house_number: string;
  street_name: string;
  postal_address: string;
  mobile_phone: string;
  residential_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  photo_url: string;
  email: string;
  status: MemberStatus;
  is_distant_member: boolean;
  date_joined_new_life: string;
  date_joined_pcg: string;
  date_joined_new_life_is_estimated: boolean;
  date_joined_pcg_is_estimated: boolean;
  primary_group_id: string;
  primary_group_name: string;
  family_group_id: string;
  interest_group_ids: string[];
  parent_member_id: string;
  parent_relationship_type: 'parent' | 'guardian';
  baptism_date: string;
  baptised_by: string;
  confirmation_date: string;
  local_congregation: string;
  district: string;
  presbytery: string;
  memory_verse: string;
}

export type MemberStatusFilter = MemberStatus | 'ALL';
export type DistantFilter = 'DISTANT' | 'NON_DISTANT' | 'ALL';

export interface MemberFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: MemberStatusFilter;
  distant?: DistantFilter;
  groupId?: string;
}
