/**
 * @file Ping Router
 * Simple test endpoint
 */

import { Router } from 'express';
import { route } from '../lib/core.js';

const router = Router();

router.get(
  '/',
  route(async (_req, res) => {
    res.json({
      status: 'pong',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  })
);

export default router;
