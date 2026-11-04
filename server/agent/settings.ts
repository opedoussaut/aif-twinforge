import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { checkModelUrl, type ModelSettings } from './config';

/** Where each user's model settings live between runs. */
export type SettingsStore = {
  load(): ModelSettings | undefined;
  save(settings: ModelSettings): void;
};

const saved = z.object({
  modelBaseUrl: z.string().max(500),
  modelApiKey: z.string().max(500).optional(),
});

/**
 * The model settings a user entered in the widget, in their home folder (never in the repository,
 * never sent anywhere but the model endpoint). Readable by the user only where the OS allows it.
 */
export function fileSettingsStore(
  file = join(homedir(), '.aif-twinforge', 'settings.json'),
): SettingsStore {
  return {
    load() {
      if (!existsSync(file)) return undefined;
      try {
        const parsed = saved.safeParse(JSON.parse(readFileSync(file, 'utf8')));
        if (!parsed.success || 'error' in checkModelUrl(parsed.data.modelBaseUrl)) return undefined;
        return parsed.data;
      } catch {
        return undefined;
      }
    },
    save(settings) {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
    },
  };
}

/** Settings kept for the life of the process only: tests, or a run without a home folder. */
export function memorySettingsStore(initial?: ModelSettings): SettingsStore {
  let current = initial;
  return {
    load: () => current,
    save: (s) => {
      current = s;
    },
  };
}
