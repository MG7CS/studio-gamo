/**
 * Collapse the desktop sidebar to an icon rail and expand it again. The choice is remembered in this browser only (localStorage, wrapped in
 * try/catch so a blocked store just means it is not remembered). Without JavaScript the sidebar simply stays
 * visible and the button stays hidden.
 */
const KEY = 'admin-sidebar';
const button = document.querySelector<HTMLButtonElement>('[data-sidebar-toggle]');

if (button) {
  const label = button.querySelector<HTMLElement>('[data-sidebar-label]');
  const read = (): string | null => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const write = (value: string): void => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Not remembered; the toggle still works for this page.
    }
  };
  const apply = (collapsed: boolean): void => {
    document.body.dataset.sidebar = collapsed ? 'collapsed' : 'open';
    button.setAttribute('aria-expanded', String(!collapsed));
    if (label) label.textContent = collapsed ? 'Expand menu' : 'Collapse menu';
  };

  button.hidden = false;
  apply(read() === 'collapsed');
  button.addEventListener('click', () => {
    const collapsed = document.body.dataset.sidebar !== 'collapsed';
    apply(collapsed);
    write(collapsed ? 'collapsed' : 'open');
  });
}
