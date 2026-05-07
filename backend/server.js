'use strict';

const express       = require('express');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');
const authRoutes    = require('./routes/authRoutes');

const app = express();

// Placeholder locals — overridden by the process entry point before serving traffic.
app.locals.db     = null;
app.locals.config = null;

// 1. Correlation ID + request logging (must be first)
app.use(requestLogger);

// 2. Body parsing
app.use(express.json());

// 3. Auth routes (public — no authentication guard)
app.use('/auth', authRoutes);

// 4. Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 5. Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
