/**
 * The few 3DDashboard APIs the widget uses, on the platform's own `widget` object and AMD
 * `require`. Outside the dashboard (npm start) a small stand-in keeps the UI usable.
 */
const standalone = {
  values: { agentUrl: 'http://127.0.0.1:3100', defaultModel: '' },
  events: {},
  addEvent(name, fn) {
    this.events[name] = fn;
  },
  addPreference() {},
  getValue(name) {
    return this.values[name];
  },
  setValue(name, value) {
    this.values[name] = value;
  },
  setTitle(title) {
    document.title = title;
  },
};

export const inDashboard = typeof window.widget === 'object' && window.widget !== null;
export const widget = inDashboard ? window.widget : standalone;

export const PREFERENCES = [
  {
    name: 'agentUrl',
    type: 'text',
    label: 'Agent server',
    defaultValue: 'http://127.0.0.1:3100',
  },
  { name: 'defaultModel', type: 'text', label: 'Default model', defaultValue: '' },
];

export function registerPreferences() {
  for (const p of PREFERENCES) widget.addPreference(p);
}

export function preference(name) {
  const value = widget.getValue(name);
  return value === undefined || value === null || value === ''
    ? PREFERENCES.find((p) => p.name === name)?.defaultValue
    : String(value);
}

/** Starts the app once the dashboard has loaded the widget, or right away in standalone. */
export function onLoad(start) {
  if (inDashboard) widget.addEvent('onLoad', start);
  else start();
}

/**
 * Accepts 3DEXPERIENCE objects dropped on `element`. Calls `onItems` with
 * [{ objectId, objectType, displayName, envId }]. Does nothing outside the dashboard.
 */
export function acceptDrops(element, onItems) {
  if (!inDashboard || typeof window.require !== 'function') return;
  window.require(['DS/DataDragAndDrop/DataDragAndDrop'], (dnd) => {
    dnd.droppable(element, {
      drop: (data) => {
        try {
          const payload = typeof data === 'string' ? JSON.parse(data) : data;
          const items = payload?.data?.items ?? [];
          onItems(
            items
              .filter((i) => i && i.objectId)
              .map((i) => ({
                objectId: String(i.objectId),
                objectType: String(i.objectType ?? ''),
                displayName: String(i.displayName ?? i.objectId),
                envId: String(i.envId ?? ''),
              })),
          );
        } catch {
          onItems([]);
        }
      },
    });
  });
}
