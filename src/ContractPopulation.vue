<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Contract, Farm, HistoryPoint, HistoryResult } from '../shared/types.ts';
import HistoryChart from './HistoryChart.vue';
import { populationLines, populationTracks } from './contract-population.ts';
import { full, short } from './format.ts';
import { habitatStatus } from './chart-data.ts';

const props = defineProps<{ contract: Contract; farm?: Farm }>();
const emit = defineEmits<{ history: [entity: string] }>();
const hours = ref('24'), partnerId = ref(''), loading = ref(false), error = ref('');
const histories = ref<Record<string, HistoryPoint[]>>({});
const end = ref(Date.now());
const start = computed(() => end.value - Number(hours.value) * 3600000);
const partners = computed(() => props.contract.members.filter(m => !m.me).sort((a, b) => a.name.localeCompare(b.name)));
watch(() => props.contract.segment, () => { histories.value = {}; partnerId.value = ''; });
watch(partners, members => {
  if (!members.some(m => m.id === partnerId.value)) partnerId.value = members[0]?.id ?? '';
}, { immediate: true });
const tracks = computed(() => populationTracks(props.contract, props.farm, partnerId.value));
const lines = computed(() => populationLines(tracks.value, histories.value, start.value, end.value));
const occupancy = computed(() => Object.fromEntries(tracks.value.map(track => [track.entity, habitatStatus(track.metric?.value, track.capacity?.value)])));
const hasPoints = computed(() => lines.value.some(line => line.points.some(p => p.value != null)));
const needsMore = computed(() => lines.value.some(line => line.points.filter(p => p.value != null).length < 2));
const checkTime = computed(() => lines.value.some(line => line.points.some(p => p.timeBasis === 'checked')));
let request = 0, controller: AbortController | undefined;
async function load() {
  const current = ++request;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal;
  loading.value = true; error.value = ''; end.value = Date.now();
  const selected = [...new Set(tracks.value.flatMap(track => [track.entity, ...(track.backup ? [track.backup.entity] : [])]))];
  const results = await Promise.allSettled(selected.map(async entity => {
    const query = new URLSearchParams({ entity, key: 'population', from: String(start.value), to: String(end.value) });
    const response = await fetch('/api/history?' + query, { signal });
    if (!response.ok) throw new Error('Population history could not be loaded.');
    const data: HistoryResult = await response.json();
    return { entity, points: data.points };
  }));
  if (current !== request) return;
  const updated = { ...histories.value };
  for (const result of results) {
    if (result.status === 'fulfilled') updated[result.value.entity] = result.value.points;
    else if (!signal.aborted) error.value = 'Some history is unavailable. The latest reported populations remain visible.';
  }
  histories.value = updated; loading.value = false;
}
watch([() => props.contract, () => props.farm, partnerId, hours], () => void load(), { immediate: true });
onBeforeUnmount(() => { request++; controller?.abort(); });
function timestamp(track: (typeof tracks.value)[number]) {
  const at = track.metric?.at ?? track.checkedAt;
  return at ? `${track.metric?.at ? 'Farm timestamp' : 'Co-op checked'} · ${new Date(at).toLocaleString()}` : 'Timestamp unavailable';
}
</script>

<template>
  <section class="panel contract-population" :aria-busy="loading">
    <div class="panel-heading">
      <div><div class="eyebrow">GROWING TOGETHER</div><h2>Contract population over time</h2></div>
      <div class="population-controls">
        <label v-if="partners.length > 1">Compare with<select v-model="partnerId"><option v-for="member in partners" :key="member.id" :value="member.id">{{member.name}}</option></select></label>
        <label>Time range<select v-model="hours"><option value="1">Last hour</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></label>
      </div>
    </div>
    <p v-if="error" class="population-warning" role="status">{{error}}</p>
    <HistoryChart v-if="hasPoints" :series="lines" label="Contract population" unit="chickens" metric-key="population" />
    <div v-else class="chart-empty">{{loading ? 'Loading population history…' : 'No population readings in this range.'}}<span>Reported readings appear after the game syncs and the collector checks this contract.</span></div>
    <div v-if="tracks.length" class="population-readings">
      <div v-for="track in tracks" :key="track.entity">
        <div class="population-farmer"><span class="population-marker" :class="track.pointStyle" :style="{background:track.color}"></span>{{track.label}}<span v-if="occupancy[track.entity]?.isFull" class="hab-full-badge">✓ Habs full</span></div>
        <strong tabindex="0" :title="`${full(track.metric?.value)} chickens · reported`" :aria-label="`${track.label}: ${full(track.metric?.value)} chickens, reported`">{{short(track.metric?.value)}} <small>chickens</small></strong>
        <div class="population-capacity" tabindex="0" :title="`${full(track.capacity?.value)} chickens · ${track.capacity?.source??'unavailable'}`" :aria-label="`Habitat capacity: ${full(track.capacity?.value)} chickens`"><span>Hab capacity</span><strong>{{short(track.capacity?.value)}} <small>chickens</small></strong></div>
        <div class="hab-occupancy" :class="{full:occupancy[track.entity]?.isFull}">
          <div class="progress-track" role="progressbar" :aria-label="`${track.label} habitat occupancy`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="occupancy[track.entity]?.percent" :aria-valuetext="occupancy[track.entity]?.isFull?'Habs full':occupancy[track.entity]?.label??'Occupancy unavailable'"><span :style="{width:(occupancy[track.entity]?.percent??0)+'%',background:occupancy[track.entity]?.isFull?'var(--green)':track.color}"></span></div>
          <div class="split"><span>{{occupancy[track.entity]?occupancy[track.entity]!.label+' occupied':'Occupancy unavailable'}}</span><span>{{occupancy[track.entity]?short(occupancy[track.entity]!.available)+' spaces left':'Space remaining unavailable'}}</span></div>
        </div>
        <span class="quiet">{{timestamp(track)}}</span>
        <button class="text-link" @click="emit('history',track.entity)">View saved readings →</button>
      </div>
    </div>
    <p class="panel-note">Blue circles show your farm; red triangles show your partner. Only this contract run is shown. Your earlier saved-backup readings are included when available. <template v-if="checkTime">Some farm timestamps are unavailable, so those readings use the co-op check time.</template> <template v-if="needsMore">Lines appear after a second reading; earlier partner history cannot be reconstructed.</template> <template v-if="!partners.length">Partner data appears after joining a co-op.</template> Dashed lines mark collection gaps. “Habs full” means reported population has reached the known capacity. Population is reported, without projected growth.</p>
  </section>
</template>
