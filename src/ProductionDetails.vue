<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Contract, Value } from '../shared/types.ts';
import { productionLimit, sortedProduction } from './production.ts';
import { age, full, short } from './format.ts';
const props=defineProps<{contract:Contract;now:number}>();
const key=ref('laying'), direction=ref(-1);
const members=computed(()=>sortedProduction(props.contract.members,key.value,direction.value));
function sort(next:string){if(key.value===next)direction.value*=-1;else{key.value=next;direction.value=-1;}}
const hourly=(value:Value|undefined)=>value==null?null:Number(value)*3600;
</script>
<template>
  <details class="panel production-details">
    <summary>Production details <span class="quiet">Laying versus shipping</span></summary>
    <p class="quiet">Current reported farm capacity, without future growth. Delivery rate remains authoritative. Response checked {{age(contract.checkedAt,now)}}.</p>
    <p v-if="!members.length" class="quiet">Production details appear when a co-op response is available.</p>
    <div v-else class="table-scroll" tabindex="0" role="region" aria-label="Production rates table; scroll horizontally for more columns"><table><thead><tr><th>Farmer</th><th v-for="[metric,label] in [['laying','Laying / hour'],['shipping','Shipping / hour']]" :key="metric" :aria-sort="key===metric?(direction<0?'descending':'ascending'):'none'"><button @click="sort(metric!)">{{label}} {{key===metric?(direction<0?'↓':'↑'):'↕'}}</button></th><th>Limiting factor</th><th>Farm timestamp</th></tr></thead><tbody><tr v-for="m in members" :key="m.id" :class="{me:m.me}"><td><strong>{{m.name}}</strong><span v-if="m.me" class="you-badge">YOU</span></td><td v-for="metric in ['laying','shipping']" :key="metric" :title="full(hourly(m.metrics[metric]?.value))+' eggs/hour · '+(m.metrics[metric]?.source??'unavailable')">{{short(hourly(m.metrics[metric]?.value))}}<small class="production-source">{{m.metrics[metric]?.source??'unavailable'}}</small></td><td>{{productionLimit(m)}}</td><td :title="m.metrics.laying?.at?new Date(m.metrics.laying.at).toLocaleString():'Not reported'">{{age(m.metrics.laying?.at,now)}}</td></tr></tbody></table></div>
  </details>
</template>
