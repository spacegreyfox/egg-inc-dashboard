<script setup lang="ts">
import { computed } from 'vue';
import type { Metric } from '../shared/types.ts';
import { habitatUsage } from './chart-data.ts';
import { full, short, percentText } from './format.ts';

const props = defineProps<{ population?: Metric; capacity?: Metric }>();
const usage = computed(() => habitatUsage(props.population?.value, props.capacity?.value));
const percent = computed(() => percentText(usage.value?.percent ?? null));
function detail(metric?: Metric) {
  return `${full(metric?.value)} chickens · ${metric?.source ?? 'unavailable'}${metric?.at ? ' · '+new Date(metric.at).toLocaleString() : ''}`;
}
</script>

<template>
  <div class="habitat-summary">
    <div class="habitat-ring" tabindex="0" :aria-label="`Habitat occupancy: ${percent}. Population: ${detail(population)}. Capacity: ${detail(capacity)}.`" :title="`${detail(population)} / ${detail(capacity)}`">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="habitat-track" cx="60" cy="60" r="50" />
        <circle v-if="usage" class="habitat-used" cx="60" cy="60" r="50" pathLength="100" :stroke-dasharray="`${usage.percent} ${100-usage.percent}`" transform="rotate(-90 60 60)" />
      </svg>
      <div class="habitat-center"><strong>{{usage ? percent : '—'}}</strong><span>{{usage ? 'occupied' : 'unavailable'}}</span></div>
    </div>
    <div class="habitat-details">
      <div class="habitat-label">Habitat occupancy</div>
      <div class="habitat-legend" tabindex="0" :title="detail(population)"><span class="chart-swatch occupied"></span><span>Population</span><strong>{{short(population?.value)}}</strong></div>
      <div class="habitat-legend" tabindex="0" :title="usage ? `${full(usage.available)} chickens available` : 'Available space is unknown'"><span class="chart-swatch available"></span><span>Available</span><strong>{{short(usage?.available)}}</strong></div>
      <div class="habitat-total" tabindex="0" :title="detail(capacity)">{{short(capacity?.value)}} total capacity <span>chickens</span></div>
    </div>
  </div>
  <p class="habitat-source">Saved population · calculated capacity</p>
</template>
