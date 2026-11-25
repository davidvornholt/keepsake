import { useEffect, useReducer } from 'react';
import { useShootContext } from '../app/shoot-context.ts';
import {
  type AgentState,
  agentPatience,
  agentStateOf,
  handedOverSince,
  ledgerOf,
} from './ledger.ts';

/** A little longer than the patience, so that it has run out for certain. */
const margin = 50;

/**
 * Who acts on what was handed over, kept up to date also when nothing
 * happens: an agent that never says a word is given up on after a while.
 */
export const useAgent = (): AgentState => {
  const { index, state } = useShootContext();
  const [, lookAgain] = useReducer((times: number) => times + 1, 0);
  const shoot = { ...index.shoot, agent: state.agent };
  const since = handedOverSince(shoot, ledgerOf(index).waiting);
  const agent = agentStateOf(shoot, since, Date.now());
  const isStarting = agent.is === 'starting';
  useEffect(() => {
    if (!isStarting || since === null) {
      return;
    }
    const left = Date.parse(since) + agentPatience - Date.now();
    const timer = setTimeout(lookAgain, Math.max(0, left) + margin);
    return () => clearTimeout(timer);
  }, [isStarting, since]);
  return agent;
};

/** Why the owner has to ask an agent, in a sentence. */
export const whyAsk = (agent: Extract<AgentState, { is: 'ask' }>): string => {
  if (agent.failed !== null) {
    const said = agent.failed.trim();
    return `No agent could be started: ${said}${said.endsWith('.') ? '' : '.'}`;
  }
  return agent.isLate
    ? 'No agent has taken it up.'
    : 'No agent can be started from here.';
};
