import { config } from 'dotenv'

export function register() {
  // Claude for Desktop injects ANTHROPIC_API_KEY="" into the environment.
  // Next.js dotenv won't override existing vars, so force-load .env
  // for any keys that exist but are empty.
  config({ override: true })
}
