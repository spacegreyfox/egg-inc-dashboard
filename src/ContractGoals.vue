<script setup lang="ts">
import { computed } from 'vue';
import type { Metric } from '../shared/types.ts';
import { goalMilestones } from './contract-goals.ts';
import { full, short, percentage, percentText } from './format.ts';

const props = defineProps<{ goals: number[]; delivered?: Metric; finalGoal?: Metric }>();
const milestones = computed(() => goalMilestones(props.goals, props.delivered?.value, props.finalGoal?.value));
const progress = computed(() => percentage(props.delivered?.value, props.finalGoal?.value));
const flagHeight = computed(() => 40 + Math.max(0, ...milestones.value.map(m => m.level)) * 23);
type Milestone = ReturnType<typeof goalMilestones>[number];
const status = (milestone: Milestone) => milestone.reached == null ? 'Progress unavailable' : milestone.reached ? 'Reached' : milestone.next ? 'Next milestone' : 'Upcoming';
const detail = (milestone: Milestone) => `Goal ${milestone.number}: ${full(milestone.target)} eggs. ${status(milestone)}.${milestone.remaining == null ? '' : ` ${full(milestone.remaining)} eggs to go.`}`;
</script>

<template>
  <div class="contract-goals">
    <div class="split goal-progress-label"><span>{{short(delivered?.value)}} reported delivered</span><strong>{{percentText(progress)}} <template v-if="progress!=null">of final goal</template></strong></div>
    <div class="milestone-track" :style="{paddingTop:flagHeight+'px'}">
      <div class="progress-track large" role="progressbar" aria-label="Contract eggs delivered" :aria-valuenow="progress??undefined" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="progress==null?'Reported delivery progress unavailable':`${full(delivered?.value)} of ${full(finalGoal?.value)} eggs`"><span :style="{width:(progress??0)+'%'}"></span></div>
      <template v-for="milestone in milestones" :key="milestone.number">
        <button v-if="milestone.position!=null" type="button" class="goal-flag" :class="{reached:milestone.reached,next:milestone.next}" :style="{left:milestone.position+'%',height:(35+milestone.level*23)+'px'}" :aria-label="detail(milestone)">
          <span class="goal-pole" aria-hidden="true"></span><span class="goal-pennant" aria-hidden="true">{{milestone.number}}</span>
          <span class="milestone-tooltip" :class="{edgeStart:milestone.position<20,edgeEnd:milestone.position>80}">{{detail(milestone)}}</span>
        </button>
      </template>
    </div>
    <ol v-if="milestones.length" class="milestone-cards" aria-label="Contract goal milestones">
      <li v-for="milestone in milestones" :key="milestone.number" :class="{reached:milestone.reached,next:milestone.next}" tabindex="0" :aria-label="detail(milestone)">
        <div class="milestone-name"><span>Goal {{milestone.number}}</span><span class="milestone-status"><span aria-hidden="true">{{milestone.reached?'✓':milestone.next?'⚑':'○'}}</span> {{status(milestone)}}</span></div>
        <strong>{{short(milestone.target)}} <small>eggs</small></strong>
        <span class="milestone-remaining">{{milestone.remaining==null?'Waiting for reported delivery':milestone.reached?'Target delivered':short(milestone.remaining)+' eggs to go'}}</span>
        <span class="milestone-tooltip">{{detail(milestone)}}</span>
      </li>
    </ol>
  </div>
</template>
