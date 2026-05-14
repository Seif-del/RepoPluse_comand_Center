'use strict';

const express              = require('express');
const authenticate         = require('../middleware/authenticate');
const { getPortfolioForecast } = require('../../execution/risk/getPortfolioForecast');

const router = express.Router();

router.use(authenticate);

// GET /api/portfolio/forecast
// Derives a portfolio-level operational trajectory by querying the latest
// risk score and recent history for every active repo, then aggregating
// via getPortfolioForecast. Returns a deterministic forecast object.
router.get('/forecast', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id       AS "repoId",
         rs.label,
         rs.trend,
         ARRAY(
           SELECT label
           FROM   risk_scores rsi
           WHERE  rsi.repo_id = r.id
           ORDER  BY rsi.snapshot_at DESC
           LIMIT  3
         ) AS "recentLabels"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT label, trend
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rs ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const repos = result.rows.map(function(r) {
      var label        = r.label  || '';
      var trend        = r.trend  || 'unknown';
      var recentLabels = Array.isArray(r.recentLabels) ? r.recentLabels : [];

      // Derive trajectory from the stored label + trend combination.
      var trajectory;
      if (!r.label || !r.trend) {
        trajectory = 'unknown';
      } else if (label === 'critical' && trend === 'worsening') {
        trajectory = 'escalating';
      } else if (label === 'at-risk' && trend === 'worsening') {
        trajectory = 'deteriorating';
      } else if (trend === 'improving') {
        trajectory = 'recovering';
      } else {
        trajectory = 'stable';
      }

      var FORECAST_MAP = {
        escalating:    'critical',
        deteriorating: 'high',
        recovering:    'medium',
        stable:        'low',
        unknown:       'unknown',
      };

      var escalationLevel = (label === 'critical' && trend === 'worsening') ? 'critical'
                          : trend === 'worsening'                           ? 'high'
                          : 'none';

      // persistentRisk: true when the 3 most-recent snapshots are all at-risk/critical.
      var persistentRisk = recentLabels.length >= 3 &&
        recentLabels.slice(0, 3).every(function(l) {
          return l === 'at-risk' || l === 'critical';
        });

      return {
        repoId:          r.repoId,
        trajectory:      trajectory,
        forecastLevel:   FORECAST_MAP[trajectory] || 'unknown',
        escalationLevel: escalationLevel,
        volatilityLevel: 'low',
        persistentRisk:  persistentRisk,
      };
    });

    res.json(getPortfolioForecast(repos));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
