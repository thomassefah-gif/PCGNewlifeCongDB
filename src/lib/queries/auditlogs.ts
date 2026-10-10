import { supabase } from "../supabaseClient";

export interface AuditEventParams {
  action: "create" | "update" | "delete" | "import" | "export" | "login" | "logout";
  entity_type: string;
  entity_id?: string;
  entity_label?: string;
  changes?: Record<string, any> | null;
}

export interface AuditLogItem {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  changes: Record<string, any> | null;
  created_at: string;
  profiles?: {
    email: string;
    full_name: string | null;
  } | null;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    const { error } = await supabase.from("audit_logs").insert({
      user_id: user?.id || null,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id || null,
      entity_label: params.entity_label || null,
      changes: params.changes || null,
    });

    if (error) {
      console.warn("Audit log insert warning:", error.message);
    }
  } catch (err) {
    console.warn("Failed to log audit event:", err);
  }
}

export async function getAuditLogs(filters?: {
  search?: string;
  action?: string;
  entity_type?: string;
}): Promise<any[]> {
  let query = supabase
    .from("audit_logs")
    .select("*, profiles:user_id(email, full_name)")
    .order("created_at", { ascending: false });

  if (filters?.action && filters.action !== "ALL") {
    query = query.eq("action", filters.action);
  }

  if (filters?.entity_type && filters.entity_type !== "ALL") {
    query = query.eq("entity_type", filters.entity_type);
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    query = query.or(`entity_label.ilike.${term},action.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as any[]) || [];
}