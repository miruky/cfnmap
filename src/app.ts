// 画面の組み立て。テンプレートの解析と描画は src/lib の純粋関数に任せ、
// ここでは入力・プレビュー・詳細パネル・書き出しの配線だけを行う。

import { parseTemplate, type Template } from './lib/cfn';
import { buildDiagram, type Diagram } from './lib/diagram';
import { categoryOf } from './lib/categories';
import { EXAMPLES } from './lib/examples';
import { decodeSource, encodeSource } from './lib/share';
import {
  choiceLabel,
  isThemeChoice,
  nextChoice,
  resolveTheme,
  type ThemeChoice,
} from './lib/theme';

const STORAGE_KEY = 'cfnmap:v1';
const THEME_KEY = 'cfnmap:theme';
const HASH_PREFIX = '#t=';

const THEME_ICONS: Record<ThemeChoice, string> = {
  system:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 13.5A7.5 7.5 0 1 1 10.5 4a6 6 0 0 0 9.5 9.5Z" stroke-linejoin="round"/></svg>',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BRAND_MARK =
  '<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="10" width="20" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><rect x="38" y="25" width="20" height="14" rx="4" fill="none" stroke="var(--accent)" stroke-width="3.5"/><rect x="6" y="40" width="20" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M26 17C33 17 33 32 38 32M26 47C33 47 33 32 38 32" fill="none" stroke="currentColor" stroke-width="3"/></svg>';

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
  <header class="site-header">
    <div class="brand">
      ${BRAND_MARK}
      <div class="brand-text">
        <span class="kicker">CloudFormation diagram</span>
        <span class="brand-name">cfnmap</span>
      </div>
    </div>
    <button type="button" id="theme-toggle" class="theme-toggle">
      <span class="theme-toggle-icon" id="theme-icon"></span>
      <span id="theme-label"></span>
    </button>
  </header>
  <p class="tagline">CloudFormation や CDK の synth 出力テンプレートを貼り付けると、Ref・GetAtt・Sub・DependsOn からリソースの参照関係を読み取り、依存の深さで段組みしたSVG構成図に起こします。解析も描画もブラウザ内で完結します。</p>
  <main>
    <section class="pane editor-pane" aria-labelledby="editor-heading">
      <div class="pane-head">
        <h2 id="editor-heading">テンプレート(JSON / YAML)</h2>
        <label class="preset-label">サンプル
          <select id="preset">
            <option value="">自由入力</option>
            ${EXAMPLES.map((e) => `<option value="${e.id}">${esc(e.label)}</option>`).join('')}
          </select>
        </label>
      </div>
      <textarea id="source" spellcheck="false" aria-label="CloudFormationテンプレート"></textarea>
      <ul id="errors" class="errors" hidden></ul>
      <dl id="stats" class="stats" hidden>
        <div><dt>リソース</dt><dd id="stat-resources">0</dd></div>
        <div><dt>参照</dt><dd id="stat-edges">0</dd></div>
        <div><dt>Parameters</dt><dd id="stat-params">0</dd></div>
        <div><dt>Outputs</dt><dd id="stat-outputs">0</dd></div>
      </dl>
    </section>
    <section class="pane diagram-pane" aria-labelledby="diagram-heading">
      <div class="pane-head">
        <h2 id="diagram-heading">構成図</h2>
        <div class="toolbar">
          <button type="button" id="share" class="ghost">共有リンク</button>
          <button type="button" id="copy-svg" class="ghost">SVGをコピー</button>
          <button type="button" id="download-svg" class="ghost">SVGをダウンロード</button>
        </div>
      </div>
      <p id="cycle-note" class="warn" hidden>循環参照を検出した。該当ノードは同じ列へ畳んで表示している。</p>
      <div id="diagram" class="diagram" aria-live="polite"></div>
      <div id="details" class="details" hidden></div>
    </section>
  </main>
  <footer class="site-footer">
    <p>解析と描画はすべてブラウザ内で完結し、テンプレートが外部へ送信されることはない。</p>
  </footer>`;

  const sourceEl = root.querySelector('#source') as HTMLTextAreaElement;
  const presetEl = root.querySelector('#preset') as HTMLSelectElement;
  const errorsEl = root.querySelector('#errors') as HTMLUListElement;
  const statsEl = root.querySelector('#stats') as HTMLDListElement;
  const diagramEl = root.querySelector('#diagram') as HTMLDivElement;
  const detailsEl = root.querySelector('#details') as HTMLDivElement;
  const cycleEl = root.querySelector('#cycle-note') as HTMLParagraphElement;
  const copyEl = root.querySelector('#copy-svg') as HTMLButtonElement;
  const downloadEl = root.querySelector('#download-svg') as HTMLButtonElement;
  const shareEl = root.querySelector('#share') as HTMLButtonElement;
  const themeToggleEl = root.querySelector('#theme-toggle') as HTMLButtonElement;
  const themeIconEl = root.querySelector('#theme-icon') as HTMLSpanElement;
  const themeLabelEl = root.querySelector('#theme-label') as HTMLSpanElement;

  let current: { template: Template; diagram: Diagram } | undefined;

  let themeChoice: ThemeChoice = (() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return isThemeChoice(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  })();

  function applyTheme(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = resolveTheme(themeChoice, prefersDark);
    themeIconEl.innerHTML = THEME_ICONS[themeChoice];
    themeLabelEl.textContent =
      themeChoice === 'system' ? '自動' : themeChoice === 'light' ? 'ライト' : 'ダーク';
    themeToggleEl.setAttribute('aria-label', `${choiceLabel(themeChoice)}(クリックで切替)`);
    themeToggleEl.setAttribute('title', choiceLabel(themeChoice));
  }

  function flash(button: HTMLButtonElement, done: string, ok = true): void {
    const original = button.textContent ?? '';
    button.textContent = done;
    button.classList.toggle('is-done', ok);
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('is-done');
    }, 1500);
  }

  function setStat(id: string, value: number): void {
    (root.querySelector(`#stat-${id}`) as HTMLElement).textContent = String(value);
  }

  function showDetails(id: string): void {
    if (!current) return;
    const resource = current.template.resources.find((r) => r.id === id);
    if (!resource) return;
    const cat = categoryOf(resource.type);
    const outgoing = current.diagram.edges.filter((e) => e.from === id);
    const incoming = current.diagram.edges.filter((e) => e.to === id);
    const list = (items: string[]) =>
      items.length === 0 ? '<em>なし</em>' : items.map((i) => `<code>${esc(i)}</code>`).join(' ');
    const props =
      resource.properties === undefined
        ? ''
        : `<details><summary>Properties</summary><pre>${esc(JSON.stringify(resource.properties, null, 2))}</pre></details>`;
    detailsEl.hidden = false;
    detailsEl.innerHTML = `
      <header class="details-head">
        <span class="cat-dot" style="background:${cat.color}" aria-hidden="true"></span>
        <h3>${esc(id)}</h3>
        <button type="button" class="details-close" aria-label="詳細を閉じる">閉じる</button>
      </header>
      <p class="details-type"><code>${esc(resource.type)}</code> — ${esc(cat.label)}</p>
      <p>参照している: ${list(outgoing.map((e) => e.to))}</p>
      <p>参照されている: ${list(incoming.map((e) => e.from))}</p>
      ${resource.condition ? `<p>Condition: <code>${esc(resource.condition)}</code></p>` : ''}
      ${props}`;
    (detailsEl.querySelector('.details-close') as HTMLButtonElement).addEventListener(
      'click',
      () => {
        detailsEl.hidden = true;
      },
    );
  }

  diagramEl.addEventListener('click', (event) => {
    const node = (event.target as Element).closest('.node');
    if (node) showDetails(node.getAttribute('data-id') ?? '');
  });
  diagramEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = (event.target as Element).closest('.node');
    if (node) {
      event.preventDefault();
      showDetails(node.getAttribute('data-id') ?? '');
    }
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function run(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, sourceEl.value);
      } catch {
        // 保存できない環境でも動作は継続する
      }
    }, 250);

    const { template, errors } = parseTemplate(sourceEl.value);
    if (errors.length > 0 || !template) {
      errorsEl.hidden = false;
      errorsEl.innerHTML = errors.map((e) => `<li>${esc(e)}</li>`).join('');
      statsEl.hidden = true;
      cycleEl.hidden = true;
      detailsEl.hidden = true;
      diagramEl.innerHTML =
        '<p class="placeholder">テンプレートのエラーを解消すると構成図が表示される。</p>';
      current = undefined;
      return;
    }
    errorsEl.hidden = true;
    const diagram = buildDiagram(template);
    current = { template, diagram };
    diagramEl.innerHTML = diagram.svg;
    cycleEl.hidden = !diagram.layout.hasCycle;
    detailsEl.hidden = true;
    statsEl.hidden = false;
    setStat('resources', template.resources.length);
    setStat('edges', diagram.edges.length);
    setStat('params', template.parameters.length);
    setStat('outputs', template.outputs.length);
  }

  copyEl.addEventListener('click', () => {
    if (!current) return;
    navigator.clipboard.writeText(current.diagram.svg).then(
      () => flash(copyEl, 'コピーした'),
      () => flash(copyEl, 'コピーできない', false),
    );
  });

  shareEl.addEventListener('click', () => {
    const encoded = encodeSource(sourceEl.value);
    history.replaceState(null, '', `${location.pathname}${HASH_PREFIX}${encoded}`);
    navigator.clipboard
      .writeText(`${location.origin}${location.pathname}${HASH_PREFIX}${encoded}`)
      .then(
        () => flash(shareEl, 'リンクをコピー'),
        () => flash(shareEl, 'コピーできない', false),
      );
  });

  themeToggleEl.addEventListener('click', () => {
    themeChoice = nextChoice(themeChoice);
    try {
      localStorage.setItem(THEME_KEY, themeChoice);
    } catch {
      // 保存できない環境でも切り替え自体は機能する
    }
    applyTheme();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

  downloadEl.addEventListener('click', () => {
    if (!current) return;
    const blob = new Blob([current.diagram.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cfnmap.svg';
    a.click();
    URL.revokeObjectURL(url);
  });

  presetEl.addEventListener('change', () => {
    const example = EXAMPLES.find((e) => e.id === presetEl.value);
    if (example) {
      sourceEl.value = example.source;
      run();
    }
  });
  sourceEl.addEventListener('input', () => {
    presetEl.value = '';
    run();
  });

  applyTheme();

  const shared = location.hash.startsWith(HASH_PREFIX)
    ? decodeSource(location.hash.slice(HASH_PREFIX.length))
    : null;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (shared !== null && shared.trim() !== '') {
    sourceEl.value = shared;
  } else if (saved !== null && saved.trim() !== '') {
    sourceEl.value = saved;
  } else {
    const first = EXAMPLES[0];
    if (first) {
      presetEl.value = first.id;
      sourceEl.value = first.source;
    }
  }
  run();
}
