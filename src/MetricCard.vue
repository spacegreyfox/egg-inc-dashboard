<script setup lang="ts">
import type { Metric } from '../shared/types.ts';
import { short,full,age } from './format.ts';
defineProps<{ metric?:Metric; accent?:boolean; now:number }>();
</script>
<template>
  <article class="metric-card" :class="{accent}" tabindex="0" :title="metric ? `${metric.label}: ${full(metric.value)} ${metric.unit}. ${metric.source}. ${metric.note ?? ''}` : 'Unavailable'">
    <div class="metric-label">{{metric?.label ?? 'Unavailable'}}</div>
    <div class="metric-number">{{short(metric?.value)}}<span v-if="metric?.unit==='%' && metric.value!=null">%</span></div>
    <div class="metric-footer"><span>{{metric?.unit==='%'?'earnings bonus':metric?.unit || 'total'}}</span><span class="source" :class="metric?.source">{{metric?.value==null?'unavailable':metric.source}}</span></div>
    <p v-if="metric?.value==null" class="metric-missing">{{metric?.note??'Not reported in the latest save.'}}</p>
    <div class="metric-detail">{{full(metric?.value)}} {{metric?.unit}}<br>{{age(metric?.at,now)}}<br>{{metric?.note}}</div>
  </article>
</template>
