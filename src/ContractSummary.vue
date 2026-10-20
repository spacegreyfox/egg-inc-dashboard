<script setup lang="ts">
import { computed } from 'vue';
import type { Contract } from '../shared/types.ts';
import { milestoneEstimate, contractPace, lastContractCheck, type EstimateContext } from './contract-progress.ts';
import { age, full, short, percentage, percentText, completionTime, estimateCountdown } from './format.ts';
import MilestoneEta from './MilestoneEta.vue';
import ContractPace from './ContractPace.vue';
const props = withDefaults(defineProps<{ contract: Contract; context: EstimateContext; selected?: boolean; compact?: boolean; controls?: string }>(), { selected: false, compact: false });
defineEmits<{ select: [run: string] }>();
const estimate = computed(() => milestoneEstimate(props.contract, props.context));
const pace = computed(() => contractPace(props.contract, props.context));
const progress = computed(() => percentage(props.contract.metrics.delivered?.value, props.contract.metrics.goal?.value));
const accessibleEstimate = computed(() => { const e=estimate.value; return e.state==='estimate' ? `${e.live?'About '+estimateCountdown(e.estimatedAt!,props.context.now):'Last estimate'}, ${completionTime(e.estimatedAt!,props.context.now)}. ${e.staleReason??e.message}` : e.message; });
const checked = computed(() => lastContractCheck(props.contract,props.context));
</script>

<template>
  <button type="button" class="contract-summary" :class="{selected,compact}" :aria-pressed="controls?selected:undefined" :aria-controls="controls" :aria-label="`View ${contract.name}, ${contract.coop??'solo or awaiting co-op'}. ${estimate.goalNumber!=null?'Next milestone, goal '+estimate.goalNumber+'. ':''}${accessibleEstimate}. ${pace.label}`" @click="$emit('select',contract.segment)">
    <span class="summary-contract-heading"><strong>{{contract.name}}</strong><span class="grade">{{contract.grade}}</span></span>
    <ContractPace :pace="pace" :now="context.now" compact/>
    <span class="summary-coop">{{contract.coop??'Solo / awaiting co-op'}}<span v-if="selected" class="selected-contract-label">Selected</span></span>
    <span class="summary-progress-caption" :title="`${full(contract.metrics.delivered?.value)} / ${full(contract.metrics.goal?.value)} eggs, reported`"><span>{{short(contract.metrics.delivered?.value)}} / {{short(contract.metrics.goal?.value)}} eggs</span><span>{{percentText(progress)}}</span></span>
    <span class="progress-track"><span :style="{width:(progress??0)+'%'}"></span></span>
    <span class="summary-next-goal">{{estimate.state==='complete'?'Milestones':estimate.goalNumber!=null?'Next milestone · Goal '+estimate.goalNumber:'Next milestone'}}<span v-if="estimate.target!=null && estimate.state!=='complete'" :title="full(estimate.target)+' eggs'">{{short(estimate.target)}} eggs</span></span>
    <MilestoneEta :estimate="estimate" :now="context.now" compact/>
    <span v-if="estimate.remaining!=null && estimate.remaining>0" class="summary-remaining" :title="full(estimate.remaining)+' eggs remaining'">{{short(estimate.remaining)}} eggs to go</span>
    <span class="summary-contract-footer"><span :title="contract.endsAt?new Date(contract.endsAt).toLocaleString():'Deadline unavailable'">Deadline <strong>{{contract.endsAt?completionTime(contract.endsAt,context.now):'unavailable'}}</strong></span><span :title="checked?new Date(checked).toLocaleString():'No successful check'">{{contract.coop?'Co-op checked':'Backup checked'}} {{age(checked,context.now)}}</span></span>
  </button>
</template>
