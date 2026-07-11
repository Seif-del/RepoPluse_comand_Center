'use strict';

// Composition router for /api/portfolio — mounts the two domain routers below.
// Split out of a single 1462-line portfolioRoutes.js (Coupling Refinement #3)
// to reduce single-file out-degree/mixed-responsibility risk; no route paths,
// methods, SQL, response shapes, error behavior, caching, or ordering changed.
//
// `authenticate` is applied once, here, exactly as it was applied once at the
// top of the original monolithic router — neither domain router re-applies it,
// so auth still runs exactly once per request.
//
// All 12 routes are static (no `:id`/params) and every path is distinct across
// both domain routers, so there is no route-order collision to defend against —
// mount order (architecture, then governance) simply mirrors the original
// file's top-to-bottom grouping.

const express      = require('express');
const authenticate = require('../middleware/authenticate');

const portfolioArchitectureRoutes = require('./portfolioArchitectureRoutes');
const portfolioGovernanceRoutes   = require('./portfolioGovernanceRoutes');

const router = express.Router();

// All portfolio routes require a valid session.
router.use(authenticate);

router.use(portfolioArchitectureRoutes);
router.use(portfolioGovernanceRoutes);

module.exports = router;
