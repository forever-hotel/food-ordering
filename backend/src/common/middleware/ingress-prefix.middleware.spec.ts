import { describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

import {
  createIngressPrefixMiddleware,
  getValidatedApiPrefix,
} from './ingress-prefix.middleware.js';

describe('ingressPrefixMiddleware', () => {
  describe('getValidatedApiPrefix', () => {
    it('defaults to "foss" when empty or unset', () => {
      expect(getValidatedApiPrefix(undefined)).toBe('foss');
      expect(getValidatedApiPrefix('')).toBe('foss');
      expect(getValidatedApiPrefix('   ')).toBe('foss');
    });

    it('strips leading and trailing slashes', () => {
      expect(getValidatedApiPrefix('/foss/')).toBe('foss');
      expect(getValidatedApiPrefix('///gateway///')).toBe('gateway');
    });

    it('rejects invalid or unsafe prefix characters and falls back to "foss"', () => {
      expect(getValidatedApiPrefix('../escape')).toBe('foss');
      expect(getValidatedApiPrefix('foss/api')).toBe('foss');
      expect(getValidatedApiPrefix('bad*prefix')).toBe('foss');
    });

    it('accepts valid alphanumeric, hyphen and underscore prefixes', () => {
      expect(getValidatedApiPrefix('foss-v1')).toBe('foss-v1');
      expect(getValidatedApiPrefix('hotel_api')).toBe('hotel_api');
    });
  });

  describe('URL normalization logic', () => {
    function executeMiddleware(
      initialUrl: string,
      customPrefix?: string,
    ): string {
      const middleware = createIngressPrefixMiddleware(customPrefix);
      const req = { url: initialUrl } as Request;
      const res = {} as Response;
      const next = jest.fn() as unknown as NextFunction;

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      return req.url;
    }

    it('normalizes prefixed menu path: /foss/menu -> /menu', () => {
      expect(executeMiddleware('/foss/menu')).toBe('/menu');
    });

    it('preserves query strings when normalizing: /foss/menu?category=Starters -> /menu?category=Starters', () => {
      expect(executeMiddleware('/foss/menu?category=Starters')).toBe(
        '/menu?category=Starters',
      );
    });

    it('normalizes root prefix with trailing slash: /foss/ -> /', () => {
      expect(executeMiddleware('/foss/')).toBe('/');
    });

    it('normalizes root prefix without trailing slash: /foss -> /', () => {
      expect(executeMiddleware('/foss')).toBe('/');
    });

    it('normalizes root prefix with query: /foss?tab=active -> /?tab=active', () => {
      expect(executeMiddleware('/foss?tab=active')).toBe('/?tab=active');
    });

    it('normalizes health probes: /foss/health/ready -> /health/ready', () => {
      expect(executeMiddleware('/foss/health/ready')).toBe('/health/ready');
      expect(executeMiddleware('/foss/health/live')).toBe('/health/live');
    });

    it('normalizes internal webhooks: /foss/guest-sessions/internal/events/checkout', () => {
      expect(
        executeMiddleware('/foss/guest-sessions/internal/events/checkout'),
      ).toBe('/guest-sessions/internal/events/checkout');
    });

    it('does NOT modify similar path segments like /fossils', () => {
      expect(executeMiddleware('/fossils')).toBe('/fossils');
      expect(executeMiddleware('/fossils/amber')).toBe('/fossils/amber');
    });

    it('does NOT modify hyphenated sibling paths like /foss-preview', () => {
      expect(executeMiddleware('/foss-preview/menu')).toBe(
        '/foss-preview/menu',
      );
    });

    it('does NOT modify already-unprefixed paths: /menu remains /menu', () => {
      expect(executeMiddleware('/menu')).toBe('/menu');
      expect(executeMiddleware('/health/ready')).toBe('/health/ready');
      expect(executeMiddleware('/guest-sessions/qr')).toBe(
        '/guest-sessions/qr',
      );
    });

    it('supports custom prefix when configured', () => {
      expect(executeMiddleware('/v1/menu', 'v1')).toBe('/menu');
      expect(executeMiddleware('/foss/menu', 'v1')).toBe('/foss/menu');
    });
  });
});
