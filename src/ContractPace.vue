<script setup lang="ts">
import type { ContractPace } from './contract-progress.ts';
import { age, duration, full, short } from './format.ts';
defineProps<{ pace: ContractPace; now: number; compact?: boolean }>();
const icons = { 'on-track': '✓', 'little-margin': '◷', behind: '!', complete: '✓', unknown: '?', awaiting: '◷', expired: '!' };
</script>
<template>
  <div class="contract-pace" :class="{compact}">
    <span class="pace-badge" :class="pace.state"><span aria-hidden="true">{{icons[pace.state]}}</span> {{pace.label}}</span>
    <template v-if="pace.state!=='complete'">
      <span class="pace-rates"><span :title="full(pace.currentRate==null?null:pace.currentRate*3600)+' eggs/hour, reported'">Current {{short(pace.currentRate==null?null:pace.currentRate*3600)}}</span><span :title="full(pace.requiredRate==null?null:pace.requiredRate*3600)+' eggs/hour, calculated at the reading'">Required {{short(pace.requiredRate==null?null:pace.requiredRate*3600)}}</span><small>eggs/hour</small></span>
      <span v-if="pace.marginSeconds!=null" class="pace-margin" :title="full(Math.abs(pace.marginSeconds))+' seconds'">{{pace.state==='unknown'||pace.state==='awaiting'||pace.state==='expired'?'Last margin: ':''}}{{pace.marginSeconds===0?'At the deadline':duration(Math.abs(pace.marginSeconds))+(pace.marginSeconds>0?' before deadline':' after deadline')}}</span>
      <span v-if="pace.lastAssessment" class="quiet">Last assessment: {{pace.lastAssessment}}</span>
      <span v-if="pace.reason" class="eta-freshness">{{pace.reason}}</span>
      <span class="pace-assumption" :title="pace.observedAt?new Date(pace.observedAt).toLocaleString():'Timestamp unavailable'">At the last reported rate · reading {{age(pace.observedAt,now)}}</span>
    </template>
  </div>
</template>
