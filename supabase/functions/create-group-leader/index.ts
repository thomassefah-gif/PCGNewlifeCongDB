import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedGroups = new Set([
  'Children Service',
  'Junior Youth (JY)',
  "Young People's Guild (YPG)",
  'Young Adults Fellowship (YAF)',
  "Women's Fellowship",
  "Men's Fellowship",
]);

interface RequestBody {
  action?: string;
  userId?: string;
  fullName?: string;
  email?: string;
  password?: string;
  assignedGroup?: string;
  isActive?: boolean;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidGroup(value: unknown): value is string {
  return typeof value === 'string' && allowedGroups.has(value);
}

function isRecord(value: unknown): value is RequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Function configuration is incomplete.' }, 500);

  try {
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: authError } = await callerClient.auth.getUser(token);
    if (authError || !userData.user) return jsonResponse({ error: 'Invalid or expired authentication token.' }, 401);

    const { data: callerProfile, error: roleError } = await callerClient
      .from('profiles')
      .select('role,is_active')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (roleError) return jsonResponse({ error: 'Unable to verify administrator access.' }, 403);
    if (callerProfile?.role !== 'admin' || callerProfile.is_active !== true) {
      return jsonResponse({ error: 'Administrator access is required.' }, 403);
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) return jsonResponse({ error: 'Function configuration is incomplete.' }, 500);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const isGroupLeaderAccount = async (userId: string): Promise<boolean> => {
      const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
      if (error) throw new Error('Unable to verify the target account.');
      return data?.role === 'group_leader';
    };

    let body: RequestBody;
    try {
      const parsed: unknown = await request.json();
      if (!isRecord(parsed)) return jsonResponse({ error: 'Request body must be a JSON object.' }, 400);
      body = parsed;
    } catch {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    switch (body.action) {
      case 'create': {
        const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isValidGroup(body.assignedGroup)) {
          return jsonResponse({ error: 'Full name, valid email, and an assigned group are required.' }, 400);
        }
        if (typeof body.password !== 'string' || body.password.length < 8) {
          return jsonResponse({ error: 'Password must be at least 8 characters long.' }, 400);
        }

        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError || !created.user) {
          return jsonResponse({ error: 'Unable to create the group leader account.' }, 400);
        }

        const { error: profileError } = await adminClient.from('profiles').upsert({
          id: created.user.id,
          email,
          full_name: fullName,
          role: 'group_leader',
          assigned_group: body.assignedGroup,
          is_active: true,
        });
        if (profileError) {
          const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
          if (rollbackError) {
            console.error('Group leader account rollback failed.');
            return jsonResponse({ error: 'The profile could not be created, and the authentication account could not be rolled back.' }, 500);
          }
          return jsonResponse({ error: 'The profile could not be created; the authentication account was rolled back.' }, 500);
        }

        return jsonResponse({ success: true, userId: created.user.id });
      }
      case 'reset_password': {
        if (typeof body.userId !== 'string' || !body.userId.trim() || typeof body.password !== 'string' || body.password.length < 8) {
          return jsonResponse({ error: 'A user ID and password of at least 8 characters are required.' }, 400);
        }
        if (!await isGroupLeaderAccount(body.userId)) return jsonResponse({ error: 'Group leader account not found.' }, 404);
        const { error } = await adminClient.auth.admin.updateUserById(body.userId, { password: body.password });
        if (error) return jsonResponse({ error: 'Unable to reset the group leader password.' }, 400);
        return jsonResponse({ success: true });
      }
      case 'update_group': {
        if (typeof body.userId !== 'string' || !body.userId.trim() || !isValidGroup(body.assignedGroup)) {
          return jsonResponse({ error: 'A user ID and valid assigned group are required.' }, 400);
        }
        const { data, error } = await adminClient.from('profiles')
          .update({ assigned_group: body.assignedGroup })
          .eq('id', body.userId)
          .eq('role', 'group_leader')
          .select('id')
          .maybeSingle();
        if (error) return jsonResponse({ error: 'Unable to update the assigned group.' }, 400);
        if (!data) return jsonResponse({ error: 'Group leader account not found.' }, 404);
        return jsonResponse({ success: true });
      }
      case 'toggle_active': {
        if (typeof body.userId !== 'string' || !body.userId.trim() || typeof body.isActive !== 'boolean') {
          return jsonResponse({ error: 'A user ID and active status are required.' }, 400);
        }
        const { data, error } = await adminClient.from('profiles')
          .update({ is_active: body.isActive })
          .eq('id', body.userId)
          .eq('role', 'group_leader')
          .select('id')
          .maybeSingle();
        if (error) return jsonResponse({ error: 'Unable to update the group leader status.' }, 400);
        if (!data) return jsonResponse({ error: 'Group leader account not found.' }, 404);
        return jsonResponse({ success: true });
      }
      case 'delete': {
        if (typeof body.userId !== 'string' || !body.userId.trim()) return jsonResponse({ error: 'A user ID is required.' }, 400);
        if (body.userId === userData.user.id) return jsonResponse({ error: 'You cannot delete your own account.' }, 400);
        if (!await isGroupLeaderAccount(body.userId)) return jsonResponse({ error: 'Group leader account not found.' }, 404);
        const { error } = await adminClient.auth.admin.deleteUser(body.userId);
        if (error) return jsonResponse({ error: 'Unable to delete the group leader account.' }, 400);
        return jsonResponse({ success: true });
      }
      default:
        return jsonResponse({ error: 'Unsupported action.' }, 400);
    }
  } catch (error) {
    console.error('Group leader administration request failed.');
    return jsonResponse({ error: 'The group leader administration request failed.' }, 500);
  }
});
