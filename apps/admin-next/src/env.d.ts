/// <reference types="astro/client" />
import type {} from '@gamo/auth/app-locals';

declare global {
  namespace App {
    interface Locals {
      /** Set when the sign-in page is shown in place of a protected URL (the response stays 401). */
      signIn?: { reason: 'required' | 'denied'; next: string; email?: string };
    }
  }
}
