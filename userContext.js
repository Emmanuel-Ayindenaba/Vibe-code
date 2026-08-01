// ==========================
// CURRENT USER CONTEXT
// ==========================
// Shared by side.js, app.js, and the profile/invoices/admin pages.
// Resolves to either a real Supabase profile, or a lightweight guest object.

async function getCurrentUserContext() {
  if (isGuest()) {
    return { id: 'guest', name: 'Guest', email: '', isGuest: true, isAdmin: false };
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('name, email, is_admin')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    name: (profile && profile.name) || user.email,
    email: (profile && profile.email) || user.email,
    isGuest: false,
    isAdmin: !!(profile && profile.is_admin)
  };
}
