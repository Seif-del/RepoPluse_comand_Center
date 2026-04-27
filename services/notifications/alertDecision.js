/**
 * alertDecision
 *
 * Pure function. Returns true when a snapshot warrants an alert notification.
 * Criteria: alertState is 'Critical' OR trend is 'Worsening'.
 *
 * @param {{ alertState: string, trend: string }} summary
 * @returns {boolean}
 */
function shouldAlert(summary) {
  return summary.alertState === 'Critical' || summary.trend === 'Worsening';
}

module.exports = { shouldAlert };
