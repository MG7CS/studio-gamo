/**
 * Frontend-only behaviour for dashboard previews. Nothing here sends network requests,
 * stores personal data or changes permissions — it only toggles local UI state.
 */
export function initDashboard(): void {
  const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel) as NodeListOf<T>);

  // Menus (<details data-dash-menu>): one open at a time; close on outside click / Escape.
  const menus = $$<HTMLDetailsElement>('[data-dash-menu]');
  menus.forEach((m) => m.addEventListener('toggle', () => { if (m.open) menus.forEach((o) => o !== m && (o.open = false)); }));
  document.addEventListener('click', (e) => menus.forEach((m) => { if (m.open && !m.contains(e.target as Node)) m.open = false; }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    menus.forEach((m) => { if (m.open) { m.open = false; m.querySelector('summary')?.focus(); } });
  });

  // Dialogs: drawer + block dialogs. Native <dialog> provides focus trapping and Escape.
  const drawer = document.getElementById('dash-drawer') as HTMLDialogElement | null;
  const drawerButtons = $$('[data-drawer-open]');
  const desktop = window.matchMedia('(min-width: 64rem)');
  drawerButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (!drawer || desktop.matches) return;
    drawer.showModal();
    drawerButtons.forEach((button) => button.setAttribute('aria-expanded', 'true'));
  }));
  drawer?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = $$<HTMLElement>('a[href], button, input, select, textarea, [tabindex="0"]', drawer)
      .filter((element) => element.getClientRects().length && !element.matches(':disabled'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  drawer?.addEventListener('close', () => {
    drawerButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
    if (desktop.matches) document.getElementById('dash-main')?.focus({ preventScroll: true });
  });
  desktop.addEventListener('change', () => {
    if (desktop.matches && drawer?.open) drawer.close();
  });
  drawer?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a[href]')) drawer.close();
  });
  $$('[data-drawer-close]').forEach((btn) => btn.addEventListener('click', () => drawer?.close()));
  $$<HTMLDialogElement>('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target !== d) return;
    const rect = d.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) d.close(); }));
  $$('[data-dialog-open]').forEach((btn) => btn.addEventListener('click', () => {
    const d = document.getElementById(`dlg-${btn.dataset.dialogOpen}`) as HTMLDialogElement | null;
    if (!d) return;
    d.querySelector<HTMLElement>('[data-form-success]')?.setAttribute('hidden', '');
    d.querySelector('form')?.removeAttribute('hidden');
    d.showModal();
  }));
  $$('[data-dialog-close]').forEach((btn) => btn.addEventListener('click', () => (btn.closest('dialog') as HTMLDialogElement | null)?.close()));

  // Local form validation + demo success state.
  $$<HTMLFormElement>('form[data-dash-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let firstInvalid: HTMLElement | null = null;
      $$<HTMLInputElement>('input, select, textarea', form).forEach((el) => {
        const err = form.querySelector<HTMLElement>(`[data-error-for="${el.name}"]`);
        let msg = '';
        const val = el.type === 'checkbox' ? (el.checked ? 'y' : '') : el.value.trim();
        if (el.required && !val) msg = 'This field is required.';
        else if (el.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) msg = 'Enter a valid email address.';
        el.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (err) { err.textContent = msg; err.hidden = !msg; }
        if (msg && !firstInvalid) firstInvalid = el;
      });
      const success = (form.parentElement ?? form).querySelector<HTMLElement>('[data-form-success]');
      if (firstInvalid) { (firstInvalid as HTMLElement).focus(); return; }
      if (success) { success.hidden = false; success.focus(); }
      if (form.dataset.hideOnSuccess !== undefined) form.hidden = true;
      if (form.dataset.redirect) window.location.href = form.dataset.redirect;
    });
  });

  // Table / list filtering (local only).
  const applyFilter = (root: HTMLElement) => {
    const q = (root.querySelector<HTMLInputElement>('[data-table-filter]')?.value ?? '').toLowerCase().trim();
    const chip = root.querySelector<HTMLElement>('[data-table-chip][aria-pressed="true"]')?.dataset.value ?? '';
    let shown = 0;
    $$('[data-row]', root).forEach((row) => {
      const ok = (!q || (row.dataset.search ?? row.textContent ?? '').toLowerCase().includes(q)) && (!chip || row.dataset.filter === chip);
      row.hidden = !ok;
      if (ok) shown++;
    });
    const total = new Set($$('[data-row]', root).map((r) => r.dataset.key)).size;
    const uniqueShown = new Set($$('[data-row]', root).filter((r) => !r.hidden).map((r) => r.dataset.key)).size;
    root.querySelectorAll<HTMLElement>('[data-table-empty]').forEach((el) => (el.hidden = uniqueShown > 0));
    const count = root.querySelector<HTMLElement>('[data-table-count]');
    if (count) count.textContent = `${uniqueShown} of ${total} records`;
    return shown;
  };
  $$('[data-table]').forEach((root) => {
    root.querySelector('[data-table-filter]')?.addEventListener('input', () => applyFilter(root));
    $$('[data-table-chip]', root).forEach((chip) => chip.addEventListener('click', () => {
      const on = chip.getAttribute('aria-pressed') === 'true';
      $$('[data-table-chip]', root).forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', on ? 'false' : 'true');
      if (!on && !chip.dataset.value) chip.setAttribute('aria-pressed', 'true');
      applyFilter(root);
    }));
  });

  // Top-bar search filters searchable items on the current page.
  const search = document.querySelector<HTMLInputElement>('[data-dash-search-input]');
  search?.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    $$('[data-search-item]').forEach((el) => { el.hidden = !!q && !(el.textContent ?? '').toLowerCase().includes(q); });
    $$('[data-table]').forEach((root) => {
      const f = root.querySelector<HTMLInputElement>('[data-table-filter]');
      if (f) { f.value = search.value; applyFilter(root); }
    });
  });

  // Calendar day selection.
  $$('[data-calendar]').forEach((cal) => {
    const detail = cal.querySelector<HTMLElement>('[data-cal-detail]');
    $$('[data-cal-day]', cal).forEach((day) => day.addEventListener('click', () => {
      $$('[data-cal-day]', cal).forEach((d) => d.setAttribute('aria-pressed', 'false'));
      day.setAttribute('aria-pressed', 'true');
      if (detail) detail.textContent = day.dataset.detail ?? '';
    }));
  });

  // Switch toggles.
  $$('[role="switch"]').forEach((sw) => sw.addEventListener('click', () => {
    const on = sw.getAttribute('aria-checked') === 'true';
    sw.setAttribute('aria-checked', on ? 'false' : 'true');
    const status = sw.closest('[data-settings]')?.querySelector<HTMLElement>('[data-settings-status]');
    if (status) status.textContent = 'Preference updated.';
  }));

  // Choice cards (role selection etc.).
  $$('[data-choice-group]').forEach((group) => {
    const out = group.querySelector<HTMLElement>('[data-choice-count]');
    const update = () => { if (out) out.textContent = `${$$('input:checked', group).length} selected`; };
    group.addEventListener('change', update);
    update();
  });
}
