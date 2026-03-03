import { DashboardState, DashboardEvent, DashboardContextData } from '../types';
import { logger } from '../../../utils/logger';

export const initialDashboardState: DashboardContextData = {
  state: 'IDLE',
  activeFeatureId: null,
  activeFeatureProps: {},
  activeSubject: null,
  momentum: 50,
  lastActionTimestamp: Date.now(),
};

const _reducer = (
  ctx: DashboardContextData, 
  event: DashboardEvent
): DashboardContextData => {
  switch (event.type) {
    case 'PRIME_SUBJECT':
      if (ctx.state === 'FLOW') return ctx;
      return {
        ...ctx,
        state: 'PRIMED',
        activeSubject: event.subject,
        lastActionTimestamp: Date.now(),
      };

    case 'OPEN_FEATURE':
      return {
        ...ctx,
        state: 'FLOW',
        activeFeatureId: event.featureId,
        activeFeatureProps: event.props || {},
        momentum: Math.min(100, ctx.momentum + 10),
        lastActionTimestamp: Date.now(),
      };

    case 'CLOSE_FEATURE':
      // Return to IDLE unless we need Recovery
      const exitState = ctx.state === 'FRICTION' ? 'RECOVERY' : 'IDLE';
      return {
        ...ctx,
        state: exitState,
        activeFeatureId: null,
        activeFeatureProps: {},
        lastActionTimestamp: Date.now(),
      };

    case 'REPORT_FRICTION':
    case 'TELEMETRY_FRICTION':
      const newMomentumFriction = Math.max(0, ctx.momentum - 20);
      return {
        ...ctx,
        state: newMomentumFriction < 30 ? 'FRICTION' : ctx.state, // Only enter friction state if momentum drops low
        momentum: newMomentumFriction,
      };

    case 'TELEMETRY_FLOW':
      return {
        ...ctx,
        state: 'FLOW',
        momentum: Math.min(100, ctx.momentum + 15),
        lastActionTimestamp: Date.now(),
      };

    case 'TELEMETRY_RECOVERY':
      return {
        ...ctx,
        state: 'RECOVERY',
        momentum: 40, // Reset to baseline
      };

    case 'RESOLVE_FRICTION':
      return {
        ...ctx,
        state: 'FLOW',
        momentum: Math.min(100, ctx.momentum + 10),
      };

    case 'IDLE_TIMEOUT':
      if (ctx.state === 'FLOW') return ctx;
      return {
        ...ctx,
        state: 'IDLE',
        activeSubject: null,
        momentum: Math.max(0, ctx.momentum - 5),
      };

    default:
      return ctx;
  }
};

export const dashboardReducer = (
  ctx: DashboardContextData, 
  event: DashboardEvent
): DashboardContextData => {
  const nextCtx = _reducer(ctx, event);
  if (ctx.state !== nextCtx.state || ctx.activeSubject !== nextCtx.activeSubject || ctx.activeFeatureId !== nextCtx.activeFeatureId) {
    logger.state(`${ctx.state} -> [${event.type}] -> ${nextCtx.state}`, {
      prev: { state: ctx.state, subject: ctx.activeSubject, feature: ctx.activeFeatureId, momentum: ctx.momentum },
      event,
      next: { state: nextCtx.state, subject: nextCtx.activeSubject, feature: nextCtx.activeFeatureId, momentum: nextCtx.momentum }
    });
  }
  return nextCtx;
};
