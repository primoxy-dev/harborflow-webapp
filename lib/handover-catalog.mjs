export const handoverByteLimit = 300_000;
export const handoverRoles = ['lead', 'assistant', 'both'];

const idPattern = /^[a-z][a-z0-9-]{0,49}$/;
const sourcePattern = /^M[0-9]{3}(?:-A[0-9]{1,3})?$/;
const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function requireValue(condition, message) {
  if (!condition) throw Error(message);
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 300) => typeof value === 'string' && Boolean(value.trim()) && value.length <= limit &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const optionalText = (value, limit) => value === '' || text(value, limit);
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const date = value => matches(value, datePattern) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const bounded = (values, limit, validate, min = 0) => Array.isArray(values) && values.length >= min &&
  values.length <= limit && values.every(validate);
const strings = (values, limit = 12) => bounded(values, limit, value => text(value, 450));
const unique = values => new Set(values).size === values.length;
const refs = (values, ids, limit = 60) => bounded(values, limit, value => ids.has(value)) && unique(values);

function rows(value, limit, name, validate, min = 1) {
  requireValue(bounded(value, limit, validate, min) && unique(value.map(item => item.id)), 'Invalid ' + name);
  return new Set(value.map(item => item.id));
}

export function validateHandover(catalog) {
  requireValue(object(catalog) && catalog.version === 1 && matches(catalog.id, idPattern) &&
    text(catalog.title, 100) && text(catalog.account, 150), 'Invalid handover file');
  const { archive, roles } = catalog;
  requireValue(object(archive) && text(archive.name, 160) && date(archive.from) &&
    date(archive.to) && archive.from <= archive.to && text(archive.note, 600), 'Invalid archive information');
  requireValue(object(roles) && handoverRoles.every(role => text(roles[role], 100)) && text(roles.outgoing, 100), 'Invalid handover roles');

  const categories = rows(catalog.categories, 20, 'menu categories', item =>
    object(item) && matches(item.id, idPattern) && text(item.title, 100));
  const contacts = rows(catalog.contacts, 250, 'contacts', item =>
    object(item) && matches(item.id, idPattern) && text(item.name, 150) &&
    (item.email === '' || matches(item.email, emailPattern)) && optionalText(item.note, 220), 0);
  const sourceIds = rows(catalog.sources, 300, 'archive references', item =>
    object(item) && matches(item.id, sourcePattern) && text(item.label, 180) && text(item.sender, 130) &&
    date(item.date) && ['outgoing', 'incoming', 'system'].includes(item.direction) &&
    (item.duplicateOf === '' || matches(item.duplicateOf, sourcePattern)), 1);
  for (const item of catalog.sources) {
    requireValue(!item.duplicateOf || (sourceIds.has(item.duplicateOf) && item.duplicateOf !== item.id), 'Invalid duplicate reference');
  }

  const workflowIds = rows(catalog.workflows, 40, 'workflows', workflow =>
    object(workflow) && matches(workflow.id, idPattern) && categories.has(workflow.category) &&
    text(workflow.title, 120) && text(workflow.summary, 500) && text(workflow.start, 700) &&
    text(workflow.done, 700) && handoverRoles.includes(workflow.owner) && strings(workflow.notes) &&
    refs(workflow.sources, sourceIds, 300));
  for (const work of catalog.workflows) {
    requireValue(refs(work.related, workflowIds) && !work.related.includes(work.id), 'Invalid related workflow');
    rows(work.steps, 30, 'steps', item =>
      object(item) && matches(item.id, idPattern) && text(item.title, 170) && text(item.detail, 700) &&
      handoverRoles.includes(item.owner));
    rows(work.templates, 30, 'email templates', item =>
      object(item) && matches(item.id, idPattern) && text(item.title, 130) &&
      ['outgoing', 'incoming'].includes(item.direction) && text(item.when, 500) &&
      refs(item.from, contacts) && refs(item.to, contacts) && refs(item.cc, contacts) &&
      text(item.subject, 450) && text(item.body, 2800) && strings(item.attachments) && strings(item.notes) &&
      refs(item.sources, sourceIds) && item.sources.length > 0);
  }
  const classified = catalog.workflows.flatMap(work => work.sources);
  requireValue(sourceIds.size === classified.length && unique(classified), 'Every email reference must belong to one primary workflow');

  rows(catalog.followups, 40, 'handover follow-ups', item =>
    object(item) && matches(item.id, idPattern) && workflowIds.has(item.workflow) && text(item.title, 150) &&
    text(item.observed, 650) && text(item.next, 650) && handoverRoles.includes(item.owner) &&
    (item.date === '' || date(item.date)) && refs(item.sources, sourceIds), 0);
  return catalog;
}

export function validHandoverCase(value) {
  return text(value, 80) && !/[\r\n\t]/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
}

export function archiveCounts(catalog) {
  const files = catalog.sources.filter(source => !source.id.includes('-A'));
  return {
    files: files.length,
    messages: files.filter(source => !source.duplicateOf).length,
    embedded: catalog.sources.length - files.length
  };
}
