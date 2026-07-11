'use strict';

// Composition router for /api/repos — mounts the three domain routers below.
// Split out of a single 1526-line repoRoutes.js (Coupling Refinement #2) to
// reduce single-file out-degree/mixed-responsibility risk; no route paths,
// methods, middleware, SQL, response shapes, or error behavior changed.
//
// `authenticate` is applied once, here, exactly as it was applied once at the
// top of the original monolithic router — none of the three domain routers
// re-apply it, so auth still runs exactly once per request.
//
// Mount order (core, then risk, then architecture) matches the original
// file's top-to-bottom route order for the static/collection-level paths
// (/, /attention, /summary, /register, /sync) that must not be shadowed by
// any parameterized route. In this route set no bare `/:id` route exists in
// any domain router, so no literal shadowing is possible regardless of
// order — the ordering below is kept anyway as defensive convention.

const express     = require('express');
const authenticate = require('../middleware/authenticate');

const repoCoreRoutes         = require('./repoCoreRoutes');
const repoRiskRoutes         = require('./repoRiskRoutes');
const repoArchitectureRoutes = require('./repoArchitectureRoutes');

const router = express.Router();

// All repo routes require a valid session.
router.use(authenticate);

router.use('/', repoCoreRoutes);
router.use('/', repoRiskRoutes);
router.use('/', repoArchitectureRoutes);

module.exports = router;
