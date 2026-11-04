<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useChat } from '@ai-sdk/vue';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import AgentSetup from './AgentSetup.vue';
import { acceptDrops, inDashboard, preference } from './platform';
import {
  blocks,
  failed,
  fields,
  markdown,
  reason,
  SUGGESTIONS,
  toolLabel,
  toolStatus,
} from './present';

const agentUrl = preference('agentUrl').replace(/\/+$/, '');
const models = ref([]);
const model = ref('');
// checking · offline (no agent) · refused (agent rejects this page) · models (no models) · error · ok
const agent = ref({ state: 'checking', text: 'Connecting to the agent…' });
const settings = ref(null);
const showSettings = ref(false);
const input = ref('');
const dropped = ref([]);
const surface = ref(null);
const log = ref(null);
const engine = ref('');

const { messages, setMessages, sendMessage, addToolApprovalResponse, status, error, stop } =
  useChat({
    transport: new DefaultChatTransport({
      api: `${agentUrl}/agent/chat`,
      body: () => ({ model: model.value }),
    }),
    // After the user answers every approval, the agent continues on its own.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

const selected = computed(() => models.value.find((m) => m.id === model.value));
const showExamples = ref(false);
// The conversation's title: its first question, like a chat app.
const title = computed(() => {
  const first = messages.value.find((m) => m.role === 'user')?.parts.find((p) => p.type === 'text');
  const text = first?.text.split('\n\nObjects dropped')[0] ?? '';
  return text ? (text.length > 48 ? `${text.slice(0, 47)}…` : text) : 'New conversation';
});
// Up to three model cards: certified models first, and always the one selected.
const cards = computed(() => {
  const ranked = [...models.value].sort((a, b) => Number(b.fullChain) - Number(a.fullChain));
  const top = ranked.slice(0, 3);
  if (selected.value && !top.includes(selected.value)) top[2] = selected.value;
  return top;
});
const modelHint = (m) =>
  m.fullChain
    ? 'Full chain: reads, and prepares changes for your approval'
    : 'Read only: processes, tasks and the system model';

function newConversation() {
  if (busy.value) stop();
  setMessages([]);
  input.value = '';
  showExamples.value = false;
}
const busy = computed(() => status.value === 'submitted' || status.value === 'streaming');

let retry;
async function connect() {
  clearTimeout(retry);
  let s;
  try {
    const r = await fetch(`${agentUrl}/agent/status`);
    s = await r.json();
    if (r.status === 403) {
      agent.value = { state: 'refused', text: 'Your agent does not accept this page.' };
      return;
    }
  } catch {
    // No agent yet: keep looking, so the widget connects as soon as the user starts it.
    agent.value = { state: 'offline', text: `No agent at ${agentUrl}.` };
    retry = setTimeout(connect, 4000);
    return;
  }
  settings.value = await fetch(`${agentUrl}/agent/settings`)
    .then((r) => r.json())
    .catch(() => null);
  if (!s.ready) {
    agent.value = { state: 'error', text: s.blockers.join(' ') };
    return;
  }
  engine.value = s.engine ?? '';
  const tools = s.connectors.map((c) => `${c.name} (${c.tools} tools)`).join(' · ');
  try {
    const m = await fetch(`${agentUrl}/agent/models`).then((r) =>
      r.ok ? r.json() : Promise.reject(r),
    );
    if (!m.models.length) throw new Error('no models');
    useModels(m.models);
    agent.value = { state: 'ok', text: `Connected · ${s.model.host} · ${tools}` };
  } catch {
    agent.value = {
      state: 'models',
      text:
        s.model.source === 'default'
          ? 'Your agent is running. Choose where its models come from.'
          : `Your agent cannot get models from ${s.model.host}.`,
    };
  }
}

function useModels(list) {
  models.value = list;
  const wanted = preference('defaultModel');
  if (!list.some((x) => x.id === model.value))
    model.value =
      list.find((x) => x.id === wanted)?.id ??
      list.find((x) => x.fullChain)?.id ??
      list[0]?.id ??
      '';
}

function saved() {
  showSettings.value = false;
  connect();
}

onBeforeUnmount(() => clearTimeout(retry));

onMounted(() => {
  connect();
  acceptDrops(surface.value, (items) => {
    for (const i of items)
      if (!dropped.value.some((d) => d.objectId === i.objectId)) dropped.value.push(i);
  });
});

function send(suggestion) {
  const text = (typeof suggestion === 'string' ? suggestion : input.value).trim();
  if (!text || !model.value || busy.value) return;
  const context = dropped.value.length
    ? '\n\nObjects dropped in the dashboard for context:\n' +
      dropped.value
        .map((d) => `- ${d.displayName} (${d.objectType || 'object'}, id ${d.objectId})`)
        .join('\n')
    : '';
  sendMessage({ text: text + context });
  input.value = '';
  dropped.value = [];
}

const answer = (part, approved) =>
  addToolApprovalResponse({
    id: part.approval.id,
    approved,
    reason: approved ? 'Approved in the widget' : 'Declined in the widget',
  });
const json = (v) => JSON.stringify(v, null, 2);
const MARK =
  'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.7 3.7L12 11.7 5.3 8 12 4.3ZM5 9.7l6 3.3v6.7l-6-3.3V9.7Zm8 10V13l6-3.3v6.7l-6 3.3Z';
const GEAR =
  'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.6 6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.3 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2.1-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z';
const statusLabel = computed(
  () =>
    ({
      checking: 'Connecting…',
      offline: 'No agent',
      refused: 'Not allowed',
      models: 'Choose models',
      error: 'Problem',
      ok: 'Connected',
    })[agent.value.state] ?? agent.value.state,
);
// Working, and nothing visible is moving yet: show that the agent is on it.
const thinking = computed(() => {
  if (!busy.value) return false;
  const last = messages.value.at(-1);
  if (!last || last.role === 'user') return true;
  const part = last.parts.at(-1);
  return !part || part.type === 'step-start' || part.state === 'output-available';
});
// Keep the newest step in view while the agent works.
watch(
  () => `${messages.value.length}:${messages.value.at(-1)?.parts?.length}:${status.value}`,
  async () => {
    await nextTick();
    log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' });
  },
);
</script>

<template>
  <div ref="surface" class="agent">
    <header class="bar">
      <div class="brand">
        <span class="avatar small"
          ><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="MARK" /></svg
        ></span>
        <div>
          <strong>{{ title }}</strong>
          <span class="sub"
            >aif-twinforge<template v-if="messages.length && model"> · {{ model }}</template></span
          >
        </div>
      </div>
      <div class="badges">
        <span v-if="engine" :class="['badge', engine === 'live' ? 'live' : 'sim']">
          {{ engine === 'live' ? 'Live sandbox' : 'Simulated' }}
        </span>
        <span :class="['pill', agent.state]" :title="agent.text">
          <span class="dot"></span>{{ statusLabel }}
        </span>
        <button
          v-if="agent.state === 'ok'"
          type="button"
          class="icon"
          :disabled="busy"
          :aria-pressed="showSettings"
          aria-label="Where your models come from"
          title="Where your models come from"
          @click="showSettings = !showSettings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="GEAR" /></svg>
        </button>
      </div>
    </header>

    <AgentSetup
      v-if="['offline', 'refused', 'models'].includes(agent.state) || showSettings"
      :mode="showSettings ? 'models' : agent.state"
      :agent-url="agentUrl"
      :settings="settings"
      :problem="showSettings ? '' : agent.text"
      :closable="showSettings"
      @saved="saved"
      @close="showSettings = false"
    />
    <div v-else-if="agent.state === 'error'" class="notice error">
      <span>{{ agent.text }}</span>
      <button type="button" @click="connect">Retry</button>
    </div>
    <div v-else-if="agent.state === 'checking'" class="center muted">Connecting to your agent…</div>

    <main v-show="agent.state === 'ok' && !showSettings" ref="log" class="log" aria-live="polite">
      <section v-if="!messages.length" class="welcome">
        <span class="avatar hero"
          ><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="MARK" /></svg
        ></span>
        <h2>Hello, I'm your AI factory agent,</h2>
        <p>
          your companion for the digital twin: ITEROP processes, the system model and the 3D view.
          Every change waits for your approval.
        </p>
        <p class="ask">How can I help you?</p>

        <div class="cards" role="radiogroup" aria-label="Model">
          <button
            v-for="m in cards"
            :key="m.id"
            type="button"
            role="radio"
            :aria-checked="m.id === model"
            :class="['card', { on: m.id === model }]"
            @click="model = m.id"
          >
            <span :class="['avatar', 'tiny', m.fullChain ? 'full' : 'read']">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="MARK" /></svg>
            </span>
            <span class="card-text">
              <strong>{{ m.id }}</strong>
              <span>{{ modelHint(m) }}</span>
            </span>
          </button>
        </div>
        <label v-if="models.length > cards.length" class="all-models">
          <span>All models</span>
          <select v-model="model">
            <option v-for="m in models" :key="m.id" :value="m.id">
              {{ m.id }}{{ m.fullChain ? '' : ' (read only)' }}
            </option>
          </select>
        </label>

        <button type="button" class="link" @click="showExamples = !showExamples">
          {{ showExamples ? 'Hide examples' : 'Try an example' }}
        </button>
        <div v-if="showExamples" class="suggestions">
          <button v-for="x in SUGGESTIONS" :key="x" type="button" @click="send(x)">{{ x }}</button>
        </div>
        <p v-if="inDashboard" class="hint">Drop an object here to give the agent its context.</p>
      </section>

      <article v-for="m in messages" :key="m.id" :class="['msg', m.role]">
        <template v-if="m.role === 'user'">
          <p v-for="(part, i) in m.parts.filter((p) => p.type === 'text')" :key="i" class="bubble">
            {{ part.text }}
          </p>
        </template>
        <template v-else>
          <template v-for="(b, i) in blocks(m)" :key="i">
            <!-- Sanitized by DOMPurify in markdown(). -->
            <div v-if="b.kind === 'text'" class="answer" v-html="markdown(b.part.text)"></div>

            <section v-else-if="b.kind === 'approval'" class="approval">
              <header>
                <span class="badge ask">Approval needed</span>
                <strong>{{ toolLabel(b.part.toolName) }}</strong>
              </header>
              <p>The agent wants to make this change. Check the values, then decide.</p>
              <dl>
                <template v-for="f in fields(b.part.input)" :key="f.key">
                  <dt>{{ f.key }}</dt>
                  <dd>{{ f.value }}</dd>
                </template>
              </dl>
              <div class="actions">
                <button type="button" class="primary" @click="answer(b.part, true)">Approve</button>
                <button type="button" @click="answer(b.part, false)">Decline</button>
              </div>
            </section>

            <details v-else class="steps" :open="b.parts.some((p) => toolStatus(p).tone !== 'ok')">
              <summary>
                <span class="count">{{ b.parts.length }}</span>
                <span class="step-name">
                  {{
                    b.parts.length === 1
                      ? toolLabel(b.parts[0].toolName)
                      : `${b.parts.length} steps`
                  }}
                </span>
                <span
                  v-if="b.parts.length === 1"
                  :class="['chip-state', toolStatus(b.parts[0]).tone]"
                >
                  {{ toolStatus(b.parts[0]).text }}
                </span>
                <span v-else-if="b.parts.some(failed)" class="chip-state bad">
                  {{ b.parts.filter(failed).length }} failed
                </span>
              </summary>
              <ul>
                <li v-for="p in b.parts" :key="p.toolCallId" :class="toolStatus(p).tone">
                  <details>
                    <summary>
                      <span class="step-dot"></span>
                      <span class="step-name">{{ toolLabel(p.toolName) }}</span>
                      <span :class="['chip-state', toolStatus(p).tone]">
                        {{ toolStatus(p).text }}
                      </span>
                    </summary>
                    <p v-if="failed(p) && reason(p)" class="why">{{ reason(p) }}</p>
                    <p v-if="p.state === 'output-denied'" class="why">
                      {{ p.approval?.reason ?? 'Refused.' }}
                    </p>
                    <pre>{{
                      json({ tool: p.toolName, input: p.input, output: p.output ?? p.errorText })
                    }}</pre>
                  </details>
                </li>
              </ul>
            </details>
          </template>
        </template>
      </article>

      <div v-if="thinking" class="thinking" aria-label="Working">
        <span></span><span></span><span></span>
      </div>
      <div v-if="error" class="notice error">{{ error.message }}</div>
    </main>

    <footer v-show="agent.state === 'ok' && !showSettings" class="composer">
      <div v-if="dropped.length" class="chips">
        <span v-for="d in dropped" :key="d.objectId" class="chip">
          {{ d.displayName }}
          <button
            type="button"
            aria-label="Remove"
            @click="dropped = dropped.filter((x) => x !== d)"
          >
            ×
          </button>
        </span>
      </div>
      <div class="compose-row">
        <button
          type="button"
          class="new"
          title="New conversation"
          aria-label="New conversation"
          :disabled="!messages.length"
          @click="newConversation"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
          </svg>
        </button>
        <form @submit.prevent="send">
          <textarea
            v-model="input"
            rows="1"
            placeholder="Start writing"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <button v-if="busy" type="button" class="send stop" title="Stop" @click="stop">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          </button>
          <button
            v-else
            type="submit"
            class="send"
            title="Send"
            :disabled="!input.trim() || !model"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
          </button>
        </form>
      </div>
      <p class="hint disclaimer">
        The agent may be wrong. Check its answers; nothing changes without your approval.
      </p>
    </footer>
  </div>
</template>
