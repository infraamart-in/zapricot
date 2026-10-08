// Vercel serverless function: POST /api/register. All logic lives in ../server/register.ts.
import { handleRegister, type Env } from '../server/register'

export async function POST(request: Request): Promise<Response> {
  return handleRegister(request, process.env as Env)
}

export async function GET(request: Request): Promise<Response> {
  return handleRegister(request, process.env as Env)
}
