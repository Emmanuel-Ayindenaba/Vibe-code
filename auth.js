// ==========================
// SESSION HELPERS
// ==========================

const GUEST_FLAG = 'guestMode';

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

function isGuest() {
  return sessionStorage.getItem(GUEST_FLAG) === 'true';
}

// ==========================
// SIGN UP
// ==========================

const signupForm = document.getElementById("signupForm");

if (signupForm) {
  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    const submitBtn = signupForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';

    if (error) {
      alert(error.message);
      return;
    }

    if (!data.session) {
      // Email confirmation is required before the account can log in
      alert("Account created! Check your inbox to confirm your email, then log in.");
    } else {
      alert("Account created successfully!");
    }

    window.location.href = "login.html";
  });
}

// ==========================
// LOGIN
// ==========================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
      alert(error.message);
      return;
    }

    // Check the account hasn't been disabled by an admin
    const { data: profile } = await sb
      .from('profiles')
      .select('is_disabled')
      .eq('id', data.user.id)
      .single();

    if (profile && profile.is_disabled) {
      await sb.auth.signOut();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
      alert('This account has been disabled. Contact the site admin for help.');
      return;
    }

    sessionStorage.removeItem(GUEST_FLAG);
    window.location.href = "home.html";
  });
}

// ==========================
// CONTINUE AS GUEST
// ==========================

const guestBtn = document.getElementById("guestBtn");

if (guestBtn) {
  guestBtn.addEventListener("click", async function () {
    await sb.auth.signOut();
    sessionStorage.setItem(GUEST_FLAG, 'true');
    window.location.href = "home.html";
  });
}

// ==========================
// PROTECT PAGES
// ==========================

const protectedPages = ["home.html", "profile.html", "invoices.html", "admin.html"];
const currentPage = window.location.pathname.split("/").pop();

if (protectedPages.includes(currentPage)) {
  (async () => {
    const session = await getSession();
    if (!session && !isGuest()) {
      window.location.href = "login.html";
    }
  })();
}

// ==========================
// LOGOUT
// ==========================

async function logout() {
  await sb.auth.signOut();
  sessionStorage.removeItem(GUEST_FLAG);
  window.location.href = "login.html";
}
