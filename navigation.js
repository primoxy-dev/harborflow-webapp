(() => {
  const body = document.body;
  const sidebar = document.getElementById('primaryNav');
  const toggle = document.getElementById('navToggle');
  const close = document.getElementById('closeNav');
  const backdrop = document.getElementById('navBackdrop');
  const mobile = window.matchMedia('(max-width: 900px)');
  if (!sidebar || !toggle || !close || !backdrop) return;

  try {
    body.classList.toggle('nav-collapsed', localStorage.getItem('harborflow-nav-collapsed') === 'true');
  } catch (_) {
    // Navigation remains usable when browser storage is unavailable.
  }

  let returnFocus = null;
  function syncToggle() {
    const expanded = mobile.matches ? body.classList.contains('nav-open') : !body.classList.contains('nav-collapsed');
    toggle.setAttribute('aria-expanded', String(expanded));
    const label = mobile.matches ? (expanded ? 'Close navigation' : 'Open navigation') : (expanded ? 'Collapse navigation' : 'Expand navigation');
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    sidebar.setAttribute('aria-hidden', String(mobile.matches && !expanded));
    sidebar.inert = mobile.matches && !expanded;
    if (mobile.matches) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
    }
  }
  function closeMobileNav(restoreFocus = true) {
    if (!body.classList.contains('nav-open')) return;
    body.classList.remove('nav-open');
    syncToggle();
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function openMobileNav() {
    returnFocus = document.activeElement;
    body.classList.add('nav-open');
    syncToggle();
    close.focus();
  }
  toggle.addEventListener('click', () => {
    if (mobile.matches) {
      body.classList.contains('nav-open') ? closeMobileNav() : openMobileNav();
    } else {
      const collapsed = body.classList.toggle('nav-collapsed');
      try { localStorage.setItem('harborflow-nav-collapsed', String(collapsed)); } catch (_) {}
      syncToggle();
    }
  });
  close.addEventListener('click', () => closeMobileNav());
  backdrop.addEventListener('click', () => closeMobileNav());
  sidebar.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => {
    if (mobile.matches) closeMobileNav(false);
  }));
  document.addEventListener('keydown', event => {
    if (!mobile.matches || !body.classList.contains('nav-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMobileNav();
    } else if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('button:not([disabled])')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  mobile.addEventListener('change', () => {
    closeMobileNav(false);
    syncToggle();
  });
  syncToggle();
})();
