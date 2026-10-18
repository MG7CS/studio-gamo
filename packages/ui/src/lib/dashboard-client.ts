/**
 * Frontend interactive controls for dashboard workspaces:
 * menus, native dialogs, row control actions, instant search & filtering,
 * interactive analytics charts, and client-side CSV / JSON report exports.
 */

/** Serialized chart/table payloads embedded in `data-chart-payload` / `data-table-payload` for export. */
interface ExportChart {
  title: string;
  labels?: string[];
  series: Array<{ label: string; points?: Array<{ value?: number | string; displayValue?: string }> }>;
}
interface ExportTable {
  caption: string;
  columns: Array<{ key: string; label: string }>;
  rows?: Record<string, string>[];
}
export function initDashboard(): void {
  const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
    Array.from(root.querySelectorAll<T>(sel) as NodeListOf<T>);

  const escapeCsvCell = (val: unknown): string => {
    const str = String(val ?? '')
      .replace(/\r?\n|\r/g, ' ')
      .trim();
    if (/[",]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Fallback for headless test environments if needed
    }
  };

  const dateStamp = () => new Date().toISOString().slice(0, 10);

  // Menus (<details data-dash-menu>): one open at a time; close on outside click / Escape.
  const menus = $$<HTMLDetailsElement>('[data-dash-menu]');
  menus.forEach((m) =>
    m.addEventListener('toggle', () => {
      if (m.open) menus.forEach((o) => o !== m && (o.open = false));
    }),
  );
  document.addEventListener('click', (e) =>
    menus.forEach((m) => {
      if (m.open && !m.contains(e.target as Node)) m.open = false;
    }),
  );
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    menus.forEach((m) => {
      if (m.open) {
        m.open = false;
        m.querySelector('summary')?.focus();
      }
    });
  });

  // Dialogs: drawer + block dialogs. Native <dialog> provides focus trapping and Escape.
  const drawer = document.getElementById('dash-drawer') as HTMLDialogElement | null;
  const drawerButtons = $$('[data-drawer-open]');
  const desktop = window.matchMedia('(min-width: 64rem)');
  drawerButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      if (!drawer || desktop.matches) return;
      drawer.showModal();
      drawerButtons.forEach((button) => button.setAttribute('aria-expanded', 'true'));
    }),
  );
  drawer?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = $$<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex="0"]',
      drawer,
    ).filter((element) => element.getClientRects().length && !element.matches(':disabled'));
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
  $$<HTMLDialogElement>('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const rect = d.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX >= rect.right ||
        e.clientY < rect.top ||
        e.clientY >= rect.bottom
      )
        d.close();
    }),
  );
  $$('[data-dialog-open]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const d = document.getElementById(`dlg-${btn.dataset.dialogOpen}`) as HTMLDialogElement | null;
      if (!d) return;
      d.querySelector<HTMLElement>('[data-form-success]')?.setAttribute('hidden', '');
      d.querySelector('form')?.removeAttribute('hidden');
      const subject = btn.dataset.dialogSubject;
      const badge = d.querySelector<HTMLElement>('[data-dialog-subject-badge]');
      if (badge) {
        if (subject) {
          badge.textContent = `Selected record: ${subject}`;
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }
      if (subject) {
        const subjectInput = d.querySelector<HTMLInputElement>(
          'input[name="subject"], input[name="record"], input[name="target"]',
        );
        if (subjectInput) subjectInput.value = subject;
      }
      d.showModal();
    }),
  );
  $$('[data-dialog-close]').forEach((btn) =>
    btn.addEventListener('click', () => (btn.closest('dialog') as HTMLDialogElement | null)?.close()),
  );

  // Local form validation + confirmation state.
  $$<HTMLFormElement>('form[data-dash-form]').forEach((form) => {
    const interestCount = form.querySelector<HTMLElement>('[data-interest-count]');
    if (interestCount) {
      form.addEventListener('change', () => {
        const checked = $$<HTMLInputElement>('input[type="checkbox"]:checked', form).length;
        interestCount.textContent = `${checked} outreach interests selected.`;
      });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let firstInvalid: HTMLElement | null = null;
      $$<HTMLInputElement>('input, select, textarea', form).forEach((el) => {
        const err = form.querySelector<HTMLElement>(`[data-error-for="${el.name}"]`);
        let msg = '';
        const val = el.type === 'checkbox' ? (el.checked ? 'y' : '') : el.value.trim();
        if (el.required && !val) msg = 'This field is required.';
        else if (el.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
          msg = 'Enter a valid email address.';
        el.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (err) {
          err.textContent = msg;
          err.hidden = !msg;
        }
        if (msg && !firstInvalid) firstInvalid = el;
      });
      const success = (form.parentElement ?? form).querySelector<HTMLElement>('[data-form-success]');
      if (firstInvalid) {
        (firstInvalid as HTMLElement).focus();
        return;
      }
      if (success) {
        success.hidden = false;
        success.focus();
      }
      if (form.dataset.hideOnSuccess !== undefined) form.hidden = true;
      if (form.dataset.redirect) window.location.href = form.dataset.redirect;
    });
  });

  // Table / list filtering & CSV/JSON export.
  const applyFilter = (root: HTMLElement) => {
    const q = (root.querySelector<HTMLInputElement>('[data-table-filter]')?.value ?? '').toLowerCase().trim();
    const chip =
      root.querySelector<HTMLElement>('[data-table-chip][aria-pressed="true"]')?.dataset.value ?? '';
    let shown = 0;
    $$('[data-row]', root).forEach((row) => {
      const ok =
        (!q || (row.dataset.search ?? row.textContent ?? '').toLowerCase().includes(q)) &&
        (!chip || row.dataset.filter === chip);
      row.hidden = !ok;
      if (ok) shown++;
    });
    const total = new Set($$('[data-row]', root).map((r) => r.dataset.key)).size;
    const uniqueShown = new Set(
      $$('[data-row]', root)
        .filter((r) => !r.hidden)
        .map((r) => r.dataset.key),
    ).size;
    root.querySelectorAll<HTMLElement>('[data-table-empty]').forEach((el) => (el.hidden = uniqueShown > 0));
    const count = root.querySelector<HTMLElement>('[data-table-count]');
    if (count) count.textContent = `${uniqueShown} of ${total} records`;
    return shown;
  };

  $$('[data-table]').forEach((root) => {
    root.querySelector('[data-table-filter]')?.addEventListener('input', () => applyFilter(root));
    $$('[data-table-chip]', root).forEach((chip) =>
      chip.addEventListener('click', () => {
        const on = chip.getAttribute('aria-pressed') === 'true';
        $$('[data-table-chip]', root).forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (!on && !chip.dataset.value) chip.setAttribute('aria-pressed', 'true');
        applyFilter(root);
      }),
    );

    $$<HTMLButtonElement>('[data-table-export]', root).forEach((btn) =>
      btn.addEventListener('click', () => {
        const format = btn.dataset.tableExport;
        const rawPayload = root.dataset.tablePayload;
        if (!rawPayload) return;
        try {
          const parsed = JSON.parse(rawPayload) as {
            caption: string;
            filename: string;
            columns: { key: string; label: string }[];
            rows: Record<string, string>[];
          };
          const visibleKeys = new Set(
            $$('[data-row]', root)
              .filter((r) => !r.hidden)
              .map((r) => Number(r.dataset.key)),
          );
          const filteredRows = parsed.rows.filter((_, idx) => visibleKeys.has(idx));
          const stamp = dateStamp();
          if (format === 'json') {
            const jsonContent = JSON.stringify(
              {
                report: parsed.caption,
                exportedAt: new Date().toISOString(),
                recordCount: filteredRows.length,
                columns: parsed.columns,
                records: filteredRows,
              },
              null,
              2,
            );
            triggerDownload(`${parsed.filename}-${stamp}.json`, jsonContent, 'application/json');
          } else {
            const headerLine = parsed.columns.map((c) => escapeCsvCell(c.label)).join(',');
            const dataLines = filteredRows.map((row) =>
              parsed.columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','),
            );
            const csvContent = [headerLine, ...dataLines].join('\n');
            triggerDownload(`${parsed.filename}-${stamp}.csv`, csvContent, 'text/csv;charset=utf-8');
          }
          const statusEl = root.querySelector<HTMLElement>('[data-table-export-status]');
          if (statusEl) {
            statusEl.textContent = `Exported ${filteredRows.length} ${
              filteredRows.length === 1 ? 'record' : 'records'
            } to ${(format ?? 'csv').toUpperCase()} (${parsed.filename}-${stamp}.${format ?? 'csv'})`;
            statusEl.hidden = false;
          }
        } catch {
          // Ignore malformed payload
        }
      }),
    );
  });

  // AnalyticsChart view switcher (Graph vs Data Table) and CSV/JSON export.
  $$('[data-analytics-chart]').forEach((chartRoot) => {
    const visualPane = chartRoot.querySelector<HTMLElement>('[data-chart-visual-pane]');
    const tablePane = chartRoot.querySelector<HTMLElement>('[data-chart-table-pane]');
    const viewButtons = $$<HTMLButtonElement>('[data-chart-view]', chartRoot);

    viewButtons.forEach((btn) =>
      btn.addEventListener('click', () => {
        const mode = btn.dataset.chartView;
        viewButtons.forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        if (visualPane && tablePane) {
          visualPane.hidden = mode === 'table';
          tablePane.hidden = mode !== 'table';
        }
      }),
    );

    $$<HTMLButtonElement>('[data-chart-export]', chartRoot).forEach((btn) =>
      btn.addEventListener('click', () => {
        const format = btn.dataset.chartExport;
        const rawPayload = chartRoot.dataset.chartPayload;
        if (!rawPayload) return;
        try {
          const parsed = JSON.parse(rawPayload) as {
            title: string;
            variant: string;
            unit: string;
            filename: string;
            labels: string[];
            series: {
              label: string;
              points: { label: string; value: number; displayValue: string; note: string }[];
            }[];
          };
          const stamp = dateStamp();
          if (format === 'json') {
            const jsonContent = JSON.stringify(
              {
                chart: parsed.title,
                variant: parsed.variant,
                unit: parsed.unit,
                exportedAt: new Date().toISOString(),
                series: parsed.series,
              },
              null,
              2,
            );
            triggerDownload(`${parsed.filename}-${stamp}.json`, jsonContent, 'application/json');
          } else {
            const headers = ['Period / Category', ...parsed.series.map((s) => s.label)];
            const rows = parsed.labels.map((lbl, idx) => [
              lbl,
              ...parsed.series.map((s) => String(s.points[idx]?.displayValue ?? s.points[idx]?.value ?? '')),
            ]);
            const csvContent = [
              headers.map(escapeCsvCell).join(','),
              ...rows.map((r) => r.map(escapeCsvCell).join(',')),
            ].join('\n');
            triggerDownload(`${parsed.filename}-${stamp}.csv`, csvContent, 'text/csv;charset=utf-8');
          }
          const statusEl = chartRoot.querySelector<HTMLElement>('[data-chart-export-status]');
          if (statusEl) {
            statusEl.textContent = `Exported ${parsed.title} dataset to ${(
              format ?? 'csv'
            ).toUpperCase()} (${parsed.filename}-${stamp}.${format ?? 'csv'})`;
            statusEl.hidden = false;
          }
        } catch {
          // Ignore malformed chart payload
        }
      }),
    );
  });

  // Page-level full report export ([data-export-report="csv" | "json" | "print"]).
  $$<HTMLButtonElement>('[data-export-report]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const mode = btn.dataset.exportReport ?? 'csv';
      if (mode === 'print') {
        window.print();
        return;
      }
      const pageTitle =
        document.querySelector('[data-page-title]')?.textContent?.trim() ||
        document.title.split('|')[0]?.trim() ||
        'gamo-report';
      const slug =
        pageTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'gamo-report';
      const stamp = dateStamp();

      const stats = $$('[data-stat-grid] [data-stat-label]').map((el) => ({
        metric: el.getAttribute('data-stat-label') ?? '',
        value: el.getAttribute('data-stat-value') ?? '',
        context: el.getAttribute('data-stat-hint') ?? '',
      }));

      const charts = $$('[data-analytics-chart]')
        .map((el) => {
          try {
            return JSON.parse(el.dataset.chartPayload ?? 'null') as ExportChart | null;
          } catch {
            return null;
          }
        })
        .filter((c): c is ExportChart => Boolean(c));

      const tables = $$('[data-table]')
        .map((el) => {
          try {
            return JSON.parse(el.dataset.tablePayload ?? 'null') as ExportTable | null;
          } catch {
            return null;
          }
        })
        .filter((t): t is ExportTable => Boolean(t));

      if (mode === 'json') {
        const jsonReport = JSON.stringify(
          {
            reportTitle: pageTitle,
            exportedAt: new Date().toISOString(),
            summaryMetrics: stats,
            charts,
            tables,
          },
          null,
          2,
        );
        triggerDownload(`${slug}-${stamp}.json`, jsonReport, 'application/json');
      } else {
        const lines: string[] = [];
        lines.push(`# ${pageTitle} — Exported ${stamp}`);
        if (stats.length > 0) {
          lines.push('');
          lines.push('Metric,Value,Context');
          stats.forEach((s) => lines.push([s.metric, s.value, s.context].map(escapeCsvCell).join(',')));
        }
        charts.forEach((c) => {
          lines.push('');
          lines.push(`# Chart: ${c.title}`);
          const headers = ['Period / Category', ...c.series.map((s) => s.label)];
          lines.push(headers.map(escapeCsvCell).join(','));
          (c.labels ?? []).forEach((lbl: string, idx: number) => {
            const row = [
              lbl,
              ...c.series.map((s) => s.points?.[idx]?.displayValue ?? s.points?.[idx]?.value ?? ''),
            ];
            lines.push(row.map(escapeCsvCell).join(','));
          });
        });
        tables.forEach((t) => {
          lines.push('');
          lines.push(`# Table: ${t.caption}`);
          lines.push(t.columns.map((c) => escapeCsvCell(c.label)).join(','));
          (t.rows ?? []).forEach((r: Record<string, string>) => {
            lines.push(t.columns.map((c) => escapeCsvCell(r[c.key] ?? '')).join(','));
          });
        });
        triggerDownload(`${slug}-${stamp}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
      }

      const pageStatus = document.querySelector<HTMLElement>('[data-page-export-status]');
      if (pageStatus) {
        pageStatus.textContent = `Full ${mode.toUpperCase()} report exported (${slug}-${stamp}.${mode})`;
        pageStatus.hidden = false;
      }
    }),
  );

  // Top-bar search filters searchable items on the current page.
  const search = document.querySelector<HTMLInputElement>('[data-dash-search-input]');
  search?.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    $$('[data-search-item]').forEach((el) => {
      el.hidden = !!q && !(el.textContent ?? '').toLowerCase().includes(q);
    });
    $$('[data-table]').forEach((root) => {
      const f = root.querySelector<HTMLInputElement>('[data-table-filter]');
      if (f) {
        f.value = search.value;
        applyFilter(root);
      }
    });
  });

  // Calendar day selection.
  $$('[data-calendar]').forEach((cal) => {
    const detail = cal.querySelector<HTMLElement>('[data-cal-detail]');
    $$('[data-cal-day]', cal).forEach((day) =>
      day.addEventListener('click', () => {
        $$('[data-cal-day]', cal).forEach((d) => d.setAttribute('aria-pressed', 'false'));
        day.setAttribute('aria-pressed', 'true');
        if (detail) detail.textContent = day.dataset.detail ?? '';
      }),
    );
  });

  // Switch toggles.
  $$('[role="switch"]').forEach((sw) =>
    sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') === 'true';
      sw.setAttribute('aria-checked', on ? 'false' : 'true');
      const status = sw.closest('[data-settings]')?.querySelector<HTMLElement>('[data-settings-status]');
      if (status) status.textContent = 'Control state updated.';
    }),
  );

  // Choice cards (role selection etc.).
  $$('[data-choice-group]').forEach((group) => {
    const out = group.querySelector<HTMLElement>('[data-choice-count]');
    const update = () => {
      if (out) out.textContent = `${$$('input:checked', group).length} selected`;
    };
    group.addEventListener('change', update);
    update();
  });
}
