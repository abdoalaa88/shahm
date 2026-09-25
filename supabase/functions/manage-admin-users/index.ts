import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const allowedOrigins = new Set([
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  'http://localhost:4173', 'http://localhost:4174', 'http://localhost:4175',
  'http://127.0.0.1:4173', 'http://127.0.0.1:4174', 'http://127.0.0.1:4175',
]);
const supervisorRoles = ['ops_admin', 'verification_admin', 'analytics_viewer'] as const;
type SupervisorRole = typeof supervisorRoles[number];
type Payload = {
  action?: 'invite' | 'set_active';
  first_name?: string;
  email?: string;
  phone_number?: string;
  role?: SupervisorRole;
  profile_id?: string;
  is_active?: boolean;
  reason?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  const originAllowed = !origin || allowedOrigins.has('*') || allowedOrigins.has(origin);
  const corsOrigin = originAllowed ? (allowedOrigins.has('*') ? '*' : (origin || '*')) : '';
  const headers = new Headers({
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });

  if (!corsOrigin) return respond(403, { error: 'Origin not allowed' });
  if (request.method === 'OPTIONS') return new Response('ok', { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return respond(500, { error: 'Function environment is incomplete' });

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return respond(401, { error: 'Authentication required' });
  const accessToken = authorization.slice('Bearer '.length).trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) return respond(401, { error: 'Invalid authentication token' });

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: actor, error: actorError } = await serviceClient.from('profiles')
    .select('id,role,is_active')
    .eq('auth_user_id', authData.user.id)
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .maybeSingle();
  if (actorError || !actor) return respond(403, { error: 'صلاحية المدير العام مطلوبة لتنفيذ هذا الإجراء.' });

  let payload: Payload;
  try { payload = await request.json(); } catch { return respond(400, { error: 'Request body must be valid JSON' }); }

  if (payload.action === 'invite') {
    const firstName = payload.first_name?.trim() ?? '';
    const email = payload.email?.trim().toLowerCase() ?? '';
    const phoneNumber = payload.phone_number?.trim() ?? '';
    const role = payload.role;
    if (firstName.length < 2 || firstName.length > 40) return respond(422, { error: 'الاسم يجب أن يكون من حرفين إلى 40 حرفًا.' });
    if (email.length > 254 || !emailPattern.test(email)) return respond(422, { error: 'أدخل بريدًا إلكترونيًا صحيحًا.' });
    if (phoneNumber.length < 7 || phoneNumber.length > 32) return respond(422, { error: 'أدخل رقم هاتف صحيحًا.' });
    if (!role || !supervisorRoles.includes(role)) return respond(422, { error: 'نوع صلاحية المشرف غير مسموح.' });

    const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName },
    });
    let targetUser = invited.user;
    let invitationSent = Boolean(targetUser);
    if (!targetUser && inviteError) {
      // Existing users cannot be invited a second time; let the super admin
      // attach an additional, separately-scoped profile to that identity.
      for (let page = 1; page <= 10 && !targetUser; page += 1) {
        const { data: userPage, error: listError } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) return respond(500, { error: 'تعذر التحقق من الحساب الموجود. حاول مرة أخرى.' });
        targetUser = userPage.users.find((user) => user.email?.toLowerCase() === email) ?? null;
        if (userPage.users.length < 1000) break;
      }
      invitationSent = false;
    }
    if (!targetUser) return respond(409, { error: inviteError?.message ?? 'تعذر إنشاء دعوة لهذا البريد.' });

    const { data: existingRole, error: existingRoleError } = await serviceClient.from('profiles')
      .select('id')
      .eq('auth_user_id', targetUser.id)
      .eq('role', role)
      .maybeSingle();
    if (existingRoleError) return respond(500, { error: 'تعذر التحقق من أدوار هذا الحساب.' });
    if (existingRole) return respond(409, { error: 'هذا الحساب يملك الصلاحية المطلوبة بالفعل.' });

    const { data: newProfile, error: profileError } = await serviceClient.from('profiles').insert({
      auth_user_id: targetUser.id,
      first_name: firstName,
      phone_number: phoneNumber,
      role,
      is_active: true,
      verification_status: 'unverified',
    }).select('id').single();

    if (profileError || !newProfile) {
      if (invitationSent) await serviceClient.auth.admin.deleteUser(targetUser.id);
      return respond(500, { error: invitationSent
        ? 'تعذر إكمال إنشاء حساب المشرف؛ ألغينا الدعوة غير المكتملة. تحقق من مخطط قاعدة البيانات ثم أعد المحاولة.'
        : 'تعذر إضافة دور المشرف إلى الحساب الموجود. تحقق من مخطط قاعدة البيانات ثم أعد المحاولة.' });
    }

    const { error: auditError } = await serviceClient.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'invite_admin',
      target_profile_id: newProfile.id,
      reason: `دعوة مشرف بدور ${role}`,
    });
    if (auditError) {
      await serviceClient.from('profiles').delete().eq('id', newProfile.id);
      if (invitationSent) await serviceClient.auth.admin.deleteUser(targetUser.id);
      console.error('admin invitation audit log failed', auditError);
      return respond(500, { error: 'تعذر توثيق الدعوة؛ لم نفعّل صلاحية المشرف.' });
    }
    return respond(200, { ok: true, profile_id: newProfile.id, invitation_sent: invitationSent });
  }

  if (payload.action === 'set_active') {
    const profileId = payload.profile_id ?? '';
    const reason = payload.reason?.trim() ?? '';
    if (!uuidPattern.test(profileId)) return respond(422, { error: 'معرّف المشرف غير صحيح.' });
    if (typeof payload.is_active !== 'boolean') return respond(422, { error: 'حالة المشرف غير صحيحة.' });
    if (reason.length < 5 || reason.length > 500) return respond(422, { error: 'اكتب سببًا من 5 إلى 500 حرف.' });

    const { data: target, error: targetError } = await serviceClient.from('profiles')
      .select('id,role,is_active')
      .eq('id', profileId)
      .maybeSingle();
    if (targetError || !target) return respond(404, { error: 'لم يتم العثور على حساب المشرف.' });
    if (!supervisorRoles.includes(target.role as SupervisorRole)) return respond(403, { error: 'لا يمكن تغيير حالة هذا الحساب من إدارة المشرفين.' });
    if (target.is_active === payload.is_active) return respond(409, { error: 'الحساب بالفعل على الحالة المطلوبة.' });

    const { error: updateError } = await serviceClient.from('profiles')
      .update({ is_active: payload.is_active })
      .eq('id', profileId);
    if (updateError) return respond(500, { error: 'تعذر تحديث حالة المشرف.' });

    const { error: auditError } = await serviceClient.from('audit_logs').insert({
      actor_id: actor.id,
      action: payload.is_active ? 'enable_admin' : 'disable_admin',
      target_profile_id: profileId,
      reason,
    });
    if (auditError) {
      await serviceClient.from('profiles').update({ is_active: target.is_active }).eq('id', profileId);
      return respond(500, { error: 'تعذر تسجيل الإجراء؛ أعدنا حساب المشرف لحالته السابقة.' });
    }
    return respond(200, { ok: true });
  }

  return respond(400, { error: 'Action not supported' });
});
