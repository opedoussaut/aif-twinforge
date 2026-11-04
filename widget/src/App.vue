<script setup>
import { computed, onMounted, ref } from 'vue';
import { useChat } from '@ai-sdk/vue';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { acceptDrops, inDashboard, preference } from './platform';

const agentUrl = preference('agentUrl').replace(/\/+$/, '');
const models = ref([]);
const model = ref('');
const agent = ref({ state: 'checking', text: 'Connecting to the agent…' });
const input = ref('');
const dropped = ref([]);
const surface = ref(null);

const { messages, sendMessage, addToolApprovalResponse, status, error, stop } = useChat({
  transport: new DefaultChatTransport({
    api: `${agentUrl}/agent/chat`,
    body: () => ({ model: model.value }),
  }),
  // After the user answers every approval, the agent continues on its own.
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
});

const selected = computed(() => models.value.find((m) => m.id === model.value));
const busy = computed(() => status.value === 'submitted' || status.value === 'streaming');

async function connect() {
  agent.value = { state: 'checking', text: 'Connecting to the agent…' };
  try {
    const [s, m] = await Promise.all([
      fetch(`${agentUrl}/agent/status`).then((r) => r.json()),
      fetch(`${agentUrl}/agent/models`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ]);
    models.value = m.models;
    const wanted = preference('defaultModel');
    model.value =
      m.models.find((x) => x.id === wanted)?.id ??
      m.models.find((x) => x.fullChain)?.id ??
      m.models[0]?.id ??
      '';
    const tools = s.connectors.map((c) => `${c.name} (${c.tools} tools)`).join(' · ');
    agent.value = s.ready
      ? { state: 'ok', text: `Connected · ${tools}` }
      : { state: 'error', text: s.blockers.join(' ') };
  } catch {
    agent.value = {
      state: 'error',
      text: `The agent at ${agentUrl} cannot be reached. Start it with "npm run agent", and check the widget's origin is allowed.`,
    };
  }
}

onMounted(() => {
  connect();
  acceptDrops(surface.value, (items) => {
    for (const i of items)
      if (!dropped.value.some((d) => d.objectId === i.objectId)) dropped.value.push(i);
  });
});

function send() {
  const text = input.value.trim();
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

const json = (v) => JSON.stringify(v, null, 2);
// The agent runs a call and the connector refuses it (bad input, wrong stage): not "done".
const failed = (part) => part.state === 'output-error' || part.output?.error === true;
const reason = (part) => {
  const r = part.output?.result;
  return part.errorText ?? (typeof r === 'string' ? r : (r?.error ?? r?.message ?? ''));
};
const answer = (part, approved) =>
  addToolApprovalResponse({
    id: part.approval.id,
    approved,
    reason: approved ? 'Approved in the widget' : 'Declined in the widget',
  });
</script>

<template>
  <div ref="surface" class="agent">
    <header class="bar">
      <div class="title">
        <strong>AI factory agent</strong>
        <span :class="['dot', agent.state]" :title="agent.text"></span>
      </div>
      <label class="model">
        <span>Model</span>
        <select v-model="model" :disabled="busy || !models.length">
          <option v-for="m in models" :key="m.id" :value="m.id">
            {{ m.id }} — {{ m.fullChain ? 'full chain' : 'read only' }}
          </option>
        </select>
      </label>
    </header>

    <p v-if="agent.state === 'error'" class="notice error">
      {{ agent.text }} <button type="button" @click="connect">Retry</button>
    </p>
    <p v-else-if="selected && !selected.fullChain" class="notice">
      {{ selected.id }} can read ITEROP and the system model. Changes need a full-chain model.
    </p>

    <main class="log" aria-live="polite">
      <p v-if="!messages.length" class="empty">
        Ask about your processes and tasks, or start an engineering change.
        <template v-if="inDashboard">Drop an object here to give the agent its context.</template>
      </p>
      <article v-for="m in messages" :key="m.id" :class="['msg', m.role]">
        <template v-for="(part, i) in m.parts" :key="i">
          <p v-if="part.type === 'text'" class="text">{{ part.text }}</p>

          <section
            v-else-if="part.type === 'dynamic-tool'"
            :class="['tool', part.state, { failed: failed(part) }]"
          >
            <div class="tool-head">
              <code>{{ part.toolName }}</code>
              <span class="state">
                {{
                  failed(part)
                    ? 'failed'
                    : ({
                        'input-streaming': 'preparing',
                        'input-available': 'running',
                        'approval-requested': 'waiting for you',
                        'approval-responded': part.approval?.approved ? 'approved' : 'declined',
                        'output-available': part.approval?.approved
                          ? 'done · approved by you'
                          : 'done',
                        'output-error': 'error',
                        'output-denied': 'refused',
                      }[part.state] ?? part.state)
                }}
              </span>
            </div>

            <div v-if="part.state === 'approval-requested'" class="approve">
              <p>The agent wants to make this change. Check the values, then decide.</p>
              <pre>{{ json(part.input) }}</pre>
              <div class="actions">
                <button type="button" class="primary" @click="answer(part, true)">Approve</button>
                <button type="button" @click="answer(part, false)">Decline</button>
              </div>
            </div>
            <p v-else-if="part.state === 'output-denied'" class="denied">
              {{ part.approval?.reason ?? 'Refused.' }}
            </p>
            <details
              v-else-if="part.state === 'output-available' || part.state === 'output-error'"
              :open="failed(part)"
            >
              <summary>{{ failed(part) ? reason(part) || 'Details' : 'Details' }}</summary>
              <pre>{{ json({ input: part.input, output: part.output ?? part.errorText }) }}</pre>
            </details>
          </section>
        </template>
      </article>
      <p v-if="error" class="notice error">{{ error.message }}</p>
    </main>

    <footer class="composer">
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
      <form @submit.prevent="send">
        <textarea
          v-model="input"
          rows="2"
          placeholder="Hall B is expanding to 24 racks and 1.8 MW. Prepare the change."
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <button v-if="busy" type="button" @click="stop">Stop</button>
        <button v-else type="submit" class="primary" :disabled="!input.trim() || !model">
          Send
        </button>
      </form>
    </footer>
  </div>
</template>
