import { archiveCounts } from './lib/handover-catalog.mjs';

const mapArtCategories = new Set(['crew', 'travel', 'people', 'finance', 'admin']);
const directions = [['outgoing', 'เรื่องที่ส่งออก'], ['incoming', 'เรื่องที่รับเข้า']];
const escapeMap = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const mapArt = name => '<span class="hfm-art" data-hfm-art="' + name + '" aria-hidden="true"></span>';

function mapTopic(work) {
  const [name, ...context] = work.title.split(' · ');
  return '<button class="btn btn-block hfm-topic" type="button" data-hfm-pick="' + escapeMap(work.id) +
    '" aria-expanded="false" aria-controls="fvsb-map-topic"><span class="hfm-topic-label"><span>' + escapeMap(name) +
    '</span>' + (context.length ? '<small class="text-small">' + escapeMap(context.join(' · ')) + '</small>' : '') + '</span></button>';
}

function mapTopicDetail(work, workflowNames, sourceIds, workspace) {
  const count = work.sources.filter(id => sourceIds.has(id)).length;
  const topics = directions.map(([direction, label]) => {
    const matching = work.templates.filter(template => template.direction === direction);
    return matching.length ? '<section><h4>' + label + '</h4><ul>' +
      matching.map(template => '<li>' + escapeMap(template.title) + '</li>').join('') + '</ul></section>' : '';
  }).join('');
  const related = work.related.map(id => '<li>' + escapeMap(workflowNames.get(id)) + '</li>').join('');
  const actions = workspace ? '<div class="hfm-actions">' +
    '<button type="button" data-hfh-section="' + escapeMap(work.id) + '">เปิด SOP</button>' +
    '<button type="button" data-hfh-section="' + escapeMap(work.id) + '" data-hfh-open-view="email">เปิดรูปแบบอีเมล</button></div>' : '';
  return '<template data-hfm-detail="' + escapeMap(work.id) + '">' +
    '<header><h3>' + escapeMap(work.title) + '</h3><p class="text-small">' + count + ' อีเมลหลังรวมสำเนา</p></header>' +
    '<p>' + escapeMap(work.summary) + '</p>' +
    '<div class="hfm-types">' + topics + '</div>' +
    (related ? '<h4>งานที่เกี่ยวข้อง</h4><ul class="hfm-related">' + related + '</ul>' : '') +
    actions + '</template>';
}

export function renderHandoverMindMap(catalog, artwork, { workspace = false } = {}) {
  const { messages } = archiveCounts(catalog);
  const name = catalog.title.replace(/ Operations Handover$/, '');
  const branches = catalog.categories.map(category => {
    const topics = catalog.workflows.filter(work => work.category === category.id);
    if (!topics.length) return '';
    const art = mapArtCategories.has(category.id) ? category.id : 'admin';
    return '<section class="hfm-branch"><header class="hfm-branch-head">' + mapArt(art) +
      '<h4>' + escapeMap(category.title) + '</h4></header><ul class="hfm-topics">' +
      topics.map(work => '<li>' + mapTopic(work) + '</li>').join('') + '</ul></section>';
  }).filter(Boolean);
  const sourceIds = new Set(catalog.sources.filter(source => !source.duplicateOf && !source.id.includes('-A')).map(source => source.id));
  const workflowNames = new Map(catalog.workflows.map(work => [work.id, work.title]));
  const details = catalog.workflows.map(work => mapTopicDetail(work, workflowNames, sourceIds, workspace)).join('');
  const download = workspace ? '<div class="hfm-toolbar"><span role="status" data-hfm-pdf-status></span>' +
    '<button type="button" class="hfm-download" data-hfm-download>Download PDF</button></div>' : '';
  return '<div class="hfm" lang="th" style="--hfm-atlas:url(&quot;' + escapeMap(artwork) +
    '&quot;);--hfm-branch-count:' + branches.length + '" data-hfm-root data-hfm-layout="' +
    (branches.length > 5 ? 'stack' : 'tree') + '">' + download +
    '<div class="hfm-tree"><header class="hfm-hub">' + mapArt('hub') +
    '<div><h3>แผนผังอีเมล ' + escapeMap(name) + '</h3><p class="text-small">' + messages + ' อีเมล · ' + catalog.workflows.length +
    ' ประเภทเรื่อง</p></div></header>' +
    '<div class="hfm-branches" aria-label="กลุ่มอีเมล">' + branches.join('') + '</div></div>' +
    '<section id="fvsb-map-topic" class="hfm-detail card" aria-label="รายละเอียดหัวข้อ" aria-live="polite" hidden></section>' +
    details + '</div>';
}

export function bindHandoverMindMap(root, onSelection) {
  const output = root.querySelector('.hfm-detail');
  const buttons = new Map([...root.querySelectorAll('[data-hfm-pick]')].map(node => [node.dataset.hfmPick, node]));
  const templates = new Map([...root.querySelectorAll('[data-hfm-detail]')].map(node => [node.dataset.hfmDetail, node]));
  function show(id) {
    const template = templates.get(id);
    for (const [key, button] of buttons) button.setAttribute('aria-expanded', String(key === id));
    output.replaceChildren();
    output.hidden = !template;
    if (template) output.append(template.content.cloneNode(true));
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-hfm-pick]');
    if (!button) return;
    const id = button.getAttribute('aria-expanded') === 'true' ? null : button.dataset.hfmPick;
    show(id);
    onSelection?.(id);
    if (id) output.scrollIntoView({ block: 'nearest' });
  });
  return show;
}
