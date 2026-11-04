<script setup>
import { computed, ref, watch } from 'vue';

/**
 * Self-service setup: each user runs their own agent with their own model. `mode` is
 * "offline" (no agent answers), "refused" (the agent does not accept this page) or "models"
 * (the agent runs; choose where its models come from).
 */
const props = defineProps({
  mode: { type: String, required: true },
  agentUrl: { type: String, required: true },
  settings: { type: Object, default: null },
  problem: { type: String, default: '' },
  closable: { type: Boolean, default: false },
});
const emit = defineEmits(['saved', 'close']);

const command = 'npx github:opedoussaut/aif-twinforge';
const origin = window.location.origin;

const presets = [
  {
    id: 'ollama',
    label: 'Ollama on this computer (free, private)',
    url: 'http://127.0.0.1:11434/v1',
    key: false,
    help: 'Install Ollama from ollama.com, then get a model:',
    code: 'ollama pull qwen3-coder:30b',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (Claude, GPT, Llama, Qwen… with one key)',
    url: 'https://openrouter.ai/api/v1',
    key: true,
    help: 'Create a key at openrouter.ai/keys. You pay OpenRouter for what you use.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    url: 'https://api.openai.com/v1',
    key: true,
    help: 'Create a key at platform.openai.com/api-keys.',
  },
  {
    id: 'custom',
    label: 'Another OpenAI-compatible endpoint (LiteLLM, company gateway)',
    url: '',
    key: true,
    help: 'Its base URL, usually ending in /v1. A key only if it needs one.',
  },
];
const presetFor = (url) => presets.find((p) => p.url && p.url === url) ?? presets[3];

const preset = ref(presetFor(props.settings?.modelBaseUrl ?? presets[0].url));
const url = ref(props.settings?.modelBaseUrl ?? presets[0].url);
const key = ref('');
const saving = ref(false);
const result = ref('');
watch(preset, (p) => {
  if (p.url) url.value = p.url;
  key.value = '';
});
// A saved key is kept only for the URL it was entered for.
const keySaved = computed(
  () => props.settings?.hasKey && url.value === props.settings.modelBaseUrl,
);

async function save() {
  saving.value = true;
  result.value = '';
  try {
    const r = await fetch(`${props.agentUrl}/agent/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelBaseUrl: url.value,
        ...(key.value ? { modelApiKey: key.value } : {}),
      }),
    });
    const body = await r.json();
    if (!r.ok) {
      result.value = body.message ?? 'The agent refused these settings.';
      return;
    }
    key.value = '';
    if (body.modelsError || !body.models.length) {
      result.value = `Saved, but no models answer at ${new URL(body.settings.modelBaseUrl).host}. ${
        preset.value.id === 'ollama'
          ? 'Is Ollama running, with at least one model pulled?'
          : 'Check the URL and the key.'
      }`;
      return;
    }
    emit('saved', body.models);
  } catch {
    result.value = 'The agent cannot be reached.';
  } finally {
    saving.value = false;
  }
}

const copied = ref('');
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = text;
    setTimeout(() => (copied.value = ''), 1500);
  } catch {
    copied.value = '';
  }
}
</script>

<template>
  <section class="setup">
    <template v-if="mode === 'offline'">
      <h2>Run your own agent</h2>
      <p>
        The widget talks to an agent on your computer. It uses your model and keeps your keys on
        your machine. It runs on the <strong>simulated</strong> ITEROP engine.
      </p>
      <ol>
        <li>
          Install <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js 22 LTS</a> and
          <a href="https://git-scm.com/downloads" target="_blank" rel="noopener">Git</a>, once.
        </li>
        <li>
          Open a terminal and run:
          <div class="code">
            <code>{{ command }}</code>
            <button type="button" @click="copy(command)">
              {{ copied === command ? 'Copied' : 'Copy' }}
            </button>
          </div>
          Keep that window open while you use the widget.
        </li>
        <li>This widget connects by itself, then asks which model to use.</li>
      </ol>
      <p class="hint">Looking for the agent at {{ agentUrl }} every few seconds…</p>
    </template>

    <template v-else-if="mode === 'refused'">
      <h2>Your agent does not accept this page</h2>
      <p>
        The agent only answers pages it knows. This page is <code>{{ origin }}</code
        >. Add it to <code>AGENT_ALLOWED_ORIGINS</code> in the agent's <code>.env</code>, or remove
        that line to use the defaults, then restart the agent.
      </p>
    </template>

    <template v-else>
      <h2>Where should your models come from?</h2>
      <p v-if="problem" class="problem">{{ problem }}</p>
      <form @submit.prevent="save">
        <label>
          <span>Source</span>
          <select v-model="preset">
            <option v-for="p in presets" :key="p.id" :value="p">{{ p.label }}</option>
          </select>
        </label>
        <p class="hint">
          {{ preset.help }}
          <span v-if="preset.code" class="code">
            <code>{{ preset.code }}</code>
            <button type="button" @click="copy(preset.code)">
              {{ copied === preset.code ? 'Copied' : 'Copy' }}
            </button>
          </span>
        </p>
        <label v-if="preset.id === 'custom'">
          <span>Base URL</span>
          <input
            v-model.trim="url"
            type="url"
            placeholder="https://gateway.example.com/v1"
            required
          />
        </label>
        <label v-if="preset.key">
          <span>API key</span>
          <input
            v-model="key"
            type="password"
            autocomplete="off"
            :placeholder="keySaved ? 'Saved. Leave empty to keep it.' : 'Paste your key'"
            :required="preset.id !== 'custom' && !keySaved"
          />
        </label>
        <p class="hint">
          Saved by your agent in your home folder. The key goes only to
          {{ url ? url : 'this endpoint' }}, never to this page's server.
        </p>
        <p v-if="result" class="problem">{{ result }}</p>
        <div class="actions">
          <button type="submit" class="primary" :disabled="saving || !url">
            {{ saving ? 'Checking…' : 'Save and connect' }}
          </button>
          <button v-if="closable" type="button" @click="emit('close')">Cancel</button>
        </div>
      </form>
    </template>
  </section>
</template>
