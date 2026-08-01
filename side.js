// --- user account card (name, ID, and menu) ---
document.addEventListener('DOMContentLoaded', async () => {
  const card = document.getElementById('userCard');
  const toggle = document.getElementById('userCardToggle');
  const menu = document.getElementById('userMenu');

  if (!card || !toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isHidden = menu.hidden;
    menu.hidden = !isHidden;
    card.classList.toggle('open', isHidden);
  });

  document.addEventListener('click', (e) => {
    if (!card.contains(e.target)) {
      menu.hidden = true;
      card.classList.remove('open');
    }
  });

  const user = await loadUserInfo();

  const navItems = {
    editProfileBtn: 'profile.html',
    savedInvoicesBtn: 'invoices.html',
    aboutBtn: 'about.html',
    helpBtn: 'help.html',
    adminBtn: 'admin.html'
  };

  Object.entries(navItems).forEach(([id, href]) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => { window.location.href = href; };
  });

  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) adminBtn.hidden = !(user && user.isAdmin);
});

async function loadUserInfo() {
  const user = await getCurrentUserContext();
  if (!user) return null;

  document.getElementById('userName').textContent = user.name;
  document.getElementById('userIndex').textContent = user.isGuest ? 'Guest session' : `ID: ${user.id.slice(0, 8)}…`;
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();

  return user;
}
