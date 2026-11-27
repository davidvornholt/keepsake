import { useShootContext } from '../app/shoot-context.ts';
import {
  type CarryingState,
  carryingStateOf,
  handedOverSince,
  ledgerOf,
} from './ledger.ts';

/** How what was handed over goes, as keepsake last said. */
export const useCarrying = (): CarryingState => {
  const { index, state } = useShootContext();
  const since = handedOverSince(index.shoot, ledgerOf(index).waiting);
  return carryingStateOf(index.shoot, state.carrying, since);
};
