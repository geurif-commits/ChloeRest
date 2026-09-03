/**
 * @file Router del webhook de Telegram: recibe las actualizaciones del bot y
 * las procesa tras validar el secreto X-Telegram-Bot-Api-Secret-Token. Puerto
 * directo de server.js (legacy, líneas ~174-182). Público (sin requireAuth):
 * debe montarse ANTES del middleware global de autenticación/dispositivo, como
 * en el legacy, donde la ruta se registraba antes de ese middleware.
 */

import { Router, Request, Response } from 'express';
import { route } from '../lib/core.js';
import { validarWebhookSecret, procesarActualizacionWebhook } from '../services/telegramBotService.js';

const router = Router();

// POST /api/telegram/webhook (público): valida el secreto y procesa la actualización
router.post('/api/telegram/webhook', route(async (req: Request, res: Response): Promise<void> => {
  if (!validarWebhookSecret(req.get('x-telegram-bot-api-secret-token'))) {
    res.status(401).json({ error: 'Webhook no autorizado.' });
    return;
  }
  await procesarActualizacionWebhook(req.body);
  res.sendStatus(200);
}));

export default router;
