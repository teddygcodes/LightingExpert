import { NextResponse } from 'next/server'

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function apiNotFound(resource = 'Resource') {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
}

export function apiServerError(message = 'Internal server error') {
  return NextResponse.json({ error: message }, { status: 500 })
}
