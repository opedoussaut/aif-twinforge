import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Plain-language names for the connector tools, so engineers read steps, not function names. */
const NAMES = {
  iterop_connection: 'Check the ITEROP connection',
  iterop_list_startable_processes: 'List the processes you can start',
  iterop_get_process_model: 'Read the process model',
  iterop_start_process: 'Start a process',
  iterop_list_my_tasks: 'List your tasks',
  iterop_get_task: 'Read a task',
  iterop_complete_task: 'Complete a task',
  iterop_get_instance: 'Read a run',
  cooling_check: 'Run the engineering check',
  view3d_build: 'Build the 3D view',
  cameo_connection: 'Check the CATIA Magic connection',
  cameo_model_receipt: 'Sign the model receipt',
};

export function toolLabel(name) {
  if (NAMES[name]) return NAMES[name];
  const words = name.replace(/^(iterop|cameo)_/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The connector refused a call it ran (bad input, wrong stage): not "done". */
export const failed = (part) => part.state === 'output-error' || part.output?.error === true;

export function reason(part) {
  const r = part.output?.result;
  return part.errorText ?? (typeof r === 'string' ? r : (r?.error ?? r?.message ?? ''));
}

export function toolStatus(part) {
  if (failed(part)) return { text: 'failed', tone: 'bad' };
  return (
    {
      'input-streaming': { text: 'preparing', tone: 'busy' },
      'input-available': { text: 'running', tone: 'busy' },
      'approval-requested': { text: 'waiting for you', tone: 'ask' },
      'approval-responded': part.approval?.approved
        ? { text: 'approved', tone: 'busy' }
        : { text: 'declined', tone: 'bad' },
      'output-available': part.approval?.approved
        ? { text: 'done · approved by you', tone: 'ok' }
        : { text: 'done', tone: 'ok' },
      'output-error': { text: 'error', tone: 'bad' },
      'output-denied': { text: 'refused', tone: 'bad' },
    }[part.state] ?? { text: part.state, tone: 'busy' }
  );
}

/**
 * A message as blocks: text, runs of tool steps folded together, and approval requests on their
 * own so they stand out.
 */
export function blocks(message) {
  const out = [];
  for (const part of message.parts) {
    if (part.type === 'text') {
      if (part.text.trim()) out.push({ kind: 'text', part });
    } else if (part.type === 'dynamic-tool') {
      if (part.state === 'approval-requested') out.push({ kind: 'approval', part });
      else if (out.at(-1)?.kind === 'tools') out.at(-1).parts.push(part);
      else out.push({ kind: 'tools', parts: [part] });
    }
  }
  return out;
}

/** The values a write will use, as label/value rows. */
export function fields(input) {
  if (!input || typeof input !== 'object') return [{ key: 'input', value: String(input ?? '') }];
  return Object.entries(input).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.entries(v).map(([k2, v2]) => ({ key: `${k} · ${k2}`, value: show(v2) }))
      : [{ key: k, value: show(v) }],
  );
}
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

marked.setOptions({ gfm: true, breaks: true });
/** Model answers are Markdown; render it, and strip anything that could run in the page. */
export function markdown(text) {
  const html = DOMPurify.sanitize(marked.parse(text), { USE_PROFILES: { html: true } });
  return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

export const SUGGESTIONS = [
  'Which engine are you on?',
  'What tasks are waiting for me?',
  'Start the cooling chain for Hall B: 1.2 MW, 32 °C facility water, 16 racks, N+1.',
  'Hall B is expanding to 24 racks and 1.8 MW. Prepare the change.',
];
