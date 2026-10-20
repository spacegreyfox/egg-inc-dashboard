<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue';
import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Filler } from 'chart.js';
import type { HistoryPoint } from '../shared/types.ts';
import { trendData, type TrendDatum, type HistoryLine } from './chart-data.ts';
import { short, full } from './format.ts';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler);
const props = withDefaults(defineProps<{ points?: HistoryPoint[]; series?: HistoryLine[]; label: string; unit: string; metricKey: string }>(), { points: () => [] });
const canvas = ref<HTMLCanvasElement>();
const lines = computed(() => props.series ?? [{ id: 'primary', label: props.label, color: '#b5d98b', points: props.points }]);
const datasets = computed(() => lines.value.map(line => ({ ...line, data: trendData(line.points, props.metricKey) })));
const hasGaps = computed(() => datasets.value.some(line => line.data.some(p => p.gapBefore)));
const observations = computed(() => lines.value.reduce((n, line) => n + line.points.length, 0));
let chart: Chart<'line', TrendDatum[]> | undefined;
function render() {
  chart?.destroy();
  if (!canvas.value) return;
  chart = new Chart(canvas.value, {
    type: 'line',
    data: { datasets: datasets.value.map(line => ({
      label: line.label, data: line.data, parsing: false,
      borderColor: line.color, backgroundColor: 'rgba(181,217,139,.065)',
      fill: !props.series, borderWidth: 2, pointRadius: line.points.length < 120 ? 3 : 1,
      pointStyle: line.pointStyle ?? 'circle',
      pointBackgroundColor: line.color, pointHoverRadius: 5, pointHitRadius: 8,
      spanGaps: false, tension: 0,
      segment: {
        borderDash: context => line.data[context.p1DataIndex]?.gapBefore ? [7, 5] : undefined,
      },
    })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { intersect: false, mode: 'nearest' },
      plugins: { tooltip: {
        backgroundColor: '#22303c', padding: 12, displayColors: false,
        callbacks: {
          title: items => new Date(Number(items[0]?.parsed.x)).toLocaleString(),
          label: context => { const p = (context.raw as TrendDatum).original; return `${props.series ? context.dataset.label + ': ' : ''}${full(p?.value)} ${props.unit} · ${p?.source}${p?.origin === 'backup' ? ' · game backup' : p?.origin === 'coop' ? ' · co-op' : ''}${p?.timeBasis === 'checked' ? ' · check time' : ''}`; },
        },
      } },
      scales: {
        x: { type: 'linear', grid: { color: '#26303a' }, border: { display: false }, ticks: { color: '#8d9ca9', maxTicksLimit: 6, callback: v => new Date(Number(v)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } },
        y: { grid: { color: '#26303a' }, border: { display: false }, ticks: { color: '#8d9ca9', maxTicksLimit: 5, callback: v => short(Number(v)) } },
      },
    },
  });
}
onMounted(render);
watch(() => [props.points, props.series, props.label, props.unit, props.metricKey], render);
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="chart-wrap"><canvas ref="canvas" role="img" :aria-label="`${label} history, ${observations} observations. Lines connect observations within a farm run; dashed lines mark collection gaps. Exact values are available in History.`"></canvas></div>
  <div class="trend-legend"><template v-if="series"><span v-for="line in lines" :key="line.id"><i :style="{borderColor:line.color}"></i>{{line.label}}</span></template><span v-else><i></i>Recorded trend</span><span v-if="hasGaps"><i class="gap"></i>Collection gap</span><span class="trend-unit">{{unit}}</span></div>
</template>
