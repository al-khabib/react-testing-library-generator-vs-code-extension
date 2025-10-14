import { Router } from 'express';
import { analyzeComponent } from '../controllers/analysisController';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/health', getHealth);
router.post('/analyze', analyzeComponent);

export default router;
