import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import matchesRoutes from './matches.routes.js';
import leaderboardRoutes from './leaderboard.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/matches', matchesRoutes);
router.use('/leaderboard', leaderboardRoutes);

export default router;
