import { Router } from 'express';
import { LinkController } from '../controllers/linkController.js';

const router = Router();

router.post('/', LinkController.createLink);
router.get('/', LinkController.getAllLinks);
router.get('/:shortCode/analytics', LinkController.getLinkAnalytics);
router.patch('/:shortCode/toggle', LinkController.toggleLinkStatus);

export default router;
