import { describe, it, expect } from 'vitest';
import { MatchService } from '../services/match.service.js';
import { config } from '../config/index.js';

describe('MatchService', () => {
  describe('calculateElo', () => {
    const { kFactor, minRating } = config.elo;

    it('should calculate correct ELO for equal-rated players', () => {
      const result = MatchService.calculateElo(1000, 1000);
      
      // Winner should gain, loser should lose
      expect(result.winner_new_elo).toBeGreaterThan(1000);
      expect(result.loser_new_elo).toBeLessThan(1000);
      
      // With K=32, expected change is 16 for equal ratings
      expect(result.elo_change).toBe(16);
      expect(result.winner_new_elo).toBe(1016);
      expect(result.loser_new_elo).toBe(984);
    });

    it('should give less ELO when higher rated player wins', () => {
      const result = MatchService.calculateElo(1200, 1000);
      
      // Higher rated winner should gain less
      expect(result.elo_change).toBeLessThan(16);
      expect(result.winner_new_elo - 1200).toBeLessThan(16);
    });

    it('should give more ELO when lower rated player wins (upset)', () => {
      const result = MatchService.calculateElo(1000, 1200);
      
      // Lower rated winner should gain more
      expect(result.elo_change).toBeGreaterThan(16);
      expect(result.winner_new_elo - 1000).toBeGreaterThan(16);
    });

    it('should handle large rating differences', () => {
      // Much higher rated player wins
      const highWins = MatchService.calculateElo(1500, 1000);
      expect(highWins.elo_change).toBeLessThan(5); // Very small gain
      
      // Much lower rated player wins (major upset)
      const lowWins = MatchService.calculateElo(1000, 1500);
      expect(lowWins.elo_change).toBeGreaterThan(25); // Large gain
    });

    it('should not allow rating to go below minimum', () => {
      // Very low rated loser
      const result = MatchService.calculateElo(1200, 105);
      
      expect(result.loser_new_elo).toBeGreaterThanOrEqual(minRating);
    });

    it('should be symmetric in ELO change', () => {
      const result1 = MatchService.calculateElo(1100, 1000);
      const result2 = MatchService.calculateElo(1000, 1100);
      
      // The ELO change magnitude should reflect the upset factor
      expect(result2.elo_change).toBeGreaterThan(result1.elo_change);
    });

    it('should handle edge case of minimum rating winner', () => {
      const result = MatchService.calculateElo(100, 1000);
      
      // Should still calculate properly
      expect(result.winner_new_elo).toBeGreaterThan(100);
      expect(result.loser_new_elo).toBeLessThan(1000);
      expect(result.loser_new_elo).toBeGreaterThanOrEqual(minRating);
    });

    it('should maintain rating total approximately', () => {
      // Total ELO in system should remain roughly constant
      // (slight variations due to minimum floor)
      const result = MatchService.calculateElo(1200, 1100);
      
      const before = 1200 + 1100;
      const after = result.winner_new_elo + result.loser_new_elo;
      
      // Should be within rounding error (±1)
      expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateElo edge cases', () => {
    it('should handle maximum reasonable rating difference', () => {
      // 2000 point difference
      const result = MatchService.calculateElo(2500, 500);
      
      // With extreme differences, winner gains very little (can be 0 due to rounding)
      expect(result.winner_new_elo).toBeGreaterThanOrEqual(2500);
      // Loser loses, but may hit the floor at minRating
      expect(result.loser_new_elo).toBeLessThanOrEqual(500);
      expect(result.loser_new_elo).toBeGreaterThanOrEqual(config.elo.minRating);
    });

    it('should handle very high ratings', () => {
      const result = MatchService.calculateElo(3000, 2900);
      
      expect(result.winner_new_elo).toBeGreaterThan(3000);
      expect(result.loser_new_elo).toBeLessThan(2900);
    });

    it('should produce integer results', () => {
      const result = MatchService.calculateElo(1234, 1156);
      
      expect(Number.isInteger(result.winner_new_elo)).toBe(true);
      expect(Number.isInteger(result.loser_new_elo)).toBe(true);
      expect(Number.isInteger(result.elo_change)).toBe(true);
    });
  });
});
