import { Router } from 'express';
import { generateTest, listModels, streamGenerate } from '../controllers/generationController';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/health', getHealth);
router.get('/models', listModels);
router.post('/generate', generateTest);
router.post('/generate-stream', streamGenerate);

export default router;
