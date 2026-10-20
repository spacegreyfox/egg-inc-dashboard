<script setup lang="ts">
import type { MilestoneEstimate } from './contract-progress.ts';
import { completionTime, estimateCountdown, age } from './format.ts';
defineProps<{ estimate: MilestoneEstimate; now: number; compact?: boolean }>();
</script>

<template>
  <div class="milestone-eta" :class="{muted:estimate.staleReason,compact,warning:estimate.afterDeadline||estimate.state==='expired'}">
    <template v-if="estimate.state==='estimate'">
      <strong v-if="estimate.live">About {{estimateCountdown(estimate.estimatedAt!,now)}}</strong>
      <strong v-else>Last estimate</strong>
      <span class="eta-absolute" :title="new Date(estimate.estimatedAt!).toLocaleString()">{{completionTime(estimate.estimatedAt!,now)}}</span>
    </template>
    <strong v-else>{{estimate.message}}</strong>
    <span v-if="estimate.estimatedAt!=null && estimate.state!=='estimate'" class="eta-absolute" :title="new Date(estimate.estimatedAt).toLocaleString()">Last estimate · {{completionTime(estimate.estimatedAt,now)}}</span>
    <span v-if="estimate.estimatedAt!=null" class="eta-assumption"><span class="source estimated">estimated</span> {{estimate.afterDeadline?'After deadline at current rate':'at the last reported rate'}}</span>
    <span v-if="estimate.staleReason" class="eta-freshness">{{estimate.staleReason}} · reading {{age(estimate.observedAt,now)}}</span>
  </div>
</template>
