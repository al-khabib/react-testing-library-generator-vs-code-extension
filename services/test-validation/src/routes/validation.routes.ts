import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { validateGeneratedTest } from '../controllers/validationController';

const router = Router();

router.get('/health', getHealth);
router.post('/validate', validateGeneratedTest);

export default router;
