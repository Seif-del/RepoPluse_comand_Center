const { shouldAlert } = require('../services/notifications/alertDecision');

describe('shouldAlert — pure decision logic', () => {
  it('returns true when alertState is Critical', () => {
    expect(shouldAlert({ alertState: 'Critical', trend: 'Stable' })).toBe(true);
  });

  it('returns true when trend is Worsening regardless of alertState', () => {
    expect(shouldAlert({ alertState: 'Normal', trend: 'Worsening' })).toBe(true);
  });

  it('returns true when both Critical and Worsening', () => {
    expect(shouldAlert({ alertState: 'Critical', trend: 'Worsening' })).toBe(true);
  });

  it('returns false when Normal and Stable', () => {
    expect(shouldAlert({ alertState: 'Normal', trend: 'Stable' })).toBe(false);
  });

  it('returns false when Monitor and Improving', () => {
    expect(shouldAlert({ alertState: 'Monitor', trend: 'Improving' })).toBe(false);
  });
});
