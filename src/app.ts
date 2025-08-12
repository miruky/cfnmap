// 画面の組み立て。テンプレートの解析と描画は src/lib の純粋関数に任せ、
// ここでは入力・プレビュー・詳細パネル・書き出しの配線だけを行う。

import { parseTemplate, type Template } from './lib/cfn';
import { buildDiagram, type Diagram } from './lib/diagram';
import { categoryOf } from './lib/categories';
import { EXAMPLES } from './lib/examples';

const STORAGE_KEY = 'cfnmap:v1';

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
    <div class="brand">${BRAND_MARK}<span class="brand-name">cfnmap</span></div>
    <p class="tagline">CloudFormation / CDK(synth出力)のテンプレートを貼ると、リソースの参照関係をSVG構成図にする</p>
  </header>
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

  let current: { template: Template; diagram: Diagram } | undefined;

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
    navigator.clipboard.writeText(current.diagram.svg).then(() => {
      copyEl.textContent = 'コピーした';
      setTimeout(() => {
        copyEl.textContent = 'SVGをコピー';
      }, 1500);
    });
  });

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

  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (saved !== null && saved.trim() !== '') {
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
